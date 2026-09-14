/**
 * Liquid Bubbles — harmonic bubble shader (divergence phase 5B)
 *
 * Supersedes the phase-2 metaball field (`temp/liquid-bubbles-divergence.md`
 * is the source of truth). Instead of a 12-ball union, the shape is ONE
 * circle whose radius depends on angle via three damped harmonic modes:
 *
 *   r(θ) = R · (1 + a2·cos(2θ−φ2) + a3·cos(3θ−φ3) + a4·cos(4θ−φ4))
 *
 * Mode 2 stretches (drag direction/speed), mode 3 makes soft lobes, mode 4
 * soft corners — both 3 and 4 idle-breathe and ring out on release (see
 * `bubbleModes.ts` for the driving constants, wired up in phase 6B).
 *
 * COST: exactly ONE evaluation of `r` per pixel — one `atan2`, three
 * `cos`, one `smoothstep`. No loop (there is only one field now, not 12
 * balls), no second field evaluation, no finite-difference normals. Optics
 * (refraction, thin film, the rim's analytic normal `nz`) are phase 8B —
 * this file stops at `alpha`. Compiled once at module scope; drawn into a
 * bounding `<Rect>` sized to the disk + AA padding, never a full-screen
 * `<Fill>`.
 */

import { Skia } from '@shopify/react-native-skia';

// ============================================================================
// SkSL source
// ============================================================================

const source = `
uniform float4 iParams[3];   // [0] cx,cy,R,_  [1] a2,phi2,a3,phi3  [2] a4,phi4,filmPhase,_
uniform float4 iColor;       // base tint rgba

half4 main(float2 p) {
  float2 c   = iParams[0].xy;
  float  R   = iParams[0].z;
  float  a2  = iParams[1].x;
  float  phi2 = iParams[1].y;
  float  a3  = iParams[1].z;
  float  phi3 = iParams[1].w;
  float  a4  = iParams[2].x;
  float  phi4 = iParams[2].y;

  // Single field evaluation: one atan2, three cos, no loop.
  float2 q    = p - c;
  float  dist = length(q);
  float  th   = atan(q.y, q.x);
  float  r    = R * (1.0
                  + a2 * cos(2.0 * th - phi2)
                  + a3 * cos(3.0 * th - phi3)
                  + a4 * cos(4.0 * th - phi4));

  float d     = r - dist;
  float alpha = smoothstep(-0.75, 0.75, d); // analytic AA, 1.5pt wide

  return half4(iColor.rgb * alpha, iColor.a * alpha);
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

/** Uniform names, in the order the shader declares them. */
export const UNIFORM_NAMES = ['iParams', 'iColor'] as const;
