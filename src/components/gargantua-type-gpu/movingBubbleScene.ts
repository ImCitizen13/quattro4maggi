import { AlphaType, ColorType, SkData, Skia } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";
import tgpu, { AutoVertexIn } from "typegpu";
import * as d from "typegpu/data";
// `vec2f`/`vec4f` are imported by NAME as well as through the `d` namespace.
// The worklets plugin only forwards named and default import specifiers into a
// worklet — `isImport` in its plugin rejects `ImportNamespaceSpecifier` — so a
// `d.*` call inside a `'worklet'` render would capture the whole `typegpu/data`
// namespace BY VALUE and serialize it, which TypeGPU schemas do not survive.
// Referencing the named binding instead lets `importForwarding` re-import it
// natively on the UI runtime. `d.*` stays fine everywhere outside worklets
// (shader definitions, type positions, setup code).
import { vec4f } from "typegpu/data";
import * as std from "typegpu/std";
import { movingBubbleBindGroupLayout } from "./layouts";
import {
  advanceSprite,
  hasExited,
  makeParams,
  projectSprite,
  type SpriteParams,
  type SpriteState,
  spawnSprite,
} from "./movingBubbleMath";
import { perf } from "./perf/perfMarks";

/**
 * Props handed to the scene factory by the WebGPU lifecycle hook each mount.
 * Mirrors the shape of `useWebGPU`'s `SceneProps` (subset used here).
 */
interface BubbleSceneProps {
  /** Configured canvas context whose swapchain we draw into. */
  context: GPUCanvasContext;
  /** Logical GPU device used to create pipelines, buffers, bind groups. */
  device: GPUDevice;
  /** Swapchain texture format (e.g. "bgra8unorm") — pipeline target must match. */
  presentationFormat: GPUTextureFormat;
  /** Canvas width in layout points (pre-DPR). Unused here but part of the contract. */
  canvasWidth: number;
  /** Canvas height in layout points (pre-DPR). Unused here but part of the contract. */
  canvasHeight: number;
}

/**
 * Configuration for {@link createBubbleScene}.
 */
interface BubbleConfig {
  /**
   * Encoded sprite image bytes (PNG/JPEG). The scene factory decodes each via
   * Skia and uploads it as a `GPUTexture` on the device passed in scene props,
   * so the resulting textures are guaranteed to belong to the rendering device.
   * One draw call is issued per texture (no atlas/array batching) — intended
   * for small N (~tens).
   */
  datas: SkData[];
  /**
   * Multiplier applied to every sprite's z-decrement. >1 = faster overall flow,
   * <1 = slower. Per-sprite jitter (`speedMin`/`speedMax`) is layered on top.
   * Defaults to {@link DEFAULTS.speedFactor}.
   */
  speedFactor?: number;
  /**
   * `[min, max]` NDC width range for a sprite's *target* on-screen size at the
   * closest depth. Each sprite's `finalSize` is sampled uniformly from this
   * range. Defaults to `[DEFAULTS.sizeMin, DEFAULTS.sizeMax]`.
   */
  sizeRange?: [number, number];
  /**
   * Read each frame. When true, sprites fade in toward full opacity; when
   * false, they fade out to 0. Used to gate the bubble layer on the same
   * "going forward" toggle the starfield consumes, so bubbles only appear
   * during forward flight.
   */
  forwardEnabled?: SharedValue<boolean>;
  /**
   * Direction the depth-wipe sweeps in on fade-in.
   * - `"far-to-near"` (default): sprites at the deepest depths emerge first,
   *   then progressively closer ones — like things "approaching" out of the
   *   distance.
   * - `"near-to-far"`: the closest sprites appear first, then the wipe walks
   *   outward into the distance.
   * Fade-out always sweeps in the opposite direction of fade-in.
   */
  fadeDirection?: "far-to-near" | "near-to-far";
  /**
   * How fast the wipe progresses. Tracks the forward toggle with an
   * exponential lerp at this rate. Higher = snappier (e.g. 10 ≈ 100 ms);
   * lower = slower / more cinematic (e.g. 1 ≈ 1 s). Default 5 (~200 ms).
   */
  fadeRate?: number;
}

