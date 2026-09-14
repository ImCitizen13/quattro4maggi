/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import { A2_REST, A_MAX, PARAM_FLOATS, PHI_DRIFT } from "../bubbleModes";
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
    stepBubbleModes(state, cx, cy, 40, 1, 0, dtMs, buf, bbox);
    expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);

    // A few more spike frames sustaining the huge speed — the clamp must
    // hold every frame, not just the first.
    for (let f = 0; f < 5; f++) {
      cx += spikeDx;
      stepBubbleModes(state, cx, cy, 40, 1, 0, dtMs, buf, bbox);
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
      stepBubbleModes(state, cx, cy, 40, 1, 0, dtMs, buf, bbox);
      expect(Math.hypot(state.c2, state.s2)).toBeLessThanOrEqual(A_MAX + 1e-9);
    }
  });
});

describe("stepBubbleModes — release settling", () => {
  it("a2 settles to A2_REST (not 0) and phi2 keeps the drag axis, within tolerance, 1.5s after release", () => {
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
      stepBubbleModes(state, cx, cy, R, 1, 0, dtMs, buf, bbox);
    }

    const phi2AtRelease = state.phi2;
    // Sanity: phi2 actually converged near 2*dragAngle before we start
    // measuring drift from it.
    expect(phi2AtRelease).toBeCloseTo(2 * dragAngle, 2);

    // Release: isActive flips to 0. Position stops changing from here on
    // (speed drops to 0), so this is genuinely "at rest".
    const restFrames = 100; // 100 * 15ms = 1.5s
    for (let f = 0; f < restFrames; f++) {
      stepBubbleModes(state, cx, cy, R, 0, 0, dtMs, buf, bbox);
    }

    expect(Math.abs(state.a2 - A2_REST)).toBeLessThanOrEqual(0.005);
    expect(state.a2).not.toBeCloseTo(0, 2); // NOT settled to a perfect circle
    expect(Math.abs(state.phi2 - 2 * dragAngle)).toBeLessThanOrEqual(PHI_DRIFT * 1.5 + 1e-6);
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
      stepBubbleModes(state, from.cx, from.cy, 40, 1, 0, dtMs, buf, bbox);
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

    // Allow for the slow idle drift, but nothing like a rotation.
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
      stepBubbleModes(state, pos.cx, pos.cy, 40, 1, 0, dtMs, buf, bbox);
      minA2 = Math.min(minA2, state.a2);
    }

    // The amplitude must dip on the way across — that dip IS the de-stretch.
    // An angle lerp would hold |a2| roughly constant and rotate instead.
    expect(minA2).toBeLessThan(a2Before * 0.75);
    // And it must come back out on the new axis.
    expect(state.a2).toBeGreaterThan(A2_REST);
  });
});

describe("stepBubbleModes — release kick", () => {
  it("fires off the gesture fling velocity, not the (already-stopped) anchor delta", () => {
    // The anchor tracks the finger directly, so on the release frame the
    // position delta is ~0. If the kick read that, it would always be zero.
    const buf = makeBuf();
    const bbox = makeBbox();
    const dtMs = 1000 / 60;

    const withFling: ModeState = createModeState(0, 0);
    stepBubbleModes(withFling, 0, 0, 40, 1, 0, dtMs, buf, bbox); // active
    stepBubbleModes(withFling, 0, 0, 40, 0, 2500, dtMs, buf, bbox); // release

    const noFling: ModeState = createModeState(0, 0);
    stepBubbleModes(noFling, 0, 0, 40, 1, 0, dtMs, buf, bbox);
    stepBubbleModes(noFling, 0, 0, 40, 0, 0, dtMs, buf, bbox);

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
      stepBubbleModes(state, 0, 0, 40, 0, 0, dtMs, buf, bbox);
      const sum = Math.abs(state.a2) + Math.abs(state.a3) + Math.abs(state.a4);
      expect(sum).toBeGreaterThan(0.05);
    }
  });
});
