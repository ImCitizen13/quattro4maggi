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
    stepBubbleModes(state, cx, cy, 40, 1, dtMs, buf, bbox);
    expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
    expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);

    // A few more spike frames sustaining the huge speed — the clamp must
    // hold every frame, not just the first.
    for (let f = 0; f < 5; f++) {
      cx += spikeDx;
      stepBubbleModes(state, cx, cy, 40, 1, dtMs, buf, bbox);
      expect(Math.abs(state.a2)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a3)).toBeLessThanOrEqual(A_MAX + 1e-9);
      expect(Math.abs(state.a4)).toBeLessThanOrEqual(A_MAX + 1e-9);
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
    // Steady drag for 1s (well beyond the ~0.2s the phi2 lerp needs to
    // converge at PHI_RATE=12/s) so phi2 is settled on 2*dragAngle before
    // release.
    const dragFrames = 60;
    for (let f = 0; f < dragFrames; f++) {
      cx += vx * dt;
      cy += vy * dt;
      stepBubbleModes(state, cx, cy, R, 1, dtMs, buf, bbox);
    }

    const phi2AtRelease = state.phi2;
    // Sanity: phi2 actually converged near 2*dragAngle before we start
    // measuring drift from it.
    expect(phi2AtRelease).toBeCloseTo(2 * dragAngle, 2);

    // Release: isActive flips to 0. Position stops changing from here on
    // (speed drops to 0), so this is genuinely "at rest".
    const restFrames = 100; // 100 * 15ms = 1.5s
    for (let f = 0; f < restFrames; f++) {
      stepBubbleModes(state, cx, cy, R, 0, dtMs, buf, bbox);
    }

    expect(Math.abs(state.a2 - A2_REST)).toBeLessThanOrEqual(0.005);
    expect(state.a2).not.toBeCloseTo(0, 2); // NOT settled to a perfect circle
    expect(Math.abs(state.phi2 - 2 * dragAngle)).toBeLessThanOrEqual(PHI_DRIFT * 1.5 + 1e-6);
  });
});

describe("stepBubbleModes — phi2 shortest-arc lerp", () => {
  it("wraps a >pi phase gap the short way across the +-pi boundary", () => {
    const state: ModeState = createModeState(0, 0);
    // Park phi2 just under +pi.
    state.phi2 = 3.0;
    const buf = makeBuf();
    const bbox = makeBbox();

    // Craft a motion angle of -1.5 rad so the target (2*angle = -3.0) sits
    // just past -pi from phi2's +3.0 — the naive (non-wrapped) gap is -6.0
    // rad, the shortest-arc gap is only ~+0.283 rad.
    const angle = -1.5;
    const dtMs = 16.7;
    const delta = 50; // magnitude, well above the phi2-update speed threshold
    const dx = Math.cos(angle) * delta;
    const dy = Math.sin(angle) * delta;
    stepBubbleModes(state, dx, dy, 40, 1, dtMs, buf, bbox);

    const stepMagnitude = Math.abs(state.phi2 - 3.0);
    // The correct (wrapped) step is ~0.283 * lerpT ≈ 0.057 rad; the wrong
    // (unwrapped) step would be ~6.0 * lerpT ≈ 1.2 rad in the opposite
    // direction. Assert we took the short way, not the long way.
    expect(stepMagnitude).toBeLessThan(0.5);
    expect(state.phi2).toBeGreaterThan(3.0); // short arc moves phi2 upward here
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
      stepBubbleModes(state, 0, 0, 40, 0, dtMs, buf, bbox);
      const sum = Math.abs(state.a2) + Math.abs(state.a3) + Math.abs(state.a4);
      expect(sum).toBeGreaterThan(0.05);
    }
  });
});