/**
 * Decode a Skia-loaded encoded image into a `GPUTexture` on the given device.
 *
 * Pixels are read as `RGBA_8888` / `Unpremul` to match the `rgba8unorm`
 * texture format and the straight-alpha blending used by the sprite pipeline.
 * The transient `SkImage` is disposed immediately after `readPixels` to keep
 * Skia's atlas heap bounded when batch-uploading many assets.
 *
 * @param device - GPU device used to allocate the texture and submit upload.
 * @param data - Encoded image bytes (PNG/JPEG) wrapped in `SkData`.
 * @returns A populated `GPUTexture`, or `null` if decoding/reading fails.
 */
function skDataToTexture(device: GPUDevice, data: SkData): GPUTexture | null {
  const img = perf.measure("decode", () =>
    Skia.Image.MakeImageFromEncoded(data),
  );
  if (!img) return null;

  const width = img.width();
  const height = img.height();
  const pixels = perf.measure("readPixels", () =>
    img.readPixels(0, 0, {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    }),
  );
  if ("dispose" in img && typeof img.dispose === "function") {
    img.dispose();
  }
  if (!pixels) return null;

  // Measures JS-side encode only; writeTexture queues the upload, actual GPU work happens later.
  return perf.measure("createTexture+write", () => {
    const texture = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture },
      pixels.buffer,
      { bytesPerRow: width * 4, rowsPerImage: height },
      [width, height],
    );
    return texture;
  });
}

/**
 * Vertex stage for the textured-quad sprite pipeline.
 *
 * Synthesizes 6 vertices (two triangles) from the vertex index — no vertex
 * buffer needed. The unit-square corner is scaled and translated by the
 * sprite's `(x, y, w, h)` rect read from the bind-group uniform, producing
 * clip-space positions directly. The `uv` output (location auto-assigned by
 * typegpu) is forwarded to the fragment stage with Y flipped so top-down
 * decoded image rows display upright in NDC where +Y is up.
 */
// OLD
// const bubbleVertexFn = tgpu["~unstable"].vertexFn({
//   in: { vertexIndex: d.builtin.vertexIndex },
//   out: { outPos: d.builtin.position, uv: d.vec2f },
// })(({ vertexIndex }) => {
//   const corners = d.arrayOf(
//     d.vec2f,
//     6,
//   )([
//     d.vec2f(0.0, 0.0),
//     d.vec2f(1.0, 0.0),
//     d.vec2f(0.0, 1.0),
//     d.vec2f(0.0, 1.0),
//     d.vec2f(1.0, 0.0),
//     d.vec2f(1.0, 1.0),
//   ]);
//   const c = corners[vertexIndex];
//   const p = std.add(
//     d.vec2f(movingBubbleBindGroupLayout.$.rect.x, movingBubbleBindGroupLayout.$.rect.y),
//     std.mul(
//       c,
//       d.vec2f(movingBubbleBindGroupLayout.$.rect.z, movingBubbleBindGroupLayout.$.rect.w),
//     ),
//   );
//   return {
//     outPos: d.vec4f(p.x, p.y, 0.0, 1.0),
//     uv: d.vec2f(c.x, 1.0 - c.y),
//   };
// });

// WRONG
//const bubbleVertexFunction = ({ vertexIndex } : { vertexIndex: number }): ({ outPos: d.v4f, uv: d.v2f }) => {
// NEW
const bubbleVertexFunction = ({ $vertexIndex: vid }: { $vertexIndex: number }) => {
  'use gpu';
  const corners = d.arrayOf(
    d.vec2f,
    6,
  )([
    d.vec2f(0.0, 0.0),
    d.vec2f(1.0, 0.0),
    d.vec2f(0.0, 1.0),
    d.vec2f(0.0, 1.0),
    d.vec2f(1.0, 0.0),
    d.vec2f(1.0, 1.0),
  ]);
  const c = corners[vid];
  const p = std.add(
    d.vec2f(
      movingBubbleBindGroupLayout.$.rect.x,
      movingBubbleBindGroupLayout.$.rect.y,
    ),
    std.mul(
      c,
      d.vec2f(
        movingBubbleBindGroupLayout.$.rect.z,
        movingBubbleBindGroupLayout.$.rect.w,
      ),
    ),
  );
  return {
    $position: d.vec4f(p.x, p.y, 0.0, 1.0),
    uv: d.vec2f(c.x, 1.0 - c.y),
  };
};
/**
 * Fragment stage for the textured-quad sprite pipeline.
 *
 * Samples the bound texture at the interpolated UV using the bound filtering
 * sampler. The pipeline's blend state combines the result with the swapchain
 * via straight alpha blending.
 */

