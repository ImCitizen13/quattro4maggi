/**
 * Liquid Bubbles — metaball shader (Phase 2)
 *
 * SkSL source for the 12-ball hard-union metaball field. Positive-inside
 * distance convention, matching `src/lib/shaders/MetaballLiquidMetal.ts`:
 * each ball's field is `r - length(p - c)`, so the union of balls is a
 * smooth MAX (`smax`), not a smooth min.
 *
 * Phase 2 ships with `iSmooth = 0` (hard union via `max`); Phase 5 raises
 * `iSmooth` to blend the balls into one blob with gooey necks. The `smax`
 * helper is included now so Phase 5 needs no shader changes, only a uniform
 * value change.
 *
 * COST: exactly one field evaluation per pixel — a single loop over the 12
 * balls, then one `smoothstep` for analytic AA. No second pass, no
 * finite-difference normals (see the gooey-border perf notes in the phase
 * handoff). Compiled once at module scope; the shader is drawn into a
 * bounding `<Rect>` sized to the ball cluster, never a full-screen `<Fill>`.
 */

import { Skia } from '@shopify/react-native-skia';

// ============================================================================
// SkSL source
// ============================================================================

const source = `
uniform float4 iBalls[12];   // x, y (logical pt), r (pt), active (0/1)
uniform float  iSmooth;      // smax k in pt. 0 = hard union (phase 2)
uniform float4 iColor;       // blob rgba

// Smooth maximum (polynomial). Positive-inside union: growing k softens the
// seam between overlapping balls into a gooey neck instead of a hard edge.
float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(a, b, h) + k * h * (1.0 - h);
}

// Field, positive inside. Single loop over all 12 balls — the only field
// evaluation per pixel.
float field(float2 p) {
  float d = -1.0e6;
  for (int i = 0; i < 12; i++) {
    float4 b = iBalls[i];
    if (b.w > 0.5) {
      float di = b.z - length(p - b.xy);
      d = (iSmooth > 0.001) ? smax(d, di, iSmooth) : max(d, di);
    }
  }
  return d;
}

half4 main(float2 p) {
  float d = field(p);
  float a = smoothstep(-0.75, 0.75, d); // analytic AA, 1.5pt wide
  return half4(iColor.rgb * a, iColor.a * a);
}
`;

// ============================================================================
// Compiled effect
// ============================================================================

const effect = Skia.RuntimeEffect.Make(source);

if (!effect) {
  throw new Error(
    '[liquid-glass-bubble/shaders] Failed to compile the metaball RuntimeEffect — check the SkSL source in shaders.ts for syntax errors.',
  );
}

/** Compiled metaball SkSL effect. Compiled once at module scope. */
export const metaballEffect = effect;

/** Uniform names, in the order the shader declares them. */
export const UNIFORM_NAMES = ['iBalls', 'iSmooth', 'iColor'] as const;
