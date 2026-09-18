/**
 * Liquid Bubble Live — harmonic bubble shader as a backdrop image filter.
 * Design notes: README.md → "shaders.ts".
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
uniform float4 iOptics;      // rimDark, rimWidth (pt), filmScale, falloff exponent
uniform float4 iLens;        // lens (×R, + magnify / − pincushion), dispersion (×R), edgeWidth, specular
uniform float4 iPrism;       // rainbowMix, rainbowGlow, haloSpread (×R), haloOpacity (signed: − dark, + light)
uniform shader iImage;      // THE BACKDROP — exactly one child shader, bound by Skia

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
  float  om    = pow(1.0 - nz, iOptics.w);   // optics weight, falloff > 0

  // ---- analytic normal from (r, dr): no finite differences ----
  float2 radial = q / max(dist, 1e-3);
  float2 tang   = float2(-radial.y, radial.x);
  float2 nxy    = normalize(radial - tang * (dr / rSafe));

  // ---- refraction: ONE tap of the LIVE backdrop, offset only near the rim ----
  // Normal offset (iRefract) + Gargantua's radial lens: (dist/r)² · lens · R,
  // + pulls toward the center (magnify), − pushes out (pincushion).
  float2 uv  = p + nxy * (iRefract * om) - radial * (iLens.x * u * u * R);
  half4  img = iImage.eval(uv);
  float3 base = float3(img.rgb);

  // ---- rim band shared by dispersion + rainbow (Gargantua edgeFactor) ----
  float edge = smoothstep(1.0 - iLens.z, 1.0, u);

  // ---- chromatic aberration: 2 extra taps, skipped when dispersion is 0 ----
  if (iLens.y > 0.0) {
    float2 chroma = radial * (iLens.y * edge * R);
    float3 split  = float3(iImage.eval(uv + chroma).r, base.g, iImage.eval(uv - chroma).b);
    base = mix(base, split, edge);
  }

  // ---- thin film, weighted by a fresnel-ish rim falloff ----
  float  f    = om * om * om;
  float  tf   = om * iOptics.z + filmPhase;
  float3 film = 0.5 + 0.5 * cos(6.2831853 * tf + float3(0.0, 2.1, 4.2));

  float3 col  = mix(base, base * iColor.rgb, iColor.a);
  col = mix(col, film, f * iFilm);

  // ---- prismatic rim: hue by angle, same 6-stop rainbow, branchless ----
  float  hue     = fract(th / 6.2831853 + 0.5);
  float3 rainbow = clamp(abs(mod(hue * 6.0 + float3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  col = mix(col, rainbow, edge * iPrism.x) + rainbow * (edge * iPrism.y);

  // ---- specular: Gargantua's up-left light against the WOBBLING normal ----
  float sd = max(dot(nxy, float2(-0.4, -0.6)), 0.0);
  col += (pow(sd, 32.0) * 0.6 + pow(sd, 8.0) * 0.15) * iLens.w;

  // ---- dark rim line: darken the outermost iOptics.y pt ----
  col *= 1.0 - iOptics.x * smoothstep(iOptics.y, 0.0, d);

  // ---- halo outside the rim (premultiplied); sign picks light vs dark ----
  float haloA = smoothstep(R * iPrism.z, 0.0, -d) * abs(iPrism.w) * (1.0 - alpha);
  float haloL = step(0.0, iPrism.w);

  return half4(col * alpha + haloL * haloA, alpha + haloA);
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
export const UNIFORM_NAMES = ['iParams', 'iColor', 'iRefract', 'iFilm', 'iOptics', 'iLens', 'iPrism'] as const;
