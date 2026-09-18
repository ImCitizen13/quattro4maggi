/**
 * Liquid Bubbles — harmonic mode physics (steps the damped modes).
 * Design notes: README.md → "hooks/bubbleModeMath.ts".
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
  KICK_W_2,
  KICK_W_3,
  KICK_W_4,
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
  /**
   * Modes 3/4's phase, mutable since phase 9B: it no longer sits at a fixed
   * `PHI3_REST`/`PHI4_REST` — it ADVANCES by `w3·dt`/`w4·dt` every frame (the
   * traveling wave), seeded from those rest constants.
   */
  phi3: number;
  a4: number;
  v4: number;
  phi4: number;
  /**
   * Phase angular velocity per mode, rad/s (phase 9B "traveling waves"). Each
   * relaxes toward its `W_FLOOR_k` (see `bubbleModes.ts`) with time constant
   * `TAU_W`, and is kicked on a pan release by the fling velocity's turn —
   * see `stepBubbleModes`. `w2` rotates the mode-2 VECTOR (`c2`, `s2`)
   * directly; `w3`/`w4` advance `phi3`/`phi4`. W_FLOOR_2 replaces the old
   * PHI_DRIFT target-rotation at rest.
   */
  w2: number;
  w3: number;
  w4: number;
  /**
   * Previous NON-ZERO gesture velocity sample (pt/s). Only overwritten when
   * the incoming sample is non-zero, so a zeroed release/finalize frame does
   * not wipe the history the next release's turn calculation needs.
   */
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
    phi3: PHI3_REST,
    a4: A4_REST,
    v4: 0,
    phi4: PHI4_REST,
    // Seeded at the floor, not 0: the idle "clock tick" is present from the
    // first frame, same reasoning as the amplitude rest floors above.
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
 *
 * `outBuf` must be length `PARAM_FLOATS` (12); `outBbox` is mutated in
 * place. Neither this function nor its helpers allocate.
 *
 * The mode-2 drive speed/angle are derived from the (cx − lastCx, cy − lastCy)
 * / dt position delta, per the "Physics contract". `velX`/`velY` are the
 * gesture's OWN velocity (pt/s), used only for the release kick (amplitude
 * and, since phase 9B, the traveling-wave turn): the anchor tracks the
 * finger directly, so by the release frame the anchor has already stopped
 * moving and the position delta is ~0 — see the kick below.
 *
 * `wobble` is the live master visibility knob over the mode 3/4 wobble (see
 * `bubbleModes.ts` → "Wobble visibility"): 0 suppresses it, 1 reproduces the
 * tuning above exactly, 2 doubles it. It is applied FLAT — the amplitudes stay
 * fractions of `R`, so the wobble grows with the bubble.
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
): void {
  'worklet';
  const clampedMs = Math.min(Math.max(dtMs, DT_MIN_MS), DT_MAX_MS);
  const dt = clampedMs / 1000;

  // Wobble visibility, applied flat (see `bubbleModes.ts` → "Wobble
  // visibility" for why this is NOT divided by R). The amplitudes stay
  // fractions of R, so a bigger bubble wobbles proportionally more — which is
  // the end of the range where the lobes have room to read at all. `A_MAX`
  // remains the only ceiling.
  const vis = wobble;

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
    // At rest: hold the CURRENT axis — no PHI_DRIFT target-rotation. The
    // traveling-wave rotation below (w2) is what keeps the axis from
    // freezing now; W_FLOOR_2 replaces PHI_DRIFT (phase 9B).
    tux = state.c2 / mag;
    tuy = state.s2 / mag;
  } else {
    // Degenerate: no axis to preserve, pick one.
    tux = 1;
    tuy = 0;
  }

  // Release kick: isActive 1 → 0 edge seeds modes 3/4 (amplitude) so they
  // ring out, and w2/w3/w4 (phase 9B, traveling-wave circulation) from the
  // handedness of the fling. Scaled by the gesture's own fling velocity
  // (`velX`/`velY`), NOT by the position-delta `speed` above: the anchor
  // tracks the finger directly, so on the release frame the anchor has
  // already stopped and the position-delta speed is ~0 — reading it here
  // would silently kill the kick.
  if (state.lastIsActive === 1 && isActive === 0) {
    const flingSpeed = Math.hypot(velX, velY);
    // Scaled by `vis` too: without it, a bigger rest wobble (wobble > 1)
    // would leave the release kick looking comparatively flat next to it.
    state.v3 += KICK * flingSpeed * vis;
    state.v4 -= KICK * flingSpeed * KICK_V4_SCALE * vis;

    // turn = cross(prevVel, vel) / (|prevVel|·|vel|), −1..1, sign = handedness
    // of the curve between the last two non-zero gesture velocity samples.
    // Below TURN_EPS (or if either sample is degenerate) it is forced to 0:
    // a straight fling kicks no circulation.
    const prevMag = Math.hypot(state.prevVelX, state.prevVelY);
    if (prevMag > EPS && flingSpeed > EPS) {
      let turn = (state.prevVelX * velY - state.prevVelY * velX) / (prevMag * flingSpeed);
      if (Math.abs(turn) < TURN_EPS) {
        turn = 0;
      }
      state.w2 = Math.min(W_MAX, Math.max(-W_MAX, state.w2 + KICK_W_2 * flingSpeed * turn));
      state.w3 = Math.min(W_MAX, Math.max(-W_MAX, state.w3 + KICK_W_3 * flingSpeed * turn));
      state.w4 = Math.min(W_MAX, Math.max(-W_MAX, state.w4 + KICK_W_4 * flingSpeed * turn));
    }
  }
  state.lastIsActive = isActive;

  // Track the last NON-ZERO gesture velocity sample for the NEXT release's
  // turn calculation — only when non-zero, so a zeroed release/finalize
  // frame does not wipe the history a moment before it is needed.
  if (Math.hypot(velX, velY) > EPS) {
    state.prevVelX = velX;
    state.prevVelY = velY;
  }

  // ---- modes 3/4: idle breathing targets around their rest floors ----
  // Scaling the spring TARGET (not the spring output) is intentional and is
  // what keeps the tuned character intact: the spring is linear, so scaling
  // its target scales the settled amplitude by the same factor while leaving
  // overshoot percentage, ring frequency and settle time all UNCHANGED — only
  // the size of the wobble changes, not its feel.
  const target3 = (A3_REST + A3_IDLE * Math.sin(state.t * IDLE_FREQ_3)) * vis;
  const target4 =
    (A4_REST + A4_IDLE * Math.sin(state.t * IDLE_FREQ_4 + IDLE_PHASE_4)) * vis;

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

  // ---- traveling wave: rotate the mode-2 VECTOR by w2*dt (phase 9B) ----
  // A 2D rotation, so the magnitude is unchanged — this is layered on top of
  // the spring pull above, not a replacement for it.
  const w2dt = state.w2 * dt;
  const cw2 = Math.cos(w2dt);
  const sw2 = Math.sin(w2dt);
  const rc2 = state.c2 * cw2 - state.s2 * sw2;
  const rs2 = state.c2 * sw2 + state.s2 * cw2;
  state.c2 = rc2;
  state.s2 = rs2;
  state.phi2 = state.a2 > EPS ? Math.atan2(state.s2, state.c2) : 0;

  state.v3 += (K3 * (target3 - state.a3) - C3 * state.v3) * dt;
  state.a3 += state.v3 * dt;
  state.a3 = Math.min(A_MAX, Math.max(-A_MAX, state.a3));
  // Traveling wave: phi3 advances by w3*dt every frame (phase 9B).
  state.phi3 += state.w3 * dt;

  state.v4 += (K4 * (target4 - state.a4) - C4 * state.v4) * dt;
  state.a4 += state.v4 * dt;
  state.a4 = Math.min(A_MAX, Math.max(-A_MAX, state.a4));
  // Traveling wave: phi4 advances by w4*dt every frame (phase 9B).
  state.phi4 += state.w4 * dt;

  // Relax each phase angular velocity toward its floor — slower than the
  // amplitude damping on purpose, so circulation outlives the ring-out.
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
    R * (1 + Math.abs(state.a2) + Math.abs(state.a3) + Math.abs(state.a4)) + BBOX_PAD;
  outBbox.x = cx - half;
  outBbox.y = cy - half;
  outBbox.w = 2 * half;
  outBbox.h = 2 * half;
}
