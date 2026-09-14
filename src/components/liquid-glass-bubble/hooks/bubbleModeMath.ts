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
  SPEED_REF,
} from '../bubbleModes';

/** Below this magnitude a mode-2 vector has no meaningful direction. */
const EPS = 1e-9;

// ============================================================================
// Types
// ============================================================================

export type ModeState = {
  /**
   * Mode 2 is stored as a VECTOR in double-angle space — `c2 = a2·cos(phi2)`,
   * `s2 = a2·sin(phi2)` — not as an (amplitude, angle) pair. Springing the two
   * components independently is what keeps a direction change from *rotating*
   * the bubble: `phi2` is `2 × motionAngle`, so a 90° turn of the drag is a π
   * jump in `phi2`, which is the exactly-antipodal case where a shortest-arc
   * angle lerp has no shorter side. It then picks a direction arbitrarily and
   * sweeps the lobe through every intermediate axis — a visible pivot, with
   * unstable handedness between attempts. Interpolating the vector instead
   * passes through low amplitude on the way: the bubble de-stretches and
   * re-stretches on the new axis, which is also what a real bubble does.
   */
  c2: number;
  s2: number;
  vc2: number;
  vs2: number;
  /**
   * Derived each step from (`c2`, `s2`) purely for output/observability — the
   * shader buffer and the tests read these. `a2` is a magnitude, so it is
   * never negative.
   */
  a2: number;
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
    c2: A2_REST,
    s2: 0,
    vc2: 0,
    vs2: 0,
    a2: A2_REST,
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
  state.c2 = A2_REST;
  state.s2 = 0;
  state.vc2 = 0;
  state.vs2 = 0;
  state.a2 = A2_REST;
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
 * The mode-2 drive speed/angle are derived from the (cx − lastCx, cy − lastCy)
 * / dt position delta, per the "Physics contract". `releaseSpeed` is the ONE
 * value that comes from the gesture's own velocity instead (pt/s): the anchor
 * now tracks the finger directly, so by the release frame the anchor has
 * already stopped moving and the position delta is ~0 — see the kick below.
 */
export function stepBubbleModes(
  state: ModeState,
  cx: number,
  cy: number,
  R: number,
  isActive: number,
  releaseSpeed: number,
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
  // Target MAGNITUDE. The A2_REST floor is the bubble's "memory" — it never
  // returns to a perfect circle.
  const target2 = Math.max(A2_REST, Math.min(A2_MAX, speed / SPEED_REF));

  // Target DIRECTION, as a unit vector in double-angle space. See the ModeState
  // doc for why this is a vector and not an angle lerp.
  let tux: number;
  let tuy: number;
  const mag = Math.hypot(state.c2, state.s2);

  if (speed > PHI2_SPEED_THRESHOLD) {
    // Moving: aim the stretch axis at 2 * motion angle.
    const dbl = 2 * angle;
    tux = Math.cos(dbl);
    tuy = Math.sin(dbl);
  } else if (mag > EPS) {
    // At rest: keep the last motion axis and rotate it slowly, so the stretch
    // axis never freezes. Rotating the TARGET (not the state) means the spring
    // still governs how the shape gets there.
    const ca = Math.cos(PHI_DRIFT * dt);
    const sa = Math.sin(PHI_DRIFT * dt);
    tux = (state.c2 * ca - state.s2 * sa) / mag;
    tuy = (state.c2 * sa + state.s2 * ca) / mag;
  } else {
    // Degenerate: no axis to preserve, pick one.
    tux = 1;
    tuy = 0;
  }

  // Release kick: isActive 1 → 0 edge seeds modes 3/4 so they ring out.
  // Scaled by `releaseSpeed` (the gesture's own fling velocity), NOT by the
  // position-delta `speed` above: the anchor now tracks the finger directly,
  // so on the release frame the anchor has already stopped and the
  // position-delta speed is ~0 — reading it here would silently kill the kick.
  if (state.lastIsActive === 1 && isActive === 0) {
    state.v3 += KICK * releaseSpeed;
    state.v4 -= KICK * releaseSpeed * KICK_V4_SCALE;
  }
  state.lastIsActive = isActive;

  // ---- modes 3/4: idle breathing targets around their rest floors ----
  const target3 = A3_REST + A3_IDLE * Math.sin(state.t * IDLE_FREQ_3);
  const target4 = A4_REST + A4_IDLE * Math.sin(state.t * IDLE_FREQ_4 + IDLE_PHASE_4);

  // ---- spring-integrate each amplitude, inline (see module doc) ----
  // Mode 2: both vector components share one spring (K2/C2), so the pair
  // behaves isotropically — no axis is stiffer than another.
  state.vc2 += (K2 * (target2 * tux - state.c2) - C2 * state.vc2) * dt;
  state.c2 += state.vc2 * dt;
  state.vs2 += (K2 * (target2 * tuy - state.s2) - C2 * state.vs2) * dt;
  state.s2 += state.vs2 * dt;

  // Clamp the MAGNITUDE (not each component) so the cap is a disc, not a
  // square — clamping components independently would bias diagonal axes.
  state.a2 = Math.hypot(state.c2, state.s2);
  if (state.a2 > A_MAX) {
    const k = A_MAX / state.a2;
    state.c2 *= k;
    state.s2 *= k;
    state.a2 = A_MAX;
  }
  state.phi2 = state.a2 > EPS ? Math.atan2(state.s2, state.c2) : 0;

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
