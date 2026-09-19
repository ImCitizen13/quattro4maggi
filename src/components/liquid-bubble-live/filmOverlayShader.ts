/**
 * Liquid Bubble Live — soap-film overlay pass.
 * Design notes: README.md → "filmOverlayShader.ts".
 *
 * The bubble runs as a `<BackdropFilter>` runtime shader, whose single child
 * slot is taken by the backdrop — it cannot also take the soap film as a
 * `uniform shader`. So the film is drawn as a SECOND pass on top: this shader
 * re-derives the exact same harmonic shape from the same `iParams`, then
 * composites the soap film with the weight the bubble uses for its own film
 * (`fresnel · iFilm · alpha`). srcOver with that weight is the same math as
 * the bubble's `mix(col, film, f * iFilm)`.
 *
 * The thickness field comes in as a child shader (soap-film's
 * `SoapFilmShader output="thickness"`); color is the shared
 * `SOAP_FILM_COLOR_FN`, fed the bubble's REAL per-pixel view angle (shell
 * tilt `nz`), so colors shift toward the rim.
 */

import { Skia } from "@shopify/react-native-skia";

import { SOAP_FILM_COLOR_FN } from "@/lib/shaders/soapFilm";

// ============================================================================
// SkSL source
// ============================================================================

const source = `
uniform float4 iParams[3];   // same buffer as the bubble shader (POINTS)
uniform float  iFilm;        // bubble's Film lever, 0..1
uniform float  iFalloff;     // bubble's optics falloff exponent (iOptics.w)
uniform float  uReach;       // 0 rim only (om³) .. 1 whole bubble (om⁰)
uniform float2 uFilmSize;    // size the thickness shader was given as iSize
uniform float4 uFilmColor;   // mode, thicknessScale, intensity, opacity
uniform shader thickness;    // soap-film thickness field (r channel)
uniform shader ramp;         // 20x1 LUT — required by SOAP_FILM_COLOR_FN

${SOAP_FILM_COLOR_FN}

half4 main(float2 p) {
  float2 c    = iParams[0].xy;
  float  R    = iParams[0].z;
  float  a2   = iParams[1].x;
  float  phi2 = iParams[1].y;
  float  a3   = iParams[1].z;
  float  phi3 = iParams[1].w;
  float  a4   = iParams[2].x;
  float  phi4 = iParams[2].y;

  float2 q    = p - c;
  float  dist = length(q);
  float  th   = atan(q.y, q.x);

  // ---- identical shape + shell tilt to shaders.ts ----
  float r = R * (1.0 + a2 * cos(2.0 * th - phi2)
                     + a3 * cos(3.0 * th - phi3)
                     + a4 * cos(4.0 * th - phi4));
  float alpha = smoothstep(-0.75, 0.75, r - dist);
  if (alpha <= 0.0) {
    return half4(0.0);
  }

  float u  = dist / max(r, 1e-3);
  float nz = sqrt(max(0.0, 1.0 - u * u));
  float om = pow(1.0 - nz, iFalloff);
  // Reach lowers the fresnel exponent: 3 = the bubble's rim-only om³,
  // 0 = flat weight over the whole disk. max() keeps pow(0, 0) out.
  float f  = pow(max(om, 1e-4), 3.0 * (1.0 - clamp(uReach, 0.0, 1.0)));

  // ---- bubble-local → film space: the rest disk (radius R) maps onto the
  // film canvas' inscribed circle, so the film rides along with the bubble
  // and the rings center on it. Wobble shows as the rim cutting the film. ----
  float  inR  = 0.5 * min(uFilmSize.x, uFilmSize.y); // not "half": SkSL type
  float2 fp   = 0.5 * uFilmSize + (q / max(R, 1e-3)) * inR;
  float  t    = float(thickness.eval(fp).r);

  float3 col = soapFilmColor(t, uFilmColor.x, uFilmColor.y, max(nz, 0.2))
             * uFilmColor.z;

  float w = f * iFilm * alpha * clamp(uFilmColor.w, 0.0, 1.0);
  return half4(clamp(col, 0.0, 1.0) * w, w);
}
`;

// ============================================================================
// Compiled effect
// ============================================================================

const effect = Skia.RuntimeEffect.Make(source);

if (!effect) {
  throw new Error(
    "[liquid-bubble-live/filmOverlayShader] Failed to compile the film overlay RuntimeEffect — check the SkSL source in filmOverlayShader.ts.",
  );
}

/** Compiled soap-film overlay effect, drawn over the bubble's clip rect. */
export const filmOverlayEffect = effect;

/**
 * Virtual canvas size handed to the thickness shader as `iSize`, points.
 * Arbitrary — the film is sampled in normalized space — but square, so the
 * bubble maps onto a circle and rings stay round.
 */
export const FILM_OVERLAY_SIZE: [number, number] = [400, 400];
