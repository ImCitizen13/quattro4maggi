/**
 * Liquid Bubbles — harmonic mode physics (divergence phase 6B)
 *
 * Advances the three damped harmonic modes (`a2/phi2`, `a3`, `a4`) that
 * `shaders.ts` reads as `iParams`. No React, no Reanimated, no Skia imports —
 * this module only touches plain numbers and arrays, so `bun:test` can
 * exercise it directly (see `bubbleModeMath.test.ts`).
 *
 * Every exported function carries a `'worklet'` directive so the worklets
 * babel plugin compiles it for the Reanimated UI runtime: an UNMARKED
 * imported function captured by a worklet becomes a remote function and
 * throws when called synchronously on the UI thread. A `'worklet'`-marked
 * function is still an ordinary callable on the JS thread, so the tests are
 * unaffected — same pattern as the Verlet math module this replaced (phase 3,
 * commit a724cc6; see `temp/liquid-bubbles-divergence.md`).
 *
 * `stepBubbleModes` is ONE function with the spring integration and the
 * shortest-arc phase lerp written INLINE, and never allocates. Two reasons,
 * both learned the hard way in phase 3/4 (see
 * `temp/liquid-bubbles-divergence.md` → "Lessons"):
 *   - react-native-worklets 0.10.1 in Bundle Mode resolves a `'worklet'`
 *     -marked sibling helper captured by another worklet as `undefined` at
 *     runtime — a helper function is not an option here.
 *   - A function nested inside `stepBubbleModes` would allocate a fresh
 *     closure every frame, which the zero-per-frame-allocation rule forbids.
 * Callers own `state`, `outBuf`, and `outBbox`; this function only writes
 * into them. The `create*`/`reset*` helpers allocate (or mutate in place)
 * once at init/remount, never per frame.
 */

import {
  A2_MAX,
  A2_REST,
  A3_IDLE,
  A3_REST,
  A4_IDLE,
  A4_REST,
  A_MAX,
  BBOX_PAD,
  C2,
  C3,
  C4,
  DT_MAX_MS,
  DT_MIN_MS,
  FILM_DRIFT,
  IDLE_FREQ_3,
  IDLE_FREQ_4,
  IDLE_PHASE_4,
  K2,
  K3,
  K4,
  KICK,
  KICK_V4_SCALE,
  PARAM_FLOATS,
  PHI2_SPEED_THRESHOLD,
  PHI3_REST,
  PHI4_REST,
  PHI_DRIFT,
  PHI_RATE,
  SPEED_REF,
} from '../bubbleModes';

/** Full turn, used to wrap a phase difference onto the shortest arc. */
const TWO_PI = Math.PI * 2;

// ============================================================================
// Types
// ============================================================================

export type ModeState = {
  a2: number;
  v2: number;
  phi2: number;
  a3: number;
  v3: number;
  a4: number;
  v4: number;
  filmPhase: number;
  /** Anchor center from the previous step, used to derive motion direction. */
  lastCx: number;
  lastCy: number;
  /** Previous frame's `isActive`, to detect the 1→0 release edge. */
  lastIsActive: number;
  /** Elapsed seconds since this state was (re)created — drives the idle sines. */
  t: number;
};

export type Bbox = { x: number; y: number; w: number; h: number };

// ============================================================================
// Setup (called once on mount / remount, not per frame)
// ============================================================================

/**
 * Build a fresh mode state resting at the rest floors — `a2 = A2_REST` (not
 * 0) so the bubble never starts (or returns to) a perfect circle.
 */
export function createModeState(cx: number, cy: number): ModeState {
  'worklet';
  return {
    a2: A2_REST,
    v2: 0,
    phi2: 0,
    a3: A3_REST,
    v3: 0,
    a4: A4_REST,
    v4: 0,
    filmPhase: 0,
    lastCx: cx,
    lastCy: cy,
    lastIsActive: 0,
    t: 0,
  };
}

/**
 * Allocate one zeroed shader buffer (`PARAM_FLOATS` = 12). Called once per
 * buffer at init on whichever runtime owns the state — never from the frame
 * loop.
 */
export function createParamBuffer(): number[] {
  'worklet';
  const buf: number[] = [];
  for (let i = 0; i < PARAM_FLOATS; i++) {
    buf.push(0);
  }
  return buf;
}

/** Reset an existing state in place to the rest pose (no new object). */
export function resetModeState(state: ModeState, cx: number, cy: number): void {
  'worklet';
  state.a2 = A2_REST;
  state.v2 = 0;
  state.phi2 = 0;
  state.a3 = A3_REST;
  state.v3 = 0;
  state.a4 = A4_REST;
  state.v4 = 0;
  state.filmPhase = 0;
  state.lastCx = cx;
  state.lastCy = cy;
  state.lastIsActive = 0;
  state.t = 0;
}

