/**
 * Liquid Bubbles — harmonic mode physics (steps the damped modes).
 * Design notes: README.md → "hooks/bubbleModeMath.ts".
 */

import {
  A2_MAX,
  A2_MAX_CEIL,
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
  KICK_W_2,
  KICK_W_3,
  KICK_W_4,
  MULT_MIN,
  PARAM_FLOATS,
  PHI2_SPEED_THRESHOLD,
  PHI3_REST,
  PHI4_REST,
  SPEED_REF,
  TAU_W,
  TURN_EPS,
  W_FLOOR_2,
  W_FLOOR_3,
  W_FLOOR_4,
  W_MAX,
} from "../bubbleModes";

/** Below this magnitude a mode-2 vector has no meaningful direction. */
const EPS = 1e-9;

// ============================================================================
// Types
// ============================================================================

export type ModeState = {
  /**
   * Mode 2 is a VECTOR in double-angle space (`c2 = a2·cos(phi2)`,
   * `s2 = a2·sin(phi2)`), not (amplitude, angle): a 90° drag turn is an
   * antipodal π jump in `phi2` where an angle lerp would pivot arbitrarily;
   * the vector de-stretches and re-stretches on the new axis instead.
   */
  c2: number;
  s2: number;
  vc2: number;
  vs2: number;
  /** Derived each step from (`c2`, `s2`) for output/tests; `a2` is a magnitude (never negative). */
  a2: number;
  phi2: number;
  a3: number;
  v3: number;
  /** Modes 3/4 phase: advances by `w3·dt`/`w4·dt` every frame, seeded from `PHI3_REST`/`PHI4_REST`. */
  phi3: number;
  a4: number;
  v4: number;
  phi4: number;
  /**
   * Phase angular velocity per mode, rad/s. Relaxes to `W_FLOOR_k` with `TAU_W`,
   * kicked on pan release. `w2` rotates the mode-2 vector; `w3`/`w4` advance `phi3`/`phi4`.
   */
  w2: number;
  w3: number;
  w4: number;
  /** Previous NON-ZERO gesture velocity (pt/s); kept so a zeroed release frame doesn't wipe the turn history. */
  prevVelX: number;
  prevVelY: number;
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

/** Build a fresh mode state at the rest floors (`a2 = A2_REST`, never a perfect circle). */
export function createModeState(cx: number, cy: number): ModeState {
  "worklet";
  return {
    c2: A2_REST,
    s2: 0,
    vc2: 0,
    vs2: 0,
    a2: A2_REST,
    phi2: 0,
    a3: A3_REST,
    v3: 0,
    phi3: PHI3_REST,
    a4: A4_REST,
    v4: 0,
    phi4: PHI4_REST,
    w2: W_FLOOR_2,
    w3: W_FLOOR_3,
    w4: W_FLOOR_4,
    prevVelX: 0,
    prevVelY: 0,
    filmPhase: 0,
    lastCx: cx,
    lastCy: cy,
    lastIsActive: 0,
    t: 0,
  };
}

/** Allocate one zeroed shader buffer (`PARAM_FLOATS`); init only, never per frame. */
export function createParamBuffer(): number[] {
  "worklet";
  const buf: number[] = [];
  for (let i = 0; i < PARAM_FLOATS; i++) {
    buf.push(0);
  }
  return buf;
}

/** Reset an existing state in place to the rest pose (no new object). */
export function resetModeState(state: ModeState, cx: number, cy: number): void {
  "worklet";
  state.c2 = A2_REST;
  state.s2 = 0;
  state.vc2 = 0;
  state.vs2 = 0;
  state.a2 = A2_REST;
  state.phi2 = 0;
  state.a3 = A3_REST;
  state.v3 = 0;
  state.phi3 = PHI3_REST;
  state.a4 = A4_REST;
  state.v4 = 0;
  state.phi4 = PHI4_REST;
  state.w2 = W_FLOOR_2;
  state.w3 = W_FLOOR_3;
  state.w4 = W_FLOOR_4;
  state.prevVelX = 0;
  state.prevVelY = 0;
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
 * `outBuf` is length `PARAM_FLOATS`; `outBbox` is mutated in place; nothing allocates.
 *
 * `velX`/`velY` are the gesture's own velocity (pt/s), used only for the
 * release kick: the anchor tracks the finger, so its position delta is ~0 by
 * the release frame. `wobble` is the master wobble multiplier (applied flat).
 * `inertia`/`strength` (default 1, floored by `MULT_MIN`) scale every spring's
 * K and C by `strength / inertia`; inertia alone also scales the kicks and the
 * mode-2 stretch cap.
 */
export function stepBubbleModes(
  state: ModeState,
  cx: number,
  cy: number,
  R: number,
  wobble: number,
  isActive: number,
  velX: number,
  velY: number,
  dtMs: number,
  outBuf: number[],
  outBbox: Bbox,
  inertia = 1,
  strength = 1,
): void {
  "worklet";
  const clampedMs = Math.min(Math.max(dtMs, DT_MIN_MS), DT_MAX_MS);
  const dt = clampedMs / 1000;

  // Guarded against zero/negative sliders; springScale scales every K and C.
  const I = Math.max(inertia, MULT_MIN);
  const S = Math.max(strength, MULT_MIN);
  const springScale = S / I;

  // Applied flat, not divided by R: the wobble grows with the bubble.
  const vis = wobble;

  // Motion direction + speed of the anchor center (direction is dt-independent).
  const dx = cx - state.lastCx;
  const dy = cy - state.lastCy;
  const speed = Math.hypot(dx, dy) / dt;
  const angle = Math.atan2(dy, dx);
  state.lastCx = cx;
  state.lastCy = cy;
  state.t += dt;

  // ---- mode 2: drag stretch, with a rest floor so it never fully relaxes ----
  // Target magnitude; the stretch cap grows with inertia, up to A2_MAX_CEIL.
  const a2Max = Math.min(A2_MAX_CEIL, A2_MAX * I);
  const target2 = Math.max(A2_REST, Math.min(a2Max, speed / SPEED_REF));

  // Target direction: unit vector in double-angle space (see ModeState).
  let tux: number;
  let tuy: number;
  const mag = Math.hypot(state.c2, state.s2);

  if (speed > PHI2_SPEED_THRESHOLD) {
    // Moving: aim the stretch axis at 2 * motion angle.
    const dbl = 2 * angle;
    tux = Math.cos(dbl);
    tuy = Math.sin(dbl);
  } else if (mag > EPS) {
    // At rest: hold the current axis (the w2 rotation below keeps it moving).
    tux = state.c2 / mag;
    tuy = state.s2 / mag;
  } else {
    // Degenerate: no axis to preserve, pick one.
    tux = 1;
    tuy = 0;
  }

  // Release kick (isActive 1 → 0): seeds modes 3/4 and w2/w3/w4. Uses the
  // gesture's fling velocity, NOT `speed` (~0 on the release frame).
  if (state.lastIsActive === 1 && isActive === 0) {
    const flingSpeed = Math.hypot(velX, velY);
    // Scaled by `vis` and `I`.
    state.v3 += KICK * flingSpeed * vis * I;
    state.v4 -= KICK * flingSpeed * KICK_V4_SCALE * vis * I;

    // turn = cross(prevVel, vel) / (|prevVel|·|vel|), −1..1; below TURN_EPS it is 0.
    const prevMag = Math.hypot(state.prevVelX, state.prevVelY);
    if (prevMag > EPS && flingSpeed > EPS) {
      let turn =
        (state.prevVelX * velY - state.prevVelY * velX) /
        (prevMag * flingSpeed);
      if (Math.abs(turn) < TURN_EPS) {
        turn = 0;
      }
      state.w2 = Math.min(
        W_MAX,
        Math.max(-W_MAX, state.w2 + KICK_W_2 * flingSpeed * turn * I),
      );
      state.w3 = Math.min(
        W_MAX,
        Math.max(-W_MAX, state.w3 + KICK_W_3 * flingSpeed * turn * I),
      );
      state.w4 = Math.min(
        W_MAX,
        Math.max(-W_MAX, state.w4 + KICK_W_4 * flingSpeed * turn * I),
      );
    }
  }
  state.lastIsActive = isActive;

  // Remember the last non-zero velocity for the next release's turn.
  if (Math.hypot(velX, velY) > EPS) {
    state.prevVelX = velX;
    state.prevVelY = velY;
  }

  // ---- modes 3/4: idle breathing targets around their rest floors ----
  // Scaling the spring TARGET keeps overshoot/ring/settle unchanged (linear spring).
  // Divided by `S`: a weak surface sits more deformed at rest.
  const idleVis = vis / S;
  const target3 =
    (A3_REST + A3_IDLE * Math.sin(state.t * IDLE_FREQ_3)) * idleVis;
  const target4 =
    (A4_REST + A4_IDLE * Math.sin(state.t * IDLE_FREQ_4 + IDLE_PHASE_4)) *
    idleVis;

  // ---- spring-integrate each amplitude, inline (no helper: worklet gotcha) ----
  // Mode 2: both vector components share one spring, so no axis is stiffer.
  state.vc2 +=
    (K2 * springScale * (target2 * tux - state.c2) -
      C2 * springScale * state.vc2) *
    dt;
  state.c2 += state.vc2 * dt;
  state.vs2 +=
    (K2 * springScale * (target2 * tuy - state.s2) -
      C2 * springScale * state.vs2) *
    dt;
  state.s2 += state.vs2 * dt;

  // Clamp the magnitude (a disc), not each component, to avoid biasing diagonals.
  state.a2 = Math.hypot(state.c2, state.s2);
  if (state.a2 > A_MAX) {
    const k = A_MAX / state.a2;
    state.c2 *= k;
    state.s2 *= k;
    state.a2 = A_MAX;
  }

  // ---- traveling wave: rotate the mode-2 vector by w2*dt (magnitude unchanged) ----
  const w2dt = state.w2 * dt;
  const cw2 = Math.cos(w2dt);
  const sw2 = Math.sin(w2dt);
  const rc2 = state.c2 * cw2 - state.s2 * sw2;
  const rs2 = state.c2 * sw2 + state.s2 * cw2;
  state.c2 = rc2;
  state.s2 = rs2;
  state.phi2 = state.a2 > EPS ? Math.atan2(state.s2, state.c2) : 0;

  state.v3 +=
    (K3 * springScale * (target3 - state.a3) - C3 * springScale * state.v3) *
    dt;
  state.a3 += state.v3 * dt;
  state.a3 = Math.min(A_MAX, Math.max(-A_MAX, state.a3));
  // Traveling wave: phi3 advances by w3*dt.
  state.phi3 += state.w3 * dt;

  state.v4 +=
    (K4 * springScale * (target4 - state.a4) - C4 * springScale * state.v4) *
    dt;
  state.a4 += state.v4 * dt;
  state.a4 = Math.min(A_MAX, Math.max(-A_MAX, state.a4));
  // Traveling wave: phi4 advances by w4*dt.
  state.phi4 += state.w4 * dt;

  // Relax w_k toward its floor (slower than the ring-out on purpose).
  state.w2 += (W_FLOOR_2 - state.w2) * (dt / TAU_W);
  state.w3 += (W_FLOOR_3 - state.w3) * (dt / TAU_W);
  state.w4 += (W_FLOOR_4 - state.w4) * (dt / TAU_W);

  state.filmPhase += dt * FILM_DRIFT;

  // ---- output buffer: [0] cx,cy,R,_  [1] a2,phi2,a3,phi3  [2] a4,phi4,filmPhase,_ ----
  outBuf[0] = cx;
  outBuf[1] = cy;
  outBuf[2] = R;
  outBuf[3] = 0;
  outBuf[4] = state.a2;
  outBuf[5] = state.phi2;
  outBuf[6] = state.a3;
  outBuf[7] = state.phi3;
  outBuf[8] = state.a4;
  outBuf[9] = state.phi4;
  outBuf[10] = state.filmPhase;
  outBuf[11] = 0;

  // ---- bbox: half = R * (1 + |a2| + |a3| + |a4|) + PAD ----
  const half =
    R * (1 + Math.abs(state.a2) + Math.abs(state.a3) + Math.abs(state.a4)) +
    BBOX_PAD;
  outBbox.x = cx - half;
  outBbox.y = cy - half;
  outBbox.w = 2 * half;
  outBbox.h = 2 * half;
}
