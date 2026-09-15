/**
 * Liquid Bubble Live — harmonic bubble shader, as a BACKDROP image filter
 * (divergence phase 12B, Skia route)
 *
 * A port of `../liquid-glass-bubble/shaders.ts`. The field, the analytic
 * `dr/dθ`, the normal, the refraction sample, the thin film and the dark rim
 * are IDENTICAL line for line. Two things, and only two things, differ:
 *
 * 1. **What `iImage` is.** In the still-image demo it is a child
 *    `<ImageShader>` — a photo, already a texture, mapped onto the bubble.
 *    Here it is the BACKDROP: Skia's snapshot of everything already drawn in
 *    this Canvas, bound automatically to the effect's single `uniform shader`
 *    slot by `SkImageFilters::RuntimeShader`. That is why this effect must
 *    declare EXACTLY ONE child shader — with no explicit child name, Skia
 *    requires the effect to have precisely one, and binds the input to it.
 *
 * 2. **What `iRefract` can be.** The still-image demo caps it at 9 pt because
 *    its `<ImageShader>` rect is only `2·R·1.1` across, so a bigger offset
 *    sampled past the photo's edge and smeared clamped edge pixels into a dark
 *    ring at the rest radius. The backdrop is the whole screen, so that
 *    constraint is gone — see `LIVE_REFRACT` in `liveConfig.ts`.
 *
 * COORDINATE SPACE — MEASURED, NOT ASSUMED
 * A backdrop `RuntimeShader` filter was expected to run in DEVICE PIXELS: the
 * `<Group layer>` note in project memory says "the layer-filter uniforms run
 * in DEVICE pixels → multiply by pd", and `SkRuntimeShaderImageFilter`
 * declares only a translate matrix capability, which usually means Skia bakes
 * the CTM scale into the layer. On iOS with `@shopify/react-native-skia`
 * 2.10.2 that is NOT what happens here. Rendering `half4(p.x/1200, p.y/2600,
 * 0, 1)` from this filter and reading the corner pixels back gave a red ramp
 * reaching ~0.36 at the right edge, not ~1.0 — i.e. `p` tops out near the
 * canvas width in POINTS (~400), not in pixels (~1200). Two consequences,
 * both load-bearing:
 *   - `p` and `iImage.eval(uv)` are both in POINTS, so `iParams` is forwarded
 *     from `useBubbleShape` verbatim with no rescale and no per-frame
 *     allocation, and every line below is byte-for-byte the still-image
 *     shader.
 *   - `p` is ABSOLUTE canvas points, not relative to the backdrop clip. The
 *     bubble lands under the finger with a clip that tracks it, which would
 *     not happen if the clip's top-left were the origin.
 * The memory note is not wrong, it just describes a different setup: there the
 * content had already been scaled by `pd` by the DPR trick's inner `<Group>`,
 * so the filter's space was `pd ×` logical. Nothing scales the content here.
 * The rim was checked at native resolution for the stair-stepping that a
 * logical-resolution intermediate would cause, and it is clean — so the DPR
 * trick is not needed on this path. If this is ever ported to Android, MEASURE
 * IT AGAIN with the same one-line diagnostic rather than trusting this
 * paragraph.
 *
 * FLOW (per pixel, no loop):
 * 1. `q = pp − c` → `dist`, `th` (ONE atan2).
 * 2. ONE pass over the three modes yields BOTH `r` and `dr` (= dr/dθ) from
 *    the same three angle arguments: 3 cos + 3 sin. **`r` is evaluated exactly
 *    once per pixel** — there is no second field evaluation anywhere below,
 *    and no finite-difference normal.
 * 3. `alpha = smoothstep(-0.75, 0.75, r − dist)` — analytic AA, 1.5pt wide.
 * 4. Shell tilt `nz = sqrt(1 − (dist/r)²)`: 1 at the center, 0 at the rim.
 *    Everything optical is weighted by `om = 1 − nz`.
 * 5. The surface normal comes from `r` and `dr` ANALYTICALLY: for
 *    `P(θ) = r(θ)·(cosθ, sinθ)` the outward normal is `radial − tang·(r'/r)`
 *    after normalising, so a wobbly rim bends the normal.
 * 6. `uv = p + n·iRefract·om` samples the backdrop. ONE texture tap. Zero
 *    offset at the center, `iRefract` pt of outward displacement at the rim —
 *    which is why the `BackdropFilter`'s clip must be padded by `iRefract`
 *    (see `liveConfig.ts`): the snapshot is bounded by that clip and returns
 *    TRANSPARENT outside it.
 * 7. Thin film weighted by `om³`, then the dark rim line.
 *
 * The filter's output is composited over the untouched background with
 * src-over (`saveLayer(undefined, null, filter)` then `restore()`), so the
 * `alpha = 0` region outside the bubble leaves the live background showing
 * through — the clip rect is not a visible box.
 */

