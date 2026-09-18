/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import {
  A2_REST,
  A3_IDLE,
  A3_REST,
  A4_IDLE,
  A4_REST,
  A2_MAX_CEIL,
  A_MAX,
  IDLE_FREQ_3,
  PARAM_FLOATS,
  TAU_W,
  W_FLOOR_2,
  W_FLOOR_3,
  W_FLOOR_4,
} from "../bubbleModes";
import {
  createModeState,
  createParamBuffer,
  stepBubbleModes,
  type Bbox,
  type ModeState,
} from "./bubbleModeMath";

const makeBuf = (): number[] => new Array(PARAM_FLOATS).fill(0);
const makeBbox = (): Bbox => ({ x: 0, y: 0, w: 0, h: 0 });

describe("createModeState / createParamBuffer", () => {
  it("starts a2/a3/a4 at their rest floors, never a perfect circle", () => {
    const state = createModeState(100, 200);
    expect(state.a2).toBe(A2_REST);
    expect(state.a3).toBeGreaterThan(0);
    expect(state.a4).toBeGreaterThan(0);
    expect(state.lastCx).toBe(100);
    expect(state.lastCy).toBe(200);
  });

  it("starts w2/w3/w4 at their idle floors", () => {
    const state = createModeState(0, 0);
    expect(state.w2).toBe(W_FLOOR_2);
    expect(state.w3).toBe(W_FLOOR_3);
    expect(state.w4).toBe(W_FLOOR_4);
  });

  it("allocates a zeroed PARAM_FLOATS-length buffer", () => {
    const buf = createParamBuffer();
    expect(buf.length).toBe(PARAM_FLOATS);
    expect(buf.every((v) => v === 0)).toBe(true);
  });
});

describe("stepBubbleModes — amplitude clamp", () => {
  it("keeps every mode amplitude within ±A_MAX under a 1e5 pt/s spike", () => {
    const state = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 16.7;
    const dt = dtMs / 1000;

    // A single-frame jump large enough to hit ~1e5 pt/s.
    const spikeDx = 1e5 * dt;
    let cx = spikeDx;
    const cy = 0;
    stepBubbleModes(state, cx, cy, 40, 1, 1, 0, 0, dtMs, buf, bbox);
    expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);

    // A few more spike frames sustaining the huge speed — the clamp must
    // hold every frame, not just the first.
    for (let f = 0; f < 5; f++) {
      cx += spikeDx;
      stepBubbleModes(state, cx, cy, 40, 1, 1, 0, 0, dtMs, buf, bbox);
      expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);
    }
  });

  it("clamps mode 2 as a disc, not a square — a diagonal axis is capped at A_MAX too", () => {
    const state = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 16.7;
    const dt = dtMs / 1000;

    // Drive hard along a diagonal. Clamping c2/s2 independently would allow a
    // magnitude of A_MAX*sqrt(2) here; clamping the magnitude does not.
    const step = (1e5 * dt) / Math.SQRT2;
    let cx = 0;
    let cy = 0;
    for (let f = 0; f < 8; f++) {
      cx += step;
      cy += step;
      stepBubbleModes(state, cx, cy, 40, 1, 1, 0, 0, dtMs, buf, bbox);
      expect(Math.hypot(state.c2, state.s2)).toBeLessThanOrEqual(A_MAX + 1e-9);
    }
  });
});