// OLD
// const bubbleFragmentFn = tgpu["~unstable"].fragmentFn({
//   in: { uv: d.vec2f },
//   out: d.vec4f,
// })(({ uv }) => {
//   const sample = std.textureSample(
//     movingBubbleBindGroupLayout.$.tex,
//     movingBubbleBindGroupLayout.$.samp,
//     uv,
//   );
//   // params.x = per-sprite alpha multiplier (depth-driven fade-out).
//   const a = movingBubbleBindGroupLayout.$.params.x;
//   return d.vec4f(sample.x, sample.y, sample.z, sample.w * a);
// });

// NEW
const bubbleFragmentFunction = ({ uv }: { uv: d.v2f }): d.v4f => {
  "use gpu";
  const sample = std.textureSample(
    movingBubbleBindGroupLayout.$.tex,
    movingBubbleBindGroupLayout.$.samp,
    uv,
  );
  // params.x = per-sprite alpha multiplier (depth-driven fade-out).
  const a = movingBubbleBindGroupLayout.$.params.x;
  return d.vec4f(sample.x, sample.y, sample.z, sample.w * a);
};

/**
 * Create a scene factory that composites a grid of textured sprites on top of
 * the existing swapchain contents using straight alpha blending.
 *
 * The render pass uses `loadOp: "load"` so it preserves whatever an earlier
 * pass (e.g. the starfield) wrote into the same frame's swapchain texture.
 * All N sprite draws share a single render pass via `root.beginRenderPass`.
 *
 * @param config - {@link BubbleConfig} carrying the encoded sprite bytes.
 * @returns A scene factory consumed by `useWebGPU`.
 */
