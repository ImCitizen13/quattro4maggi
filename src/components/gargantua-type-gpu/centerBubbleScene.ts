import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import type { LayerSceneResult, SceneProps } from "./composeLayered";
import { centerBubbleBindGroupLayout } from "./layouts";

/**
 * Center-bubble scene — a port of the SKSL `BShader` ([temp/BShader.ts]) to
 * typegpu/WGSL. Renders a single glassy bubble at the screen center with
 * radius 50 px (configurable via {@link CenterBubbleConfig.radiusPx}).
 *
 * The bubble samples the cumulative output of all prior layers via the
 * composer-supplied `backdrop` view (so it gets a true lens distortion + rim
 * chromatic aberration). Outside the bubble the layer just passes the
 * backdrop through, optionally darkened slightly inside the soft shadow halo.
 *
 * Most style values (specular intensity, prism colors, shadow opacity,
 * refraction strength) are baked into the WGSL fragment as constants. Only
 * the canvas size + bubble radius — values that change with resize — flow
 * through a uniform.
 */
export interface CenterBubbleConfig {
  /** Bubble radius in pixels. Defaults to 50. */
  radiusPx?: number;
  /**
   * Shape exponent (superellipse `n`). Controls how the shape's iso-contour
   * is computed:
   * - `2` (default) — Euclidean norm → **circle**.
   * - `4`–`8` — squircle / rounded square. Higher = sharper corners.
   * - `16`+ — visually indistinguishable from a hard **square**.
   * - `<2` (e.g. `1`) — star/diamond shapes (pinched axes).
   *
   * Mathematically: the bubble outline is the level set
   * `(|x|/r)^n + (|y|/r)^n = 1`. The same exponent reshapes the halo, rim
   * chromatic-aberration band, and lens-distortion radius simultaneously,
   * so the entire glass effect deforms together.
   */
  shapeN?: number;
  /**
   * Flip the sign of the lens displacement so the bubble's interior appears
   * to push its sampled content **outward** instead of pulling it inward.
   *
   * - `false` (default) — barrel/magnify: samples are taken from coords
   *   pulled toward the bubble center, so the backdrop appears bowed out
   *   (like a magnifying glass / convex lens).
   * - `true` — pincushion/repel: samples are taken from coords pushed away
   *   from the center, so the backdrop appears bowed inward (concave lens
   *   / fisheye-on-itself). Anything inside the bubble's field looks like
   *   it's moving in the opposite direction relative to the lens axis.
   *
   * Implementation note: this flag is encoded into the **sign** of the
   * `shapeN` slot in the params uniform (magnitude is still the superellipse
   * exponent — see `shapeN` doc). Costs zero extra uniform bytes.
   */
  invertDistortion?: boolean;
}

const DEFAULT_RADIUS_PX = 200;
const DEFAULT_SHAPE_N = 2.0;

/**
 * Vertex stage. Emits a fullscreen quad (NDC `[-1, 1]²`) so the layer covers
 * the entire viewport. Outside the bubble the fragment passes the backdrop
 * through verbatim — the bubble is just a localized lens on top.
 *
 * The `uv` output is in [0, 1] screen-space, used directly as the backdrop
 * sample coord (no Y flip; the offscreen texture is laid out top-down).
 */
const vertexFn = ({ $vertexIndex }: { $vertexIndex: number }) => {
  "use gpu";
  const corners = d.arrayOf(
    d.vec2f,
    6,
  )([
    d.vec2f(-1.0, -1.0),
    d.vec2f(1.0, -1.0),
    d.vec2f(-1.0, 1.0),
    d.vec2f(-1.0, 1.0),
    d.vec2f(1.0, -1.0),
    d.vec2f(1.0, 1.0),
  ]);
  const c = corners[$vertexIndex];
  return {
    $position: d.vec4f(c.x, c.y, 0.0, 1.0),
    // Map clip-space corner → screen-uv. Y flips because NDC Y is up but
    // texture rows are top-down.
    uv: d.vec2f((c.x + 1.0) * 0.5, 1.0 - (c.y + 1.0) * 0.5),
  };
};