// ============================================================================
// Per-frame step
// ============================================================================

/**
 * Advance the three modes by one frame and write the `iParams` buffer + bbox.
 *
 * `outBuf` must be length `PARAM_FLOATS` (12); `outBbox` is mutated in
 * place. Neither this function nor its helpers allocate.
 *
 * Speed/angle are derived from the (cx − lastCx, cy − lastCy) / dt position
 * delta — NOT from the gesture's velocityX/velocityY SharedValues. Those are
 * plumbed through `useBubblePanGesture` for later phases; this step function
 * only ever sees `cx`/`cy`, exactly as the "Physics contract" specifies.
 */
export function stepBubbleModes(
  state: ModeState,
  cx: number,
  cy: number,
  R: number,
  isActive: number,
  dtMs: number,
  outBuf: number[],
  outBbox: Bbox,
): void {
  'worklet';
  const clampedMs = Math.min(Math.max(dtMs, DT_MIN_MS), DT_MAX_MS);
  const dt = clampedMs / 1000;

  // Motion direction + speed of the anchor center, from the previous step's
  // center. Direction is dt-independent (atan2 of the raw delta), only the
  // magnitude needs the dt division.
  const dx = cx - state.lastCx;
  const dy = cy - state.lastCy;
  const speed = Math.hypot(dx, dy) / dt;
  const angle = Math.atan2(dy, dx);
  state.lastCx = cx;
  state.lastCy = cy;
  state.t += dt;

  // ---- mode 2: drag stretch, with a rest floor so it never fully relaxes ----
  const target2 = Math.max(A2_REST, Math.min(A2_MAX, speed / SPEED_REF));

  if (speed > PHI2_SPEED_THRESHOLD) {
    // Shortest-arc lerp of phi2 toward 2 * motion angle.
    const targetPhi2 = 2 * angle;
    let diff = targetPhi2 - state.phi2;
    diff = diff - TWO_PI * Math.floor((diff + Math.PI) / TWO_PI);
    state.phi2 += diff * Math.min(1, PHI_RATE * dt);
  } else {
    // At rest: phi2 keeps the last motion axis and drifts slowly, so the
    // stretch axis never freezes.
    state.phi2 += PHI_DRIFT * dt;
  }

  // Release kick: isActive 1 → 0 edge seeds modes 3/4 so they ring out,
  // scaled by this frame's (position-delta-derived) speed.
  if (state.lastIsActive === 1 && isActive === 0) {
    state.v3 += KICK * speed;
    state.v4 -= KICK * speed * KICK_V4_SCALE;
  }
  state.lastIsActive = isActive;

  // ---- modes 3/4: idle breathing targets around their rest floors ----
  const target3 = A3_REST + A3_IDLE * Math.sin(state.t * IDLE_FREQ_3);
  const target4 = A4_REST + A4_IDLE * Math.sin(state.t * IDLE_FREQ_4 + IDLE_PHASE_4);

  // ---- spring-integrate each amplitude, inline (see module doc) ----
  state.v2 += (K2 * (target2 - state.a2) - C2 * state.v2) * dt;
  state.a2 += state.v2 * dt;
  state.a2 = Math.min(A_MAX, Math.max(-A_MAX, state.a2));

  state.v3 += (K3 * (target3 - state.a3) - C3 * state.v3) * dt;
  state.a3 += state.v3 * dt;
  state.a3 = Math.min(A_MAX, Math.max(-A_MAX, state.a3));

  state.v4 += (K4 * (target4 - state.a4) - C4 * state.v4) * dt;
  state.a4 += state.v4 * dt;
  state.a4 = Math.min(A_MAX, Math.max(-A_MAX, state.a4));

  state.filmPhase += dt * FILM_DRIFT;

  // ---- output buffer: [0] cx,cy,R,_  [1] a2,phi2,a3,phi3  [2] a4,phi4,filmPhase,_ ----
  outBuf[0] = cx;
  outBuf[1] = cy;
  outBuf[2] = R;
  outBuf[3] = 0;
  outBuf[4] = state.a2;
  outBuf[5] = state.phi2;
  outBuf[6] = state.a3;
  outBuf[7] = PHI3_REST;
  outBuf[8] = state.a4;
  outBuf[9] = PHI4_REST;
  outBuf[10] = state.filmPhase;
  outBuf[11] = 0;

  // ---- bbox: half = R * (1 + |a2| + |a3| + |a4|) + PAD ----
  const half =
    R * (1 + Math.abs(state.a2) + Math.abs(state.a3) + Math.abs(state.a4)) + BBOX_PAD;
  outBbox.x = cx - half;
  outBbox.y = cy - half;
  outBbox.w = 2 * half;
  outBbox.h = 2 * half;
}
