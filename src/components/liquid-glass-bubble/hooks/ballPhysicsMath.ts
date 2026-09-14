/**
 * Liquid Bubbles — ball physics math (Phase 3)
 *
 * Verlet integration + distance-constraint solver for the 12-ball rosette
 * cluster. No React, no Reanimated, no Skia imports — this module only touches
 * plain arrays and numbers, so `bun:test` can exercise it directly (see
 * `ballPhysicsMath.test.ts`).
 *
 * Every exported function carries a `'worklet'` directive so the worklets
 * babel plugin compiles it for the Reanimated UI runtime: an UNMARKED imported
 * function captured by a worklet becomes a remote function and throws when
 * called synchronously on the UI thread. A `'worklet'`-marked function is
 * still an ordinary callable on the JS thread, so the tests are unaffected —
 * same pattern as `src/components/gargantua-type-gpu/movingBubbleScene.ts`.
 *
 * `stepBallPhysics` never allocates: callers own `state`, `outBuf`, and
 * `outBbox` and this function only writes into them. The two `create*`
 * helpers allocate once at init, never per frame.
 */

import {
  BALL_COUNT,
  BALL_LAYOUT,
  FLOATS_PER_BALL,
  RING_PAIRS,
  RING_REST,
  SPOKE_PAIRS,
  SPOKE_REST,
  type BallPair,
} from '../ballLayout';

// ============================================================================
// Tuning constants
// ============================================================================

/** Pull strength (1/s²) for a ball fully in front of the motion direction. */
export const K_FRONT = 60;
/** Pull strength (1/s²) for a ball fully behind the motion direction. */
export const K_BACK = 18;
/** Per-frame velocity damping at a 120Hz reference rate. */
export const DAMPING = 0.88;
/** Constraint solver iterations per physics step. */
export const ITER = 3;
/** Distance-constraint stiffness for ring (neighbor) pairs. */
export const RING_STIFF = 0.5;
/** Distance-constraint stiffness for spoke (center) pairs. */
export const SPOKE_STIFF = 0.35;
/** A ball snaps back to its anchor once it strays past `SNAP_FACTOR · R`. */
export const SNAP_FACTOR = 4;
/**
 * Stand-in for the shader's `iSmooth` uniform (0 in Phase 2/3) used to pad
 * the bbox. Bump this — or thread the real `iSmooth` value in — once Phase 5
 * raises the shader's smoothing constant.
 */
export const BBOX_SMOOTH_PAD = 0;
/** Extra bbox padding (pt) beyond `BBOX_SMOOTH_PAD`, for AA bleed. */
export const BBOX_PAD_EXTRA = 2;
/** Frame-time clamp bounds (ms) — caps a dropped frame from launching a ball. */
export const MIN_DT_MS = 1;
export const MAX_DT_MS = 33;
/** Below this anchor speed (pt/s) the motion direction is treated as zero. */
export const MIN_SPEED_FOR_DIR = 1;

// ============================================================================
// Types
// ============================================================================

export type BallPhysicsState = {
  posX: number[];
  posY: number[];
  prevX: number[];
  prevY: number[];
  /** Anchor center from the previous step, used to derive motion direction. */
  lastCx: number;
  lastCy: number;
};

export type Bbox = { x: number; y: number; w: number; h: number };

// ============================================================================
// Setup (called once on mount, not per frame)
// ============================================================================

/** Build a fresh physics state with every ball resting at its anchor. */
export function createBallPhysicsState(
  cx: number,
  cy: number,
  R: number,
): BallPhysicsState {
  'worklet';
  const posX: number[] = [];
  const posY: number[] = [];
  const prevX: number[] = [];
  const prevY: number[] = [];
  for (let i = 0; i < BALL_COUNT; i++) {
    const ball = BALL_LAYOUT[i];
    const ax = cx + ball.ox * R;
    const ay = cy + ball.oy * R;
    posX.push(ax);
    posY.push(ay);
    prevX.push(ax);
    prevY.push(ay);
  }
  return { posX, posY, prevX, prevY, lastCx: cx, lastCy: cy };
}

/**
 * Allocate one zeroed shader buffer (48 floats). Called once per buffer at
 * init on whichever runtime owns the state — never from the frame loop.
 */
export function createBallBuffer(): number[] {
  'worklet';
  const buf: number[] = [];
  for (let i = 0; i < BALL_COUNT * FLOATS_PER_BALL; i++) {
    buf.push(0);
  }
  return buf;
}

/** Reset an existing state's arrays in place (no new arrays, no `.fill`). */
export function resetBallPhysicsState(
  state: BallPhysicsState,
  cx: number,
  cy: number,
  R: number,
): void {
  'worklet';
  for (let i = 0; i < BALL_COUNT; i++) {
    const ball = BALL_LAYOUT[i];
    const ax = cx + ball.ox * R;
    const ay = cy + ball.oy * R;
    state.posX[i] = ax;
    state.posY[i] = ay;
    state.prevX[i] = ax;
    state.prevY[i] = ay;
  }
  state.lastCx = cx;
  state.lastCy = cy;
}

// ============================================================================
// Per-frame step
// ============================================================================

/**
 * Advance the cluster by one frame and write the shader buffer + bbox.
 *
 * `outBuf` must be length `BUFFER_LENGTH` (48); `outBbox` is mutated in
 * place. Neither this function nor its helpers allocate.
 */