/**
 * Fragment stage. The layer covers the whole viewport (`uv` is screen-UV),
 * so the bubble is just a localized lens at the canvas center. Outside the
 * bubble + halo region the fragment passes the backdrop through verbatim.
 *
 * `uv` is laid out (0,0)=top-left, (1,1)=bottom-right (matches WebGPU
 * texture sampling), so positive `ly` means *below* the bubble center —
 * which matches the original SKSL's pixel-Y-down convention used in
 * `atan2(diff.y, diff.x)` and the upper-left specular `lightDir = (-0.4, -0.6)`.
 */
const fragmentFn = ({ uv }: { uv: d.v2f }) => {
  "use gpu";
  const params = centerBubbleBindGroupLayout.$.params;
  const cw = params.x;
  const ch = params.y;
  const radiusPx = params.z;
  // `params.w` packs two pieces of state to keep the uniform a single vec4f:
  //   - magnitude → superellipse exponent `n` (n=2 circle, n→∞ square, n=1 diamond).
  //   - sign      → lens-distortion direction. +1 pulls samples toward the
  //     center (default barrel/magnify); -1 pushes them outward (pincushion
  //     / "field moves opposite").
  const shapeN = std.abs(params.w);
  const invertSign = std.sign(params.w);

  // Pixel offset from canvas center (= bubble center).
  const lx = (uv.x - 0.5) * cw;
  const ly = (uv.y - 0.5) * ch;

  // ── Shape-driven distance (p-norm) ───────────────────────────────────────
  // We normalize *before* raising to the exponent so high `n` (e.g. 32) can't
  // overflow fp32 — without this, pow(1000, 32) ≈ 1e96 wipes out precision.
  // After normalization the values are in [0, ~1.4] and pow stays well-behaved.
  const ax = std.pow(std.abs(lx) / radiusPx, shapeN);
  const ay = std.pow(std.abs(ly) / radiusPx, shapeN);
  const normDist = std.pow(ax + ay, 1.0 / shapeN);
  const dist = normDist * radiusPx;

  // Direction from center for the lens-distortion offset. We deliberately
  // keep this Euclidean (not p-norm-derived) so the displacement stays a
  // true unit vector — using the shape distance for normalization would
  // stretch the offset at corners on non-circular shapes.
  const radial = std.length(d.vec2f(lx, ly));
  const safeRadial = std.max(radial, 0.001);
  const dirX = lx / safeRadial;
  const dirY = ly / safeRadial;

  // Backdrop sample at this fragment (no distortion — used outside + as fallback).
  const baseSample = std.textureSample(
    centerBubbleBindGroupLayout.$.backdrop,
    centerBubbleBindGroupLayout.$.samp,
    uv,
  );

  // Soft AA edge: 1 inside the bubble, 0 outside, smooth over 1.5 px.
  const mask = std.smoothstep(radiusPx + 1.5, radiusPx - 1.5, dist);

  // Shadow halo just outside the bubble — dark-mode preset: light halo on
  // dark bg. Matches the working SKSL config:
  //   u_shadowSpread = 0.2, u_shadowOpacity = 0.15, u_shadowColor = (1,1,1).
  const shadowSpread = 0.2;
  const shadowOpacity = 0.15;
  const shadowEdge = radiusPx + radiusPx * shadowSpread;
  const shadowAlpha =
    std.smoothstep(shadowEdge, radiusPx, dist) * shadowOpacity;

  // ── Lens distortion (barrel / pincushion) ───────────────────────────────
  // Shift the sample coord along the radial axis; magnitude grows with
  // squared normalized distance so the very rim refracts strongly and the
  // dead-center barely shifts. SKSL: u_refraction = 0.5.
  //
  // `invertSign` flips the displacement direction:
  //   +1 → subtract: sample from a coord *closer to center* (barrel/magnify).
  //   -1 → add:       sample from a coord *farther from center* (pincushion).
  // The signed offset is the only thing that distinguishes the two modes —
  // every downstream effect (chroma, rim, specular) reads from this coord.
  const refraction = 0.5;
  const t = normDist * normDist;
  const distortPx = refraction * t * radiusPx;
  const distortedUx = uv.x - invertSign * dirX * (distortPx / cw);
  const distortedUy = uv.y - invertSign * dirY * (distortPx / ch);
  const distortedSample = std.textureSample(
    centerBubbleBindGroupLayout.$.backdrop,
    centerBubbleBindGroupLayout.$.samp,
    d.vec2f(distortedUx, distortedUy),
  );

  // ── Chromatic aberration at the rim ──────────────────────────────────────
  // SKSL: u_edgeWidth = 0.1, u_dispersion = 0.9.
  const edgeWidth = 0.1;
  const edgeStart = 1.0 - edgeWidth;
  const edgeFactor = std.smoothstep(edgeStart, 1.0, normDist);
  const dispersion = 0.9;
  const chromaPx = dispersion * edgeFactor * radiusPx;
  const sampleR = std.textureSample(
    centerBubbleBindGroupLayout.$.backdrop,
    centerBubbleBindGroupLayout.$.samp,
    d.vec2f(
      distortedUx + dirX * (chromaPx / cw),
      distortedUy + dirY * (chromaPx / ch),
    ),
  );
  const sampleB = std.textureSample(
    centerBubbleBindGroupLayout.$.backdrop,
    centerBubbleBindGroupLayout.$.samp,
    d.vec2f(
      distortedUx - dirX * (chromaPx / cw),
      distortedUy - dirY * (chromaPx / ch),
    ),
  );
  const chromaRgb = d.vec3f(sampleR.x, distortedSample.y, sampleB.z);
  const distortedRgb = d.vec3f(
    distortedSample.x,
    distortedSample.y,
    distortedSample.z,
  );
  const interior = std.mix(distortedRgb, chromaRgb, edgeFactor);

  // ── Prismatic rim (6-stop rainbow) ───────────────────────────────────────
  const angle = std.atan2(ly, lx);
  const PI2 = 6.28318530718;
  const hue = std.fract(angle / PI2 + 0.5);
  const segment = hue * 6.0;
  const idx = std.floor(segment);
  const f = segment - idx;

  const c0 = d.vec3f(1.0, 0.0, 0.0); // red
  const c1 = d.vec3f(1.0, 1.0, 0.0); // yellow
  const c2 = d.vec3f(0.0, 1.0, 0.0); // green
  const c3 = d.vec3f(0.0, 1.0, 1.0); // cyan
  const c4 = d.vec3f(0.0, 0.0, 1.0); // blue
  const c5 = d.vec3f(1.0, 0.0, 1.0); // magenta

  let rainbow = std.mix(c5, c0, f);
  if (idx < 1.0) {
    rainbow = std.mix(c0, c1, f);
  } else if (idx < 2.0) {
    rainbow = std.mix(c1, c2, f);
  } else if (idx < 3.0) {
    rainbow = std.mix(c2, c3, f);
  } else if (idx < 4.0) {
    rainbow = std.mix(c3, c4, f);
  } else if (idx < 5.0) {
    rainbow = std.mix(c4, c5, f);
  }

  // ── Specular highlight ───────────────────────────────────────────────────
  // SKSL: u_specular = 1.0.
  const lightDir = d.vec2f(-0.4, -0.6);
  const normCenter = std.normalize(d.vec2f(lx / radiusPx, ly / radiusPx));
  const specDot = std.max(std.dot(normCenter, lightDir), 0.0);
  const specularBoost = 1.0;
  const specular =
    (std.pow(specDot, 32.0) * 0.6 + std.pow(specDot, 8.0) * 0.15) *
    specularBoost;

  // Blend rim color into interior; add additive rim glow + specular.
  // SKSL constants: 0.15 mix, 0.05 additive.
  const withRim = std.add(
    std.mix(interior, rainbow, edgeFactor * 0.15),
    std.mul(rainbow, edgeFactor * 0.05),
  );
  const lit = std.add(withRim, d.vec3f(specular, specular, specular));

  // Outside the bubble: backdrop, optionally tinted by halo. Dark-mode preset
  // tints toward white so the halo *brightens* the surrounding starfield;
  // SKSL: u_shadowColor = (1,1,1) on dark backgrounds.
  const baseRgb = d.vec3f(baseSample.x, baseSample.y, baseSample.z);
  const shadowColor = d.vec3f(1.0, 1.0, 1.0);
  const outside = std.mix(baseRgb, shadowColor, shadowAlpha);

  // Compose: smooth between outside (backdrop) and bubble interior across the rim.
  const finalRgb = std.mix(outside, lit, mask);
  return d.vec4f(finalRgb.x, finalRgb.y, finalRgb.z, 1.0);
};

