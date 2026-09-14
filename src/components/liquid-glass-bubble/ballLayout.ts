/**
 * Liquid Bubbles — ball layout (Phase 1)
 *
 * Static rest layout for the 12-ball metaball cluster: a rosette with one
 * center ball and 11 balls evenly spaced on a ring. All offsets are in
 * UNIT-cluster space (cluster radius = 1) — multiply by the runtime
 * `clusterRadius` (from `scaledRadius`) to get logical points.
 *
 * No React, no Skia imports here — this module is pure data + math, safe to
 * import from a worklet or from plain TS.
 */

// ============================================================================
// Buffer shape (must match iBalls[12] in shaders.ts / SkSL)
// ============================================================================

export const BALL_COUNT = 12; // must match iBalls[12] in SkSL
export const FLOATS_PER_BALL = 4; // x, y, r, active
export const BUFFER_LENGTH = BALL_COUNT * FLOATS_PER_BALL; // 48

// ============================================================================
// Types
// ============================================================================

export type BallRest = { ox: number; oy: number; r: number };

export type BallPair = readonly [number, number];

// ============================================================================
// Rosette layout (unit cluster radius = 1)
// ============================================================================
//
// - ball 0: center, ox=0, oy=0, r=0.45
// - balls 1..11: ring, angle = i/11 * 2π + 0.13, ox=cos·0.6, oy=sin·0.6, r=0.45
//
// Overlap proof (no holes in the hard union):
// - Ring spacing (chord length between adjacent ring balls):
//     2 · 0.6 · sin(π/11) ≈ 0.3395 < 2 · 0.45 = 0.9   → ring balls overlap.
// - Center gap (distance from center ball to a ring ball minus their radii):
//     0.6 − 0.45 = 0.15 < 0.45                         → center ball overlaps
//     every ring ball too (its own radius alone covers the gap).
// Both checks pass, so the hard union (max-SDF) of all 12 circles is a single
// connected blob with no holes, even before any smoothing (`iSmooth = 0`).

const RING_COUNT = BALL_COUNT - 1; // 11
const RING_RADIUS = 0.6;
const RING_ANGLE_OFFSET = 0.13;
const BALL_RADIUS = 0.45;

function makeBallLayout(): BallRest[] {
  const layout: BallRest[] = [{ ox: 0, oy: 0, r: BALL_RADIUS }];
  for (let i = 0; i < RING_COUNT; i++) {
    const angle = (i / RING_COUNT) * 2 * Math.PI + RING_ANGLE_OFFSET;
    layout.push({
      ox: Math.cos(angle) * RING_RADIUS,
      oy: Math.sin(angle) * RING_RADIUS,
      r: BALL_RADIUS,
    });
  }
  return layout;
}

export const BALL_LAYOUT: BallRest[] = makeBallLayout();

// ============================================================================
// Constraint pairs (indices into BALL_LAYOUT / physics position arrays)
// ============================================================================
//
// Ring pairs connect each ring ball to its next neighbor around the ring
// (indices 1..11, wrapping). Spoke pairs connect the center ball (0) to every
// ring ball. Rest lengths are precomputed in unit space; multiply by the
// runtime clusterRadius to get points.

function makeRingPairs(): BallPair[] {
  const pairs: BallPair[] = [];
  for (let i = 1; i <= RING_COUNT; i++) {
    const next = ((i - 1 + 1) % RING_COUNT) + 1; // wraps 1..11 -> (i, i%11+1)
    pairs.push([i, next]);
  }
  return pairs;
}

function makeSpokePairs(): BallPair[] {
  const pairs: BallPair[] = [];
  for (let i = 1; i <= RING_COUNT; i++) {
    pairs.push([0, i]);
  }
  return pairs;
}

export const RING_PAIRS: BallPair[] = makeRingPairs();
export const SPOKE_PAIRS: BallPair[] = makeSpokePairs();

// Rest lengths in unit-cluster space (multiply by clusterRadius at runtime).
export const RING_REST = 2 * RING_RADIUS * Math.sin(Math.PI / RING_COUNT);
export const SPOKE_REST = RING_RADIUS;
