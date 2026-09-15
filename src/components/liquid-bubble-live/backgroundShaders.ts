/**
 * Liquid Bubble Live — the live background (phase 12B, Skia route)
 *
 * This is the content the bubble refracts. It is drawn as a plain `<Fill>`
 * INSIDE the same `<Canvas>` as the bubble, because that is the only place it
 * can be: the Canvas is one iOS view backed by one Metal texture, and sibling
 * React Native views are composited by CoreAnimation only AFTER Skia has
 * finished — at the moment the bubble's shader runs there is nothing "behind"
 * it to read (see `temp/liquid-bubbles-divergence.md` → "The surface
 * boundary").
 *
 * FLOW (per pixel):
 * 1. `uv = p / iResolution.y` — aspect-preserving, so the bands keep their
 *    angle on any screen. `p` is in POINTS here: an ordinary `<Fill>` shader
 *    draws straight into the canvas and never goes through a layer, so unlike
 *    `shaders.ts` there is no device-pixel conversion to do.
 * 2. One scrolling diagonal coordinate → `fract` → 4 hard-edged colour bands.
 *    Hard edges on purpose: a smooth gradient hides refraction, a hard edge
 *    makes every point of the bend visible.
 * 3. A drifting grid, moving on a different axis at a different rate, so the
 *    two motions never lock and the scene never looks like a still.
 *
 * COST: one divide, ~2 `fract`, one `floor`, a 4-way branch, one `min`, one
 * `smoothstep`. Deliberately cheap — this is the thing being refracted, not
 * the thing being measured.
 */

import { Skia } from '@shopify/react-native-skia';

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
    '[liquid-bubble-live/backgroundShaders] Failed to compile the background RuntimeEffect — check the SkSL source in backgroundShaders.ts for syntax errors.',
  );
}

/** Compiled live-background SkSL effect. Compiled once at module scope. */
export const backgroundEffect = effect;