import { Skia } from '@shopify/react-native-skia';

// ============================================================================
// SkSL source
// ============================================================================

const source = `
uniform float4 iParams[3];   // POINTS: [0] cx,cy,R,_  [1] a2,phi2,a3,phi3  [2] a4,phi4,filmPhase,_
uniform float4 iColor;       // base tint rgb + tint WEIGHT in .a (not opacity)
uniform float  iRefract;     // max refraction sample offset at the rim, POINTS
uniform float  iFilm;        // iridescence strength, 0..1
uniform shader iImage;       // THE BACKDROP — exactly one child shader, bound by Skia

// p arrives in absolute canvas POINTS — measured, see the module doc.
half4 main(float2 p) {
  float2 c         = iParams[0].xy;
  float  R         = iParams[0].z;
  float  a2        = iParams[1].x;
  float  phi2      = iParams[1].y;
  float  a3        = iParams[1].z;
  float  phi3      = iParams[1].w;
  float  a4        = iParams[2].x;
  float  phi4      = iParams[2].y;
  float  filmPhase = iParams[2].z;

  float2 q    = p - c;
  float  dist = length(q);
  float  th   = atan(q.y, q.x);

  // Shared harmonic arguments: r AND dr/dtheta fall out of ONE pass over the
  // three modes. r is computed exactly once per pixel.
  float A2 = 2.0 * th - phi2;
  float A3 = 3.0 * th - phi3;
  float A4 = 4.0 * th - phi4;

  float r  = R * (1.0 + a2 * cos(A2) + a3 * cos(A3) + a4 * cos(A4));
  float dr = R * (-2.0 * a2 * sin(A2)
                  - 3.0 * a3 * sin(A3)
                  - 4.0 * a4 * sin(A4));

  float d     = r - dist;
  float alpha = smoothstep(-0.75, 0.75, d); // analytic AA, 1.5pt wide

  // ---- shell tilt: 1 at the center, 0 at the rim ----
  float rSafe = max(r, 1e-3);
  float u     = dist / rSafe;
  float nz    = sqrt(max(0.0, 1.0 - u * u));
  float om    = 1.0 - nz;                   // optics weight

  // ---- analytic normal from (r, dr): no finite differences ----
  float2 radial = q / max(dist, 1e-3);
  float2 tang   = float2(-radial.y, radial.x);
  float2 nxy    = normalize(radial - tang * (dr / rSafe));

  // ---- refraction: ONE tap of the LIVE backdrop, offset only near the rim ----
  float2 uv  = p + nxy * (iRefract * om);
  half4  img = iImage.eval(uv);

  // ---- thin film, weighted by a fresnel-ish rim falloff ----
  float  f    = om * om * om;
  float  tf   = om * 2.5 + filmPhase;
  float3 film = 0.5 + 0.5 * cos(6.2831853 * tf + float3(0.0, 2.1, 4.2));

  float3 base = float3(img.rgb);
  float3 col  = mix(base, base * iColor.rgb, iColor.a);
  col = mix(col, film, f * iFilm);

  // ---- dark rim line: darken the outermost ~3pt ----
  col *= 1.0 - 0.35 * smoothstep(3.0, 0.0, d);

  return half4(col * alpha, alpha);
}
`;

// ============================================================================
// Compiled effect
// ============================================================================

const effect = Skia.RuntimeEffect.Make(source);

if (!effect) {
  throw new Error(
    '[liquid-bubble-live/shaders] Failed to compile the live bubble RuntimeEffect — check the SkSL source in shaders.ts for syntax errors.',
  );
}

/**
 * Compiled harmonic-bubble SkSL effect, shaped for use as a
 * `<RuntimeShader>` image filter inside a `<BackdropFilter>`. Compiled once at
 * module scope.
 */
export const liveBubbleEffect = effect;

/**
 * Scalar/vector uniform names, in the order the shader declares them.
 * `iImage` is NOT listed: it is the effect's single child shader and Skia
 * binds the backdrop snapshot to it, so it never appears in the `uniforms`
 * prop.
 */
export const UNIFORM_NAMES = ['iParams', 'iColor', 'iRefract', 'iFilm'] as const;