export function stepBallPhysics(
  state: BallPhysicsState,
  cx: number,
  cy: number,
  R: number,
  dtMs: number,
  outBuf: number[],
  outBbox: Bbox,
): void {
  'worklet';
  // The constraint solver is INLINED below rather than living in a helper.
  // react-native-worklets 0.10.1 in Bundle Mode fails to resolve a
  // worklet-marked sibling function captured as a plain value inside another
  // worklet's closure — the compiled `.worklets/*.js` factory lists it as a
  // captured parameter, but the reference arrives `undefined` on the UI
  // runtime ("applyConstraints is not a function"). See the gooey-border /
  // worklet-ui-thread-migration notes (§5, "plain functions captured through
  // object graphs") for the failure mode this resembles.
  const clampedMs = Math.min(Math.max(dtMs, MIN_DT_MS), MAX_DT_MS);
  const dt = clampedMs / 1000;

  // Motion direction of the anchor center, from the previous step's center.
  let dirX = 0;
  let dirY = 0;
  const vx = (cx - state.lastCx) / dt;
  const vy = (cy - state.lastCy) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed >= MIN_SPEED_FOR_DIR) {
    dirX = vx / speed;
    dirY = vy / speed;
  }
  state.lastCx = cx;
  state.lastCy = cy;

  const damp = Math.pow(DAMPING, dt * 120);
  const snapDist = SNAP_FACTOR * R;
  const dt2 = dt * dt;

  for (let i = 0; i < BALL_COUNT; i++) {
    const ball = BALL_LAYOUT[i];
    const ax = cx + ball.ox * R;
    const ay = cy + ball.oy * R;

    // Position-based pull strength: balls trailing the motion direction get
    // the weaker K_BACK pull, balls leading it get the stronger K_FRONT pull.
    let behind = 0;
    if (i !== 0) {
      const olen = Math.hypot(ball.ox, ball.oy) || 1;
      const dot = (ball.ox / olen) * -dirX + (ball.oy / olen) * -dirY;
      behind = Math.min(Math.max(dot, 0), 1);
    }
    const k = K_FRONT - (K_FRONT - K_BACK) * behind;

    const px = state.posX[i];
    const py = state.posY[i];
    const accX = k * (ax - px);
    const accY = k * (ay - py);
    const newX = px + (px - state.prevX[i]) * damp + accX * dt2;
    const newY = py + (py - state.prevY[i]) * damp + accY * dt2;
    state.prevX[i] = px;
    state.prevY[i] = py;
    state.posX[i] = newX;
    state.posY[i] = newY;

    // Instability guard: a ball that strays too far from its anchor snaps
    // back instead of flying off — kills velocity too, so it doesn't ping.
    const ddx = state.posX[i] - ax;
    const ddy = state.posY[i] - ay;
    if (Math.hypot(ddx, ddy) > snapDist) {
      state.posX[i] = ax;
      state.posY[i] = ay;
      state.prevX[i] = ax;
      state.prevY[i] = ay;
    }
  }

  // Gauss-Seidel constraint relaxation, inlined rather than factored into a
  // helper. A helper is not an option here for two separate reasons: a sibling
  // module-scope worklet arrives `undefined` on the UI runtime (see the note at
  // the top of this function), and a function nested in this one would allocate
  // a fresh closure on every frame, which the handoff's zero-per-frame-
  // allocation rule forbids. `pass` 0 is the ring, 1 is the spokes.
  for (let iter = 0; iter < ITER; iter++) {
    for (let pass = 0; pass < 2; pass++) {
      const pairs: readonly BallPair[] = pass === 0 ? RING_PAIRS : SPOKE_PAIRS;
      const rest = (pass === 0 ? RING_REST : SPOKE_REST) * R;
      const stiff = pass === 0 ? RING_STIFF : SPOKE_STIFF;

      for (let p = 0; p < pairs.length; p++) {
        const a = pairs[p][0];
        const b = pairs[p][1];
        const dx = state.posX[b] - state.posX[a];
        const dy = state.posY[b] - state.posY[a];
        // Pull both endpoints toward `rest` separation, split evenly and
        // scaled by `stiff` so the cluster stretches under load instead of
        // going fully rigid.
        const dist = Math.hypot(dx, dy) || 1e-6;
        const correction = ((dist - rest) / dist) * stiff * 0.5;
        const ox = dx * correction;
        const oy = dy * correction;
        state.posX[a] += ox;
        state.posY[a] += oy;
        state.posX[b] -= ox;
        state.posY[b] -= oy;
      }
    }
  }

  const pad = BBOX_SMOOTH_PAD + BBOX_PAD_EXTRA;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < BALL_COUNT; i++) {
    const r = BALL_LAYOUT[i].r * R;
    const x = state.posX[i];
    const y = state.posY[i];
    const rp = r + pad;
    if (x - rp < minX) minX = x - rp;
    if (x + rp > maxX) maxX = x + rp;
    if (y - rp < minY) minY = y - rp;
    if (y + rp > maxY) maxY = y + rp;

    const o = i * FLOATS_PER_BALL;
    outBuf[o] = x;
    outBuf[o + 1] = y;
    outBuf[o + 2] = r;
    outBuf[o + 3] = 1;
  }

  outBbox.x = minX;
  outBbox.y = minY;
  outBbox.w = maxX - minX;
  outBbox.h = maxY - minY;
}
