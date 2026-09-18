/**
 * Liquid Bubble Live — the live background shader.
 * Design notes: README.md → "backgroundShaders.ts".
 */

import { Skia } from "@shopify/react-native-skia";

// ============================================================================
// SkSL source
// ============================================================================

const source = `
uniform float2 iResolution;  // canvas size, POINTS
uniform float  iTime;        // seconds since mount
uniform float4 iBand;        // scrollRate, dirX, dirY, gridDensity
uniform float4 iGrid;        // drift, width, strength, unused

half4 main(float2 p) {
  // Divide by height on BOTH axes so the band angle is aspect-independent.
  float2 uv = p / iResolution.y;

  // ---- scrolling diagonal bands ----
  float s    = uv.x * iBand.y + uv.y * iBand.z - iTime * iBand.x;
  float band = fract(s);
  float idx  = floor(band * 4.0);

  half3 col = half3(0.13, 0.11, 0.30);       // indigo
  if (idx > 2.5) {
    col = half3(1.00, 0.68, 0.22);           // amber
  } else if (idx > 1.5) {
    col = half3(0.16, 0.80, 0.86);           // cyan
  } else if (idx > 0.5) {
    col = half3(0.85, 0.20, 0.55);           // magenta
  }

  // ---- drifting grid, a second motion on a different axis and rate ----
  float2 g    = abs(fract(uv * iBand.w + float2(0.0, iTime * iGrid.x)) - 0.5);
  float  line = 1.0 - smoothstep(0.0, iGrid.y, min(g.x, g.y));
  col = mix(col, half3(1.0), half(line * iGrid.z));

  return half4(col, 1.0);
}
`;

// ============================================================================
// Compiled effect
// ============================================================================

const effect = Skia.RuntimeEffect.Make(source);

if (!effect) {
  throw new Error(
    "[liquid-bubble-live/backgroundShaders] Failed to compile the background RuntimeEffect — check the SkSL source in backgroundShaders.ts for syntax errors.",
  );
}

/** Compiled live-background SkSL effect. Compiled once at module scope. */
export const backgroundEffect = effect;
