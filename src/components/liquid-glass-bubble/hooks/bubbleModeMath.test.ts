/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import {
  A2_REST,
  A_MAX,
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
    stepBubbleModes(state, cx, cy, 40, 1, 0, 0, dtMs, buf, bbox);
    expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);

    // A few more spike frames sustaining the huge speed — the clamp must
    // hold every frame, not just the first.
    for (let f = 0; f < 5; f++) {
      cx += spikeDx;
      stepBubbleModes(state, cx, cy, 40, 1, 0, 0, dtMs, buf, bbox);
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
      stepBubbleModes(state, cx, cy, 40, 1, 0, 0, dtMs, buf, bbox);
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
      stepBubbleModes(state, cx, cy, R, 1, 0, 0, dtMs, buf, bbox);
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
      stepBubbleModes(state, cx, cy, R, 0, 0, 0, dtMs, buf, bbox);
    }

    expect(Math.abs(state.a2 - A2_REST)).toBeLessThanOrEqual(0.005);
    expect(state.a2).not.toBeCloseTo(0, 2); // NOT settled to a perfect circle

    // Phase 9B: at rest the axis is no longer held by a PHI_DRIFT target
    // rotation — it is rotated directly by w2 (seeded at, and relaxed back
    // to, W_FLOOR_2). With no kick, w2 stays at the floor the whole time, so
    // the drift over the rest period is (very close to) exactly
    // W_FLOOR_2 * 1.5s.
    expect(state.phi2 - phi2AtRelease).toBeCloseTo(W_FLOOR_2 * 1.5, 2);
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
      stepBubbleModes(state, from.cx, from.cy, 40, 1, 0, 0, dtMs, buf, bbox);
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
      stepBubbleModes(state, pos.cx, pos.cy, 40, 1, 0, 0, dtMs, buf, bbox);
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
    stepBubbleModes(withFling, 0, 0, 40, 1, 0, 0, dtMs, buf, bbox); // active
    stepBubbleModes(withFling, 0, 0, 40, 0, 2500, 0, dtMs, buf, bbox); // release, fling (2500, 0)

    const noFling: ModeState = createModeState(0, 0);
    stepBubbleModes(noFling, 0, 0, 40, 1, 0, 0, dtMs, buf, bbox);
    stepBubbleModes(noFling, 0, 0, 40, 0, 0, 0, dtMs, buf, bbox);

    // A fling must impart strictly more mode-3 velocity than a dead release.
    expect(withFling.v3).toBeGreaterThan(noFling.v3);
    // And mode 4 is kicked the other way (KICK_V4_SCALE, negative).
    expect(withFling.v4).toBeLessThan(noFling.v4);
  });
});

describe("stepBubbleModes — idle rest pose", () => {
  it("never collapses to a circle at rest: |a2|+|a3|+|a4| > 0.05 at every sampled frame over 10s", () => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const frames = 600; // 10s

    for (let f = 0; f < frames; f++) {
      stepBubbleModes(state, 0, 0, 40, 0, 0, 0, dtMs, buf, bbox);
      const sum = Math.abs(state.a2) + Math.abs(state.a3) + Math.abs(state.a4);
      expect(sum).toBeGreaterThan(0.05);
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
      stepBubbleModes(state, 0, 0, 40, 0, 0, 0, dtMs, buf, bbox);
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
  const flingThenRelease = (releaseAngle: number): ModeState => {
    const state: ModeState = createModeState(0, 0);
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;
    const dragSpeed = 800;

    // A few active frames with a steady rightward gesture velocity, so
    // prevVelX/Y holds a settled (800, 0) sample by the time we release.
    let cx = 0;
    for (let f = 0; f < 5; f++) {
      cx += dragSpeed * (dtMs / 1000);
      stepBubbleModes(state, cx, 0, 40, 1, dragSpeed, 0, dtMs, buf, bbox);
    }

    // Release with a fling velocity turned by `releaseAngle` from the drag
    // direction — same magnitude, so |turn| = |sin(releaseAngle)|.
    const relVx = dragSpeed * Math.cos(releaseAngle);
    const relVy = dragSpeed * Math.sin(releaseAngle);
    stepBubbleModes(state, cx, 0, 40, 0, relVx, relVy, dtMs, buf, bbox);

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
      stepBubbleModes(state, 0, 0, 40, 0, 0, 0, dtMs, buf, bbox);
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
    const ccw = flingThenRelease(Math.PI / 2);
    const cw = flingThenRelease(-Math.PI / 2);

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
      stepBubbleModes(state, cx, 0, 40, 1, dragSpeed, 0, dtMs, buf, bbox);
      check();
    }
    // Release with a 90 degree turn — the largest kick this scenario applies.
    stepBubbleModes(state, cx, 0, 40, 0, 0, dragSpeed, dtMs, buf, bbox);
    check();

    const decayFrames = Math.round((TAU_W * 3) / dt);
    for (let f = 0; f < decayFrames; f++) {
      stepBubbleModes(state, cx, 0, 40, 0, 0, 0, dtMs, buf, bbox);
      check();
    }
  });
});