describe("stepBubbleModes — release settling", () => {
  it("a2 settles to A2_REST (not 0) and phi2 keeps the drag axis (± the W_FLOOR_2 idle crawl), 1.5s after release", () => {
    const R = 40;
    const dtMs = 15; // 100 frames * 15ms = exactly 1.5s of rest below
    const dt = dtMs / 1000;
    const vx = 800;
    const vy = 600;
    const dragAngle = Math.atan2(vy, vx);

    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();

    let cx = 0;
    let cy = 0;
    // Steady drag for 1s, well beyond the time the K2/C2 spring needs to pull
    // the mode-2 vector onto the drag axis, so phi2 is settled on 2*dragAngle
    // before release.
    const dragFrames = 60;
    for (let f = 0; f < dragFrames; f++) {
      cx += vx * dt;
      cy += vy * dt;
      stepBubbleModes(state, cx, cy, R, 1, 1, 0, 0, dtMs, buf, bbox);
    }

    const phi2AtRelease = state.phi2;
    // Sanity: phi2 actually converged near 2*dragAngle before we start
    // measuring drift from it. Not exact: since phase 9B the w2 rotation
    // (floor W_FLOOR_2) runs every frame, active or not, so the spring holds
    // a small steady-state offset against it rather than sitting dead on
    // the target — a wider tolerance than a bare spring-converged value.
    expect(Math.abs(phi2AtRelease - 2 * dragAngle)).toBeLessThan(0.02);

    // Release: isActive flips to 0, with no fling velocity (0,0) so no
    // release kick fires — isolates the rest-pose drift this test is about.
    // Position stops changing from here on (speed drops to 0), so this is
    // genuinely "at rest".
    const restFrames = 100; // 100 * 15ms = 1.5s
    for (let f = 0; f < restFrames; f++) {
      stepBubbleModes(state, cx, cy, R, 1, 0, 0, 0, dtMs, buf, bbox);
    }

    expect(Math.abs(state.a2 - A2_REST)).toBeLessThanOrEqual(0.005);
    expect(state.a2).not.toBeCloseTo(0, 2); // NOT settled to a perfect circle

    // Phase 9B: at rest the axis is no longer held by a PHI_DRIFT target
    // rotation — it is rotated directly by w2 (seeded at, and relaxed back
    // to, W_FLOOR_2). With no kick, w2 stays at the floor the whole time.
    //
    // Phase 10B split this into two assertions. The mode-2 ring-out is now
    // underdamped enough (C2 14 -> 7) to undershoot to a2 ~ 0.018 on its way
    // down, and while the vector is that short the (deliberately un-rotated)
    // velocity swings its ANGLE by a one-off ~0.19 rad — small tangential
    // velocity over a small radius is a large angle. That excursion is the
    // vector formulation doing exactly what it exists to do (route a change
    // through low amplitude), so it is not something to damp away; it just
    // means "total drift since the release instant" no longer isolates the
    // idle crawl. The crawl RATE is what this test is actually about, so
    // measure it over a window AFTER the ring-out has finished, where it
    // pins down W_FLOOR_2 harder than the old 2-decimal total did.
    const phi2AfterRingOut = state.phi2;
    for (let f = 0; f < restFrames; f++) {
      stepBubbleModes(state, cx, cy, R, 1, 0, 0, 0, dtMs, buf, bbox);
    }
    expect(state.phi2 - phi2AfterRingOut).toBeCloseTo(W_FLOOR_2 * 1.5, 3);

    // And the axis is still KEPT, not swept: the whole post-release excursion
    // (ring-out wander + crawl) stays far below the quarter turn that a
    // runaway rotation or an angle-lerp pivot would produce.
    expect(Math.abs(phi2AfterRingOut - phi2AtRelease)).toBeLessThan(0.3);
  });
});

