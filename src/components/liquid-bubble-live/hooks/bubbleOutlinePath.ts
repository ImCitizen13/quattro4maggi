/**
 * Liquid Bubble Live — bubble outline as an `SkPath` (for an anti-aliased clip).
 *
 * FLOW: `iParams` (the buffer `useBubbleShape` writes) → sample the SAME polar
 * radius the SkSL evaluates → closed polygon → `SkPath`. Skia rasterizes a path
 * clip at DEVICE resolution with AA, so the silhouette is crisp on a 3x screen;
 * the shader's own `smoothstep(±0.75)` rim AA is only 1 texel per point.
 *
 * KEEP IN SYNC with shaders.ts / filmOverlayShader.ts:
 *   r(th) = R * (1 + a2 cos(2 th - phi2) + a3 cos(3 th - phi3) + a4 cos(4 th - phi4))
 * and the visible edge is the zero of d = r - dist (alpha = smoothstep(-0.75, 0.75, d)).
 */

import { Skia, type SkPath } from "react-native-skia";

// ============================================================================
// Config
// ============================================================================

/** Polygon vertices around the outline (chord sagitta at R=200pt is ~0.1pt). */
export const OUTLINE_POINTS = 96;

// ============================================================================
// Builder
// ============================================================================

/**
 * Closed outline of the bubble, `inset` points inside the shader's zero-crossing.
 * Worklet: call from `useDerivedValue`. Returns an empty path until the first
 * param frame has landed (`params.length < 12`).
 */
export function buildBubbleOutlinePath(
  params: number[],
  inset: number,
): SkPath {
  "worklet";
  const b = Skia.PathBuilder.Make();
  if (params.length < 12) return b.detach();

  const cx = params[0];
  const cy = params[1];
  const R = params[2];
  const a2 = params[4];
  const phi2 = params[5];
  const a3 = params[6];
  const phi3 = params[7];
  const a4 = params[8];
  const phi4 = params[9];

  const step = (Math.PI * 2) / OUTLINE_POINTS;
  for (let i = 0; i < OUTLINE_POINTS; i++) {
    const th = i * step;
    const r =
      R *
        (1 +
          a2 * Math.cos(2 * th - phi2) +
          a3 * Math.cos(3 * th - phi3) +
          a4 * Math.cos(4 * th - phi4)) -
      inset;
    const x = cx + r * Math.cos(th);
    const y = cy + r * Math.sin(th);
    if (i === 0) b.moveTo(x, y);
    else b.lineTo(x, y);
  }
  b.close();
  return b.detach();
}
