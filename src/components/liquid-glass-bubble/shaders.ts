/**
 * Liquid Bubbles — harmonic bubble shader + optics (divergence phase 8B)
 *
 * Supersedes the phase-2 metaball field (`temp/liquid-bubbles-divergence.md`
 * is the source of truth). Instead of a 12-ball union, the shape is ONE
 * circle whose radius depends on angle via three damped harmonic modes:
 *
 *   r(θ)  = R · (1 + a2·cos(2θ−φ2) + a3·cos(3θ−φ3) + a4·cos(4θ−φ4))
 *   r'(θ) = R · (−2a2·sin(2θ−φ2) − 3a3·sin(3θ−φ3) − 4a4·sin(4θ−φ4))
 *
 * Mode 2 stretches (drag direction/speed), mode 3 makes soft lobes, mode 4
 * soft corners — both 3 and 4 idle-breathe and ring out on release (see
 * `bubbleModes.ts` for the driving constants, `hooks/bubbleModeMath.ts` for
 * the springs).
 *
 * FLOW (per pixel, one pass, no loop):
 * 1. `q = p − c` → `dist`, `th` (ONE atan2).
 * 2. ONE pass over the three modes yields BOTH `r` and `dr` (= dr/dθ) from
 *    the same three angle arguments: 3 cos + 3 sin. `r` is evaluated exactly
 *    once per pixel — there is no second field evaluation anywhere below,
 *    and no finite-difference normal.
 * 3. `alpha = smoothstep(-0.75, 0.75, r − dist)` — analytic AA, 1.5pt wide.
 * 4. Shell tilt `nz = sqrt(1 − (dist/r)²)`: 1 at the center, 0 at the rim.
 *    Everything optical is weighted by `om = 1 − nz`, so the center stays
 *    clear and the rim carries the effect.
 * 5. The surface normal comes from `r` and `dr` ANALYTICALLY:
 *    for `P(θ) = r(θ)·(cosθ, sinθ)` the outward normal is
 *    `r·radial − r'·tang`, i.e. `radial − tang·(r'/r)` after normalising —
 *    so a wobbly rim bends the normal and the refraction follows the wobble.
 * 6. `uv = p + n·iRefract·om` samples the child `iImage` (an `<ImageShader>`
 *    mapped onto the bubble): zero offset at the center, `iRefract` pt of
 *    outward displacement at the rim. ONE texture tap.
 * 7. Thin film: `cos` of a thickness proxy (`om·2.5 + filmPhase`) per
 *    channel, mixed in with a fresnel weight `om³` → rainbow on the rim only.
 * 8. A `smoothstep(3, 0, d)` multiply darkens the outermost ~3pt into the
 *    bubble's dark rim line.
 *
 * COST: one `atan2`, six trig (3 cos + 3 sin), two `sqrt` (`length`,
 * `normalize`) plus the tilt `sqrt`, three `cos` for the film, one texture
 * tap. Compiled once at module scope; drawn into a bounding `<Rect>` sized to
 * the disk + `BBOX_PAD` (which now includes `iRefract`, see `bubbleModes.ts`),
 * never a full-screen `<Fill>`.
 */

import { Skia } from '@shopify/react-native-skia';

// ============================================================================
// SkSL source
// ============================================================================

const source = `
uniform float4 iParams[3];   // [0] cx,cy,R,_  [1] a2,phi2,a3,phi3  [2] a4,phi4,filmPhase,_
uniform float4 iColor;       // base tint rgb + tint WEIGHT in .a (not opacity)
uniform float  iRefract;     // max refraction sample offset at the rim, pt
uniform float  iFilm;        // iridescence strength, 0..1
uniform shader iImage;       // child ImageShader mapped onto the bubble

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

  // ---- refraction: one texture tap, offset only near the rim ----
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
    '[liquid-glass-bubble/shaders] Failed to compile the bubble RuntimeEffect — check the SkSL source in shaders.ts for syntax errors.',
  );
}

/** Compiled harmonic-bubble SkSL effect. Compiled once at module scope. */
export const bubbleEffect = effect;

/**
 * Scalar/vector uniform names, in the order the shader declares them.
 * `iImage` is NOT listed: it is a child shader, supplied as the `<Shader>`
 * element's `<ImageShader>` child, not through the `uniforms` prop.
 */
export const UNIFORM_NAMES = ['iParams', 'iColor', 'iRefract', 'iFilm'] as const;