describe("stepBubbleModes — mode 2 direction changes", () => {
  /** Drag at a fixed angle for `frames`, returning the final state. */
  const drag = (
    state: ModeState,
    angle: number,
    speed: number,
    frames: number,
    from: { cx: number; cy: number },
  ) => {
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    for (let f = 0; f < frames; f++) {
      from.cx += Math.cos(angle) * speed * dt;
      from.cy += Math.sin(angle) * speed * dt;
      stepBubbleModes(state, from.cx, from.cy, 40, 1, 1, 0, 0, dtMs, buf, bbox);
    }
  };

  it("reversing along the same axis does not move the stretch axis", () => {
    // Mode 2 is symmetric: an axis, not an arrow. Dragging left must give the
    // same stretch axis as dragging right, because phi2 = 2 * angle makes a
    // pi flip in motion direction a 2*pi (identity) change in phase.
    const state: ModeState = createModeState(0, 0);
    const pos = { cx: 0, cy: 0 };
    drag(state, 0, 900, 40, pos); // rightward
    const axisAfterRight = Math.atan2(state.s2, state.c2);

    drag(state, Math.PI, 900, 40, pos); // leftward, same axis
    const axisAfterLeft = Math.atan2(state.s2, state.c2);

    // Allow for the slow W_FLOOR_2 idle crawl (present every frame, active or
    // not, since phase 9B), but nothing like a rotation.
    expect(Math.abs(axisAfterLeft - axisAfterRight)).toBeLessThan(0.2);
  });

  it("turning a corner de-stretches instead of pivoting the lobe", () => {
    // This is the regression this vector formulation exists to prevent. A
    // horizontal -> vertical turn is a pi change in phi2 — the antipodal case
    // where an angle lerp has no shorter side, so it sweeps the lobe through
    // every intermediate axis (a visible rotation, with arbitrary handedness).
    // Springing the VECTOR routes through low amplitude instead.
    const state: ModeState = createModeState(0, 0);
    const pos = { cx: 0, cy: 0 };
    drag(state, 0, 900, 40, pos); // settle on the horizontal axis
    const a2Before = state.a2;
    expect(a2Before).toBeGreaterThan(A2_REST); // actually stretched

    // Now turn 90 degrees and sample the amplitude every frame through the
    // transition.
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    let minA2 = Infinity;
    for (let f = 0; f < 20; f++) {
      pos.cy += 900 * dt;
      stepBubbleModes(state, pos.cx, pos.cy, 40, 1, 1, 0, 0, dtMs, buf, bbox);
      minA2 = Math.min(minA2, state.a2);
    }

    // The amplitude must dip on the way across — that dip IS the de-stretch.
    // An angle lerp would hold |a2| roughly constant and rotate instead.
    expect(minA2).toBeLessThan(a2Before * 0.75);
    // And it must come back out on the new axis.
    expect(state.a2).toBeGreaterThan(A2_REST);
  });
});

describe("stepBubbleModes — release kick (amplitude)", () => {
  it("fires off the gesture fling velocity, not the (already-stopped) anchor delta", () => {
    // The anchor tracks the finger directly, so on the release frame the
    // position delta is ~0. If the kick read that, it would always be zero.
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;

    const withFling: ModeState = createModeState(0, 0);
    stepBubbleModes(withFling, 0, 0, 40, 1, 1, 0, 0, dtMs, buf, bbox); // active
    stepBubbleModes(withFling, 0, 0, 40, 1, 0, 2500, 0, dtMs, buf, bbox); // release, fling (2500, 0)

    const noFling: ModeState = createModeState(0, 0);
    stepBubbleModes(noFling, 0, 0, 40, 1, 1, 0, 0, dtMs, buf, bbox);
    stepBubbleModes(noFling, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox);

    // A fling must impart strictly more mode-3 velocity than a dead release.
    expect(withFling.v3).toBeGreaterThan(noFling.v3);
    // And mode 4 is kicked the other way (KICK_V4_SCALE, negative).
    expect(withFling.v4).toBeLessThan(noFling.v4);
  });
});

describe("stepBubbleModes — idle rest pose", () => {
  it("never collapses to a circle at rest: |a2|+|a3|+|a4| holds its floor at every sampled frame over 10s", () => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const frames = 600; // 10s

    // Derived from the constants rather than hardcoded: the idle targets sit
    // at A*_REST ± A*_IDLE, so the least non-circular the rest pose can get is
    // the sum of each mode's trough. A previous hardcoded 0.05 was calibrated
    // for A2_REST = 0.04 and silently became wrong when the floor was retuned.
    // The 0.9 leaves room for the springs lagging their targets; a genuine
    // collapse (a mode failing to hold its floor at all) falls far below this.
    const restFloor =
      A2_REST + (A3_REST - A3_IDLE) + (A4_REST - A4_IDLE);

    for (let f = 0; f < frames; f++) {
      stepBubbleModes(state, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox);
      const sum = Math.abs(state.a2) + Math.abs(state.a3) + Math.abs(state.a4);
      expect(sum).toBeGreaterThan(restFloor * 0.9);
    }
  });
});

// ============================================================================
// Phase 9B — traveling waves
// ============================================================================