export function createBubbleScene(config: BubbleConfig) {
  return ({
    device,
    presentationFormat,
    canvasWidth,
    canvasHeight,
  }: BubbleSceneProps) => {
    /** Typegpu root wrapping the rendering device. */
    const root = tgpu.initFromDevice({ device });

    /** Filtering sampler shared across all sprites. */
    const sampler = root.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    /**
     * Render pipeline with straight-alpha blending so transparent PNG edges
     * layer cleanly over the prior pass.
     */

    // NEW pipeline
    // const pipeline = root.createRenderPipeline({
    //   primitive: { topology: 'triangle-list' },
    //   vertex: bubbleVertexFn,
    //   fragment: bubbleFragmentFn
    // })

    // OLD pipeline
    // const pipeline = root["~unstable"]
    //   .withVertex(bubbleVertexFn, {})
    //   .withFragment(bubbleFragmentFn, {
    //     format: presentationFormat,
    //     blend: {
    //       color: {
    //         srcFactor: "src-alpha",
    //         dstFactor: "one-minus-src-alpha",
    //         operation: "add",
    //       },
    //       alpha: {
    //         srcFactor: "one",
    //         dstFactor: "one-minus-src-alpha",
    //         operation: "add",
    //       },
    //     },
    //   })
    //   .withPrimitive({ topology: "triangle-list" })
    //   .createPipeline();
    // NEW
    const pipeline = root.createRenderPipeline({
      primitive: { topology: "triangle-list" },
      vertex: bubbleVertexFunction,
      fragment: bubbleFragmentFunction,
      targets: {
        format: presentationFormat,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
        },
      },
    });
    /**
     * Decode + upload each `SkData` to a `GPUTexture` on THIS device. Done
     * inside the factory (not in the loader hook) to guarantee the textures
     * belong to the same device that will bind and draw them — mismatches
     * trigger "is associated with [Device], and cannot be used with [Device]"
     * validation errors.
     */
    const textures = config.datas
      .map((dat) => skDataToTexture(device, dat))
      .filter((t): t is GPUTexture => t !== null);

    /**
     * Build the immutable simulation-parameter set from caller overrides. The
     * actual per-frame math lives in `./movingBubbleMath` (pure, unit-tested).
     */
    const params: SpriteParams = makeParams({
      ...(config.speedFactor !== undefined
        ? { speedFactor: config.speedFactor }
        : {}),
      ...(config.sizeRange !== undefined
        ? { sizeMin: config.sizeRange[0], sizeMax: config.sizeRange[1] }
        : {}),
    });

    // Mutable canvas dims so resize can update aspect compensation + spawn radius.
    let cw = canvasWidth;
    let ch = canvasHeight;

    /**
     * Initial sprite states. Each sprite is freshly spawned, then its `z` is
     * randomized along the depth range so the first wave isn't synchronized.
     * We also push `age` past `spawnDuration` so initial sprites don't all
     * scale-from-zero at once on mount.
     */
    const states: SpriteState[] = textures.map(() => {
      const s: SpriteState = {
        worldX: 0,
        worldY: 0,
        z: 0,
        speed: 0,
        age: 0,
        finalSize: 0,
      };
      spawnSprite(s, params, ch);
      s.z = params.zNear * 2 + Math.random() * (params.zFar - params.zNear * 2);
      s.age = params.spawnDuration; // skip fade-in for the first cohort
      return s;
    });

    /**
     * Per-sprite GPU resources: two uniform buffers (`rect` for placement,
     * `params` for alpha + reserved scalars) plus the bind group wiring them
     * to the moving-bubble layout alongside the shared sampler and texture.
     */
    const items = textures.map((tex, i) => {
      const initialProj = projectSprite(states[i], params, cw, ch);
      const rectBuffer = root
        .createBuffer(
          d.vec4f,
          d.vec4f(initialProj.x, initialProj.y, initialProj.w, initialProj.h),
        )
        .$usage("uniform");
      const paramsBuffer = root
        .createBuffer(d.vec4f, d.vec4f(initialProj.alpha, 0, 0, 0))
        .$usage("uniform");

      const bindGroup = root.createBindGroup(movingBubbleBindGroupLayout, {
        rect: rectBuffer,
        params: paramsBuffer,
        samp: sampler,
        tex: tex.createView(),
      });
      return { rectBuffer, paramsBuffer, bindGroup };
    });

    let lastMs = 0;
    /**
     * Global on/off alpha gating the entire layer. Lerps toward 1 while the
     * forward toggle is on, toward 0 when it's off. Initial value 0 so a
     * mount with `forwardEnabled = false` starts hidden and fades in only
     * once the user engages forward flight.
     */
    let globalAlpha = config.forwardEnabled?.value ? 1 : 0;

    return {
      /**
       * Draw all sprites for the current frame inside a single render pass
       * (`loadOp: "load"` preserves the prior starfield pass's contents).
       *
       * Per-frame work: advance each sprite via {@link advanceSprite}, project
       * to NDC + alpha via {@link projectSprite}, write both uniforms, and
       * respawn any sprite whose rect has fully cleared the viewport.
       */
      render: (
        timestamp: number,
        attachment: { view: GPUTextureView; loadOp: "clear" | "load" },
        _backdrop: GPUTextureView | null,
      ) => {
        "worklet";
        // Runs on the Reanimated UI runtime in `ui-worklet` mode. A
        // `'worklet'`-marked function is still an ordinary callable JS
        // function, so `js-raf` invokes it directly and unchanged.
        const t = timestamp ?? performance.now();
        // Cap dt so a long stall (tab-suspend, JS hitch) doesn't teleport every
        // sprite past the camera in a single frame and blank the screen.
        const dt = lastMs === 0 ? 0 : Math.min((t - lastMs) / 1000, 0.05);
        lastMs = t;

        // Track the forward toggle with a framerate-independent exponential
        // lerp so the wipe progresses at the same rate at any cadence.
        const fadeRate = config.fadeRate ?? 2;
        const target = config.forwardEnabled?.value ? 1 : 0;
        const blend = 1 - Math.exp(-dt * fadeRate);
        globalAlpha += (target - globalAlpha) * blend;

        // ── Depth-wipe gating ───────────────────────────────────────────
        // Instead of multiplying every sprite's alpha by the same scalar
        // (which fades the whole layer in lock-step), we sweep a visibility
        // "front" through the depth range. Direction is configurable:
        //
        // - `"far-to-near"` (default): on fade-in, the front starts beyond
        //   `zFar` and walks toward `zNear`. A sprite at depth `z` is
        //   visible when `z > front` — so deepest sprites cross the front
        //   (and become visible) first.
        // - `"near-to-far"`: front starts before `zNear` and walks toward
        //   `zFar`. Visibility flips: visible when `z < front`. Closest
        //   sprites appear first, then progressively deeper ones.
        const depthSpan = params.zFar - params.zNear;
        const wipeWidth = depthSpan * 0.18;
        const farToNear = config.fadeDirection !== "far-to-near";
        const wipeFront = farToNear
          ? params.zFar + wipeWidth - (depthSpan + 2 * wipeWidth) * globalAlpha
          : params.zNear -
            wipeWidth +
            (depthSpan + 2 * wipeWidth) * globalAlpha;

        for (let i = 0; i < states.length; i++) {
          const s = states[i];
          advanceSprite(s, params, dt);
          let proj = projectSprite(s, params, cw, ch);
          if (hasExited(proj) || s.z <= params.zNear) {
            spawnSprite(s, params, ch);
            proj = projectSprite(s, params, cw, ch);
          }
          // Per-sprite visibility: smooth transition across the wipe band.
          // For `far-to-near`: visible when z > front (sprite is past the front).
          // For `near-to-far`: visible when z < front (front has reached the sprite).
          const tRaw = (s.z - (wipeFront - wipeWidth)) / (2 * wipeWidth);
          const t = Math.max(0, Math.min(1, tRaw));
          const smooth = t * t * (3 - 2 * t);
          const visibility = farToNear ? smooth : 1 - smooth;

          items[i].rectBuffer.write(vec4f(proj.x, proj.y, proj.w, proj.h));
          items[i].paramsBuffer.write(
            vec4f(proj.alpha * visibility, 0, 0, 0),
          );
        }

        // NEW
        const encoder = root.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [                      // raw GPU descriptor → ARRAY
            {
              view: attachment.view,
              loadOp: attachment.loadOp,
              storeOp: "store",
              ...(attachment.loadOp === "clear"
                ? { clearValue: [0, 0, 0, 0] as const }
                : {}),
            },
          ],
        });

        for (const { bindGroup } of items) {
          pipeline.with(pass).with(bindGroup).draw(6);
        }

        pass.end();
        root.device.queue.submit([encoder.finish()]);   // raw submit, not encoder.submit()


        // OLD
        // root["~unstable"].beginRenderPass(
        //   {
        //     colorAttachments: [
        //       {
        //         view: attachment.view,
        //         loadOp: attachment.loadOp,
        //         storeOp: "store",
        //         ...(attachment.loadOp === "clear"
        //           ? { clearValue: [0, 0, 0, 0] as const }
        //           : {}),
        //       },
        //     ],
        //   },
        //   (pass) => {
        //     pass.setPipeline(pipeline);
        //     for (const { bindGroup } of items) {
        //       pass.setBindGroup(movingBubbleBindGroupLayout, bindGroup);
        //       pass.draw(6);
        //     }
        //   },
        // );
      },
      /**
       * Release per-sprite uniform buffers, the GPU textures decoded by this
       * factory, and the typegpu root.
       */
      cleanup: () => {
        for (const { rectBuffer, paramsBuffer } of items) {
          rectBuffer.destroy();
          paramsBuffer.destroy();
        }
        for (const tex of textures) tex.destroy();
        root.destroy();
      },
      /**
       * Hook calls this after the canvas is reconfigured at a new size.
       * The animation projects each frame, so we just refresh the cached
       * canvas dims and let the next `render` pick up the new aspect and
       * the new pixel-to-NDC conversion the spawn radius depends on.
       */
      resize: (newW: number, newH: number) => {
        cw = newW;
        ch = newH;
      },
    };
  };
}