/**
 * Scene factory for the center bubble. Conforms to the layered-scene
 * contract — must be used as a `readsBackdrop: true` layer inside
 * {@link composeLayered} so the composer feeds a non-null backdrop view.
 */
export function createCenterBubbleScene(config: CenterBubbleConfig = {}) {
  const radiusPx = config.radiusPx ?? DEFAULT_RADIUS_PX;
  // Clamp to >=1 to avoid degenerate norms (n=0 collapses pow to 1 everywhere;
  // very small fractional n produces extremely concave shapes that look broken).
  const shapeMag = Math.max(1, config.shapeN ?? DEFAULT_SHAPE_N);
  // Pack the invert flag into the sign: -shapeMag → pincushion, +shapeMag → barrel.
  // The shader splits these back apart with sign()/abs() on params.w.
  const shapeN = config.invertDistortion ? -shapeMag : shapeMag;

  return ({
    device,
    presentationFormat,
    canvas,
  }: SceneProps): LayerSceneResult => {
    const root = tgpu.initFromDevice({ device });

    const sampler = root.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    /** Uniform: (canvasW_px, canvasH_px, radiusPx, shapeN). */
    const paramsBuffer = root
      .createBuffer(
        d.vec4f,
        d.vec4f(
          Math.max(1, canvas.width),
          Math.max(1, canvas.height),
          radiusPx,
          shapeN,
        ),
      )
      .$usage("uniform");



    const pipeline = root.createRenderPipeline({
      primitive: { topology: "triangle-list" },
      vertex: vertexFn,
      fragment: fragmentFn,
      // No blend: the shader reconstructs the full output from the sampled
      // backdrop, so the layer clears/overwrites its target rather than
      // alpha-blending over it.
      targets: { format: presentationFormat },
    });

    return {
      render: (_t, attachment, backdrop) => {
        if (!backdrop) {
          // Defensive: this scene must be configured with readsBackdrop=true.
          // Without a backdrop there's nothing to sample → skip.
          return;
        }
        // Bind group is recreated each frame because `backdrop` ping-pongs
        // between two views; bind-group creation is cheap (descriptor-only).
        const bindGroup = root.createBindGroup(centerBubbleBindGroupLayout, {
          params: paramsBuffer,
          samp: sampler,
          backdrop,
        });

        const encoder = root.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: attachment.view,
              clearValue: [0, 0, 0, 0],
              loadOp: attachment.loadOp,
              storeOp: "store",
            },
          ],
        });
        pipeline.with(pass).with(bindGroup).draw(6);
        pass.end();
        root.device.queue.submit([encoder.finish()]);
      },
      cleanup: () => {
        paramsBuffer.destroy();
        root.destroy();
      },
      resize: () => {
        // canvas.width/height have already been updated by useWebGPU.
        paramsBuffer.write(
          d.vec4f(
            Math.max(1, canvas.width),
            Math.max(1, canvas.height),
            radiusPx,
            shapeN,
          ),
        );
      },
    };
  };
}