describe("stepBubbleModes — traveling waves at rest", () => {
  it("phi3 advances by W_FLOOR_3*t within 1e-3 over 2s, and mode 2's direction rotates by W_FLOOR_2*t", () => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    const seconds = 2;
    const frames = Math.round(seconds / dt);

    const phi3Start = state.phi3;
    const axisStart = Math.atan2(state.s2, state.c2);

    for (let f = 0; f < frames; f++) {
      stepBubbleModes(state, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox);
    }

    const elapsed = frames * dt;
    expect(state.phi3 - phi3Start).toBeCloseTo(W_FLOOR_3 * elapsed, 3);

    const axisEnd = Math.atan2(state.s2, state.c2);
    // Wrap the delta into (-pi, pi] before comparing — atan2 wraps, the
    // physical rotation does not.
    let axisDelta = axisEnd - axisStart;
    while (axisDelta > Math.PI) axisDelta -= 2 * Math.PI;
    while (axisDelta < -Math.PI) axisDelta += 2 * Math.PI;
    expect(axisDelta).toBeCloseTo(W_FLOOR_2 * elapsed, 3);
  });
});

describe("stepBubbleModes — traveling wave release kick", () => {
  /**
   * Drive a straight active drag (to build a non-zero `prevVel` history),
   * then release with a fling velocity at `releaseAngle` — the angle between
   * the drag direction and the release velocity determines `turn`.
   */
  const flingThenRelease = (releaseAngle: number, dragSpeed = 800): ModeState => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;

    // A few active frames with a steady rightward gesture velocity, so
    // prevVelX/Y holds a settled (800, 0) sample by the time we release.
    let cx = 0;
    for (let f = 0; f < 5; f++) {
      cx += dragSpeed * (dtMs / 1000);
      stepBubbleModes(state, cx, 0, 40, 1, 1, dragSpeed, 0, dtMs, buf, bbox);
    }

    // Release with a fling velocity turned by `releaseAngle` from the drag
    // direction — same magnitude, so |turn| = |sin(releaseAngle)|.
    const relVx = dragSpeed * Math.cos(releaseAngle);
    const relVy = dragSpeed * Math.sin(releaseAngle);
    stepBubbleModes(state, cx, 0, 40, 1, 0, relVx, relVy, dtMs, buf, bbox);

    return state;
  };

  it("a curved fling (turning counter-clockwise) kicks w3 above its floor, decaying below 5% excess within TAU_W*3", () => {
    const state = flingThenRelease(Math.PI / 2); // 90 deg CCW turn, turn ~= 1
    const w3AtRelease = state.w3;
    expect(w3AtRelease).toBeGreaterThan(W_FLOOR_3);

    const excess0 = w3AtRelease - W_FLOOR_3;
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    const frames = Math.round((TAU_W * 3) / dt);
    for (let f = 0; f < frames; f++) {
      stepBubbleModes(state, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox);
    }
    const excessNow = state.w3 - W_FLOOR_3;
    expect(Math.abs(excessNow)).toBeLessThan(Math.abs(excess0) * 0.05);
  });

  it("a straight fling (turn ~ 0) leaves w2/w3/w4 at their floors", () => {
    const state = flingThenRelease(0); // same direction as the drag, turn = 0
    expect(state.w2).toBeCloseTo(W_FLOOR_2, 9);
    expect(state.w3).toBeCloseTo(W_FLOOR_3, 9);
    expect(state.w4).toBeCloseTo(W_FLOOR_4, 9);
  });

  it("a mirrored fling (turning clockwise) flips the sign of the kick", () => {
    // Deliberately a SLOW fling (120 pt/s, not the 800 the other cases use).
    // This test is about the sign symmetry of the kick itself, and after the
    // phase-10B KICK_W_k retune an 800 pt/s release with |turn| = 1 saturates
    // W_MAX. Saturation is not symmetric about a NON-ZERO floor — +W_MAX is
    // (W_MAX - floor) of excess while -W_MAX is (W_MAX + floor) — so at 800
    // this would be measuring the clamp, not the kick. 120 pt/s keeps both
    // signs inside |w_k| < W_MAX, which is what makes the exact 9-digit
    // comparison below meaningful rather than merely passable.
    const ccw = flingThenRelease(Math.PI / 2, 120);
    const cw = flingThenRelease(-Math.PI / 2, 120);

    const ccwExcess3 = ccw.w3 - W_FLOOR_3;
    const cwExcess3 = cw.w3 - W_FLOOR_3;
    expect(ccwExcess3).toBeGreaterThan(0);
    expect(cwExcess3).toBeLessThan(0);
    expect(cwExcess3).toBeCloseTo(-ccwExcess3, 9);

    const ccwExcess4 = ccw.w4 - W_FLOOR_4;
    const cwExcess4 = cw.w4 - W_FLOOR_4;
    expect(ccwExcess4).toBeGreaterThan(0);
    expect(cwExcess4).toBeLessThan(0);
  });

  it("never lets any |a_k| exceed A_MAX across a curved-fling release and its decay", () => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    const dragSpeed = 800;

    let cx = 0;
    const check = () => {
      expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);
    };

    for (let f = 0; f < 5; f++) {
      cx += dragSpeed * dt;
      stepBubbleModes(state, cx, 0, 40, 1, 1, dragSpeed, 0, dtMs, buf, bbox);
      check();
    }
    // Release with a 90 degree turn — the largest kick this scenario applies.
    stepBubbleModes(state, cx, 0, 40, 1, 0, 0, dragSpeed, dtMs, buf, bbox);
    check();

    const decayFrames = Math.round((TAU_W * 3) / dt);
    for (let f = 0; f < decayFrames; f++) {
      stepBubbleModes(state, cx, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox);
      check();
    }
  });
});

// ============================================================================
// Wobble visibility master knob
// ============================================================================

describe("stepBubbleModes — wobble visibility", () => {
  /** The radius the mode 3/4 amplitudes were tuned at — `LiquidBubbles`' `restRadius`. */
  const REST_R = 40;

  /**
   * Settle the mode-3 amplitude at rest (no drag, no kicks — isolates the
   * idle-breathing target) for a fixed number of frames at a fixed dt, so
   * `state.t` (and therefore `sin(state.t * IDLE_FREQ_3)`) lands on the exact
   * same value across calls with different `wobble`/`R` — only the spring's
   * settled AMPLITUDE differs, not the phase being compared.
   */
  const settledA3 = (wobble: number, R: number, frames = 300): number => {
    const state = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    for (let f = 0; f < frames; f++) {
      stepBubbleModes(state, 0, 0, R, wobble, 0, 0, 0, dtMs, buf, bbox);
    }
    return state.a3;
  };

  it("wobble = 1 at R = REST_R is a no-op: matches the un-scaled idle target", () => {
    const state = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    const frames = 300;
    for (let f = 0; f < frames; f++) {
      stepBubbleModes(state, 0, 0, REST_R, 1, 0, 0, 0, dtMs, buf, bbox);
    }
    const t = frames * dt;
    const expectedTarget = A3_REST + A3_IDLE * Math.sin(t * IDLE_FREQ_3);
    // The spring lags its target by a small steady-state phase error, same as
    // every other settling test in this file — not an exact match.
    expect(state.a3).toBeCloseTo(expectedTarget, 1);
  });

  it("wobble = 0 drives a3/a4 to ~0 after settling", () => {
    const state = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    for (let f = 0; f < 300; f++) {
      stepBubbleModes(state, 0, 0, REST_R, 0, 0, 0, 0, dtMs, buf, bbox);
    }
    expect(Math.abs(state.a3)).toBeLessThan(1e-3);
    expect(Math.abs(state.a4)).toBeLessThan(1e-3);
  });

  it("doubling wobble roughly doubles the settled a3 amplitude", () => {
    const a3AtOne = settledA3(1, REST_R);
    const a3AtTwo = settledA3(2, REST_R);
    expect(a3AtTwo).toBeCloseTo(2 * a3AtOne, 2);
  });

  it("is proportional, not radius-compensated: the settled a3 FRACTION is the same at every R", () => {
    // `a3` is a fraction of R, and `vis` is applied flat — so the fraction is
    // radius-independent and the wobble in POINTS (a3 * R) grows with the
    // bubble. This is the deliberate choice: see `bubbleModes.ts` → "Wobble
    // visibility" for why the radius-compensated variant was dropped.
    const a3AtRest = settledA3(1, REST_R);
    const a3AtDoubleR = settledA3(1, 2 * REST_R);
    const a3AtMaxR = settledA3(1, 140);

    expect(a3AtDoubleR).toBeCloseTo(a3AtRest, 6);
    expect(a3AtMaxR).toBeCloseTo(a3AtRest, 6);

    // The visible excursion in POINTS therefore scales with R: 140/40 = 3.5x
    // at the max pinch radius.
    expect(a3AtMaxR * 140).toBeCloseTo((a3AtRest * REST_R * 140) / REST_R, 6);
  });

  it("stays inside A_MAX at the top of the slider range", () => {
    // The slider goes to 3 and `A_MAX` is the only ceiling left now that the
    // compensation clamp is gone — check the top of the range is still clear
    // of it rather than clipping the idle breathing into a flat hold.
    const a3AtMax = settledA3(3, REST_R);
    expect(Math.abs(a3AtMax)).toBeLessThan(A_MAX);
  });
});

// ============================================================================
// Per-bubble inertia and strength
// ============================================================================

describe("stepBubbleModes — per-bubble inertia and strength", () => {
  /** Drag rightward at `speed` pt/s for `frames`, then release with a fling. */
  const dragThenRelease = (
    state: ModeState,
    speed: number,
    frames: number,
    flingVx: number,
    flingVy: number,
    inertia?: number,
    strength?: number,
  ): void => {
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    let cx = state.lastCx;
    for (let f = 0; f < frames; f++) {
      cx += speed * dt;
      stepBubbleModes(state, cx, 0, 40, 1, 1, speed, 0, dtMs, buf, bbox, inertia, strength);
    }
    stepBubbleModes(state, cx, 0, 40, 1, 0, flingVx, flingVy, dtMs, buf, bbox, inertia, strength);
  };

  const restFrames = (state: ModeState, cx: number, frames: number, inertia?: number, strength?: number): void => {
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    for (let f = 0; f < frames; f++) {
      stepBubbleModes(state, cx, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, inertia, strength);
    }
  };

  it("passing inertia=1, strength=1 explicitly reproduces omitting them exactly", () => {
    const withDefaultsOmitted: ModeState = createModeState(0, 0);
    dragThenRelease(withDefaultsOmitted, 900, 40, 1500, 0);
    restFrames(withDefaultsOmitted, 900 * 40 * (1 / 60), 60);

    const withDefaultsExplicit: ModeState = createModeState(0, 0);
    dragThenRelease(withDefaultsExplicit, 900, 40, 1500, 0, 1, 1);
    restFrames(withDefaultsExplicit, 900 * 40 * (1 / 60), 60, 1, 1);

    expect(withDefaultsExplicit).toEqual(withDefaultsOmitted);
  });

  it("heavier settles later, stronger settles sooner, weaker settles later (linear-transient settle time)", () => {
    // The system is linear in the amplitude/velocity states for a fixed
    // (I, S), so the difference between a kicked run and a calm run (velocity
    // 0 at release) isolates the pure transient from the release kick — the
    // shared idle-breathing target cancels out.
    const settleTime = (inertia: number, strength: number): number => {
      const dtMs = 1000 / 60;
      const dt = dtMs / 1000;
      const dragSpeed = 400; // moderate fling — stays clear of the A_MAX clamp

      const kicked: ModeState = createModeState(0, 0);
      dragThenRelease(kicked, dragSpeed, 5, 800, 0, inertia, strength);
      // Verify linearity holds: the kicked run must stay under the clamp.
      expect(Math.abs(kicked.a3)).toBeLessThan(A_MAX);

      const calm: ModeState = createModeState(0, 0);
      dragThenRelease(calm, dragSpeed, 5, 0, 0, inertia, strength);

      const buf = makeBuf();
      const bbox = makeBbox();
      const totalFrames = Math.round(3 / dt); // 3s of decay
      let maxAbsDiff = 0;
      const diffs: number[] = [];
      const cxKicked0 = kicked.lastCx;
      const cxCalm0 = calm.lastCx;
      for (let f = 0; f < totalFrames; f++) {
        stepBubbleModes(kicked, cxKicked0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, inertia, strength);
        stepBubbleModes(calm, cxCalm0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, inertia, strength);
        const diff = kicked.a3 - calm.a3;
        diffs.push(diff);
        maxAbsDiff = Math.max(maxAbsDiff, Math.abs(diff));
      }

      const threshold = maxAbsDiff * 0.05;
      let lastAboveIdx = -1;
      for (let i = 0; i < diffs.length; i++) {
        if (Math.abs(diffs[i]) > threshold) {
          lastAboveIdx = i;
        }
      }
      return lastAboveIdx * dt;
    };

    const tDefault = settleTime(1, 1);
    const tHeavy = settleTime(2, 1);
    const tStrong = settleTime(1, 2);
    const tWeak = settleTime(1, 0.5);

    expect(tHeavy).toBeGreaterThan(tDefault);
    expect(tStrong).toBeLessThan(tDefault);
    expect(tWeak).toBeGreaterThan(tDefault);
  });

  it("a heavier bubble gets a bigger release kick: v3 with I=2 is ~2x the I=1 baseline", () => {
    const dtMs = 1000 / 60;
    const buf = makeBuf();
    const bbox = makeBbox();

    const baseline: ModeState = createModeState(0, 0);
    stepBubbleModes(baseline, 0, 0, 40, 1, 1, 0, 0, dtMs, buf, bbox, 1, 1); // active
    stepBubbleModes(baseline, 0, 0, 40, 1, 0, 2500, 0, dtMs, buf, bbox, 1, 1); // release

    const noFlingBaseline: ModeState = createModeState(0, 0);
    stepBubbleModes(noFlingBaseline, 0, 0, 40, 1, 1, 0, 0, dtMs, buf, bbox, 1, 1);
    stepBubbleModes(noFlingBaseline, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, 1, 1);

    const heavy: ModeState = createModeState(0, 0);
    stepBubbleModes(heavy, 0, 0, 40, 1, 1, 0, 0, dtMs, buf, bbox, 2, 1); // active
    stepBubbleModes(heavy, 0, 0, 40, 1, 0, 2500, 0, dtMs, buf, bbox, 2, 1); // release

    const noFlingHeavy: ModeState = createModeState(0, 0);
    stepBubbleModes(noFlingHeavy, 0, 0, 40, 1, 1, 0, 0, dtMs, buf, bbox, 2, 1);
    stepBubbleModes(noFlingHeavy, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, 2, 1);

    const kickDefault = baseline.v3 - noFlingBaseline.v3;
    const kickHeavy = heavy.v3 - noFlingHeavy.v3;
    // ~2x, not exactly: the kick is damped by the same-step spring term
    // (`-C3 * springScale * v3 * dt`), and `springScale` itself differs
    // between I=1 and I=2, so the ratio is close to but not exactly 2.
    const ratio = kickHeavy / kickDefault;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it("a heavier bubble stretches further under a steady drag, staying inside A_MAX and A2_MAX_CEIL", () => {
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    const buf = makeBuf();
    const bbox = makeBbox();
    const dragSpeed = 2000;
    const frames = 60;

    const peakA2 = (inertia: number): number => {
      const state: ModeState = createModeState(0, 0);
      let cx = 0;
      let peak = 0;
      for (let f = 0; f < frames; f++) {
        cx += dragSpeed * dt;
        stepBubbleModes(state, cx, 0, 40, 1, 1, dragSpeed, 0, dtMs, buf, bbox, inertia, 1);
        peak = Math.max(peak, state.a2);
        expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
      }
      return peak;
    };

    const peakDefault = peakA2(1);
    const peakHeavy = peakA2(1.8);
    // The target cap itself never exceeds A2_MAX_CEIL (the spring's actual
    // output can still overshoot that, bounded only by A_MAX, which the
    // per-frame assertions above already check).
    expect(1.8 * 0.06).toBeLessThan(A2_MAX_CEIL); // sanity: A2_MAX * 1.8 stays under the ceiling here
    expect(peakHeavy).toBeGreaterThan(peakDefault);
  });

  it("extremes (I=2.5, S=0.3) with a hard curved fling stay within A_MAX through release and 3s of decay, with no NaN", () => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;
    const dragSpeed = 4000;
    const inertia = 2.5;
    const strength = 0.3;

    const check = () => {
      expect(Number.isFinite(state.a2)).toBe(true);
      expect(Number.isFinite(state.a3)).toBe(true);
      expect(Number.isFinite(state.a4)).toBe(true);
      expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);
    };

    let cx = 0;
    for (let f = 0; f < 5; f++) {
      cx += dragSpeed * dt;
      stepBubbleModes(state, cx, 0, 40, 1, 1, dragSpeed, 0, dtMs, buf, bbox, inertia, strength);
      check();
    }
    // Release with a 90 degree turn — the largest kick this scenario applies.
    stepBubbleModes(state, cx, 0, 40, 1, 0, 0, dragSpeed, dtMs, buf, bbox, inertia, strength);
    check();

    const decayFrames = Math.round(3 / dt);
    for (let f = 0; f < decayFrames; f++) {
      stepBubbleModes(state, cx, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, inertia, strength);
      check();
    }
  });

  it("stays stable at the stiff extreme (S=2.5, I=0.3) through stalled frames clamped to DT_MAX_MS", () => {
    // springScale = 8.3. At the old DT_MAX_MS of 33 ms this diverged; the
    // 50 ms frames below are clamped to DT_MAX_MS, so the kick must decay.
    // Compared against a no-fling run so the idle breathing cancels out and
    // only the kick's transient is measured.
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 50;
    const run = (fling: number): ModeState => {
      const state: ModeState = createModeState(0, 0);
      stepBubbleModes(state, 0, 0, 40, 1, 1, fling, 0, dtMs, buf, bbox, 0.3, 2.5);
      stepBubbleModes(state, 0, 0, 40, 1, 0, 0, fling, dtMs, buf, bbox, 0.3, 2.5);
      return state;
    };
    const kicked = run(4000);
    const calm = run(0);
    const kick0 = Math.abs(kicked.v3 - calm.v3);
    expect(kick0).toBeGreaterThan(0);
    for (let f = 0; f < 100; f++) {
      stepBubbleModes(kicked, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, 0.3, 2.5);
      stepBubbleModes(calm, 0, 0, 40, 1, 0, 0, 0, dtMs, buf, bbox, 0.3, 2.5);
    }
    expect(Math.abs(kicked.v3 - calm.v3)).toBeLessThan(kick0 * 0.01);
    expect(Math.abs(kicked.v4 - calm.v4)).toBeLessThan(kick0 * 0.01);
  });

  it("rest wobble scales by 1/strength and ignores inertia", () => {
    const settledA3 = (inertia: number, strength: number): number => {
      const state: ModeState = createModeState(0, 0);
      restFrames(state, 0, 300, inertia, strength);
      return state.a3;
    };
    const a3Default = settledA3(1, 1);
    // Tolerance covers the spring's small phase lag against the slow idle
    // sine, which differs slightly with springScale.
    expect(settledA3(1, 0.5) / a3Default).toBeCloseTo(2, 1);
    expect(settledA3(1, 2) / a3Default).toBeCloseTo(0.5, 1);
    expect(settledA3(2, 1) / a3Default).toBeCloseTo(1, 1);
  });

  it("MULT_MIN guard: inertia=0 and strength=0 produce finite values", () => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dt = dtMs / 1000;

    let cx = 0;
    for (let f = 0; f < 10; f++) {
      cx += 900 * dt;
      stepBubbleModes(state, cx, 0, 40, 1, 1, 900, 0, dtMs, buf, bbox, 0, 0);
    }
    stepBubbleModes(state, cx, 0, 40, 1, 0, 1500, 0, dtMs, buf, bbox, 0, 0);

    expect(Number.isFinite(state.a2)).toBe(true);
    expect(Number.isFinite(state.a3)).toBe(true);
    expect(Number.isFinite(state.a4)).toBe(true);
    expect(Number.isFinite(state.v3)).toBe(true);
    expect(Number.isFinite(state.v4)).toBe(true);
  });
});
