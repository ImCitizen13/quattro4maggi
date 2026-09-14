/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import { BALL_COUNT, BALL_LAYOUT, BUFFER_LENGTH, FLOATS_PER_BALL } from "../ballLayout";
import {
  createBallPhysicsState,
  MAX_DT_MS,
  resetBallPhysicsState,
  SNAP_FACTOR,
  stepBallPhysics,
  type Bbox,
  type BallPhysicsState,
} from "./ballPhysicsMath";

const makeBuf = (): number[] => new Array(BUFFER_LENGTH).fill(0);
const makeBbox = (): Bbox => ({ x: 0, y: 0, w: 0, h: 0 });

describe("createBallPhysicsState", () => {
  it("places every ball at its rest anchor", () => {
    const cx = 100;
    const cy = 200;
    const R = 40;
    const state = createBallPhysicsState(cx, cy, R);
    for (let i = 0; i < BALL_COUNT; i++) {
      const ball = BALL_LAYOUT[i];
      expect(state.posX[i]).toBeCloseTo(cx + ball.ox * R, 9);
      expect(state.posY[i]).toBeCloseTo(cy + ball.oy * R, 9);
      // Verlet "at rest" requires prev == pos so the first step has zero
      // inertial term.
      expect(state.prevX[i]).toBe(state.posX[i]);
      expect(state.prevY[i]).toBe(state.posY[i]);
    }
    expect(state.lastCx).toBe(cx);
    expect(state.lastCy).toBe(cy);
  });
});

describe("stepBallPhysics", () => {
  it("a resting cluster (no anchor motion) stays put", () => {
    const cx = 0;
    const cy = 0;
    const R = 40;
    const state = createBallPhysicsState(cx, cy, R);
    const buf = makeBuf();
    const bbox = makeBbox();
    for (let f = 0; f < 30; f++) {
      stepBallPhysics(state, cx, cy, R, 16.7, buf, bbox);
    }
    for (let i = 0; i < BALL_COUNT; i++) {
      const ball = BALL_LAYOUT[i];
      expect(state.posX[i]).toBeCloseTo(cx + ball.ox * R, 3);
      expect(state.posY[i]).toBeCloseTo(cy + ball.oy * R, 3);
    }
  });

  it("writes a full 48-float buffer with every ball active", () => {
    const state = createBallPhysicsState(0, 0, 40);
    const buf = makeBuf();
    const bbox = makeBbox();
    stepBallPhysics(state, 10, 5, 40, 16.7, buf, bbox);
    expect(buf.length).toBe(BUFFER_LENGTH);
    for (let i = 0; i < BALL_COUNT; i++) {
      const o = i * FLOATS_PER_BALL;
      expect(Number.isFinite(buf[o])).toBe(true);
      expect(Number.isFinite(buf[o + 1])).toBe(true);
      expect(buf[o + 2]).toBeGreaterThan(0);
      expect(buf[o + 3]).toBe(1);
    }
  });

  it("never mutates a different array than the one passed as outBuf", () => {
    const state = createBallPhysicsState(0, 0, 40);
    const bufA = makeBuf();
    const bufB = makeBuf();
    const bbox = makeBbox();
    stepBallPhysics(state, 5, 5, 40, 16.7, bufA, bbox);
    expect(bufB.every((v) => v === 0)).toBe(true);
  });

  it("balls trailing the motion direction move less than leading balls", () => {
    // Move the anchor steadily in +X; the ring ball nearest +X should lead
    // (pulled harder, ends up closer to its anchor) and the ring ball
    // nearest -X should trail (pulled weaker, lags further behind).
    const R = 40;
    let cx = 0;
    const cy = 0;
    const state = createBallPhysicsState(cx, cy, R);
    const buf = makeBuf();
    const bbox = makeBbox();

    // Find the ring ball closest to the +X and -X directions.
    let leadIdx = 1;
    let trailIdx = 1;
    let bestLead = -Infinity;
    let bestTrail = -Infinity;
    for (let i = 1; i < BALL_COUNT; i++) {
      const ball = BALL_LAYOUT[i];
      const len = Math.hypot(ball.ox, ball.oy) || 1;
      const nx = ball.ox / len;
      if (nx > bestLead) {
        bestLead = nx;
        leadIdx = i;
      }
      if (-nx > bestTrail) {
        bestTrail = -nx;
        trailIdx = i;
      }
    }

    // Kick the anchor into steady +X motion for a few frames.
    for (let f = 0; f < 8; f++) {
      cx += 20; // large step so speed comfortably exceeds MIN_SPEED_FOR_DIR
      stepBallPhysics(state, cx, cy, R, 16.7, buf, bbox);
    }

    const leadAnchorX = cx + BALL_LAYOUT[leadIdx].ox * R;
    const trailAnchorX = cx + BALL_LAYOUT[trailIdx].ox * R;
    const leadLag = Math.abs(leadAnchorX - state.posX[leadIdx]);
    const trailLag = Math.abs(trailAnchorX - state.posX[trailIdx]);
    expect(trailLag).toBeGreaterThan(leadLag);
  });

  it("clamps dt so a huge stall does not blow up positions (snap guard)", () => {
    const R = 40;
    const state = createBallPhysicsState(0, 0, R);
    const buf = makeBuf();
    const bbox = makeBbox();
    // A pathological dt far beyond MAX_DT_MS, with the anchor jumping far.
    stepBallPhysics(state, 5000, 5000, R, 10_000, buf, bbox);
    for (let i = 0; i < BALL_COUNT; i++) {
      const ball = BALL_LAYOUT[i];
      const ax = 5000 + ball.ox * R;
      const ay = 5000 + ball.oy * R;
      const dist = Math.hypot(state.posX[i] - ax, state.posY[i] - ay);
      // Snap guard caps stray distance at SNAP_FACTOR * R.
      expect(dist).toBeLessThanOrEqual(SNAP_FACTOR * R + 1e-6);
    }
    expect(MAX_DT_MS).toBeLessThan(10_000);
  });

  it("bbox encloses every ball's rendered circle", () => {
    const R = 40;
    let cx = 0;
    const cy = 0;
    const state = createBallPhysicsState(cx, cy, R);
    const buf = makeBuf();
    const bbox = makeBbox();
    for (let f = 0; f < 5; f++) {
      cx += 15;
      stepBallPhysics(state, cx, cy, R, 16.7, buf, bbox);
    }
    for (let i = 0; i < BALL_COUNT; i++) {
      const o = i * FLOATS_PER_BALL;
      const x = buf[o];
      const y = buf[o + 1];
      const r = buf[o + 2];
      expect(x - r).toBeGreaterThanOrEqual(bbox.x - 1e-6);
      expect(x + r).toBeLessThanOrEqual(bbox.x + bbox.w + 1e-6);
      expect(y - r).toBeGreaterThanOrEqual(bbox.y - 1e-6);
      expect(y + r).toBeLessThanOrEqual(bbox.y + bbox.h + 1e-6);
    }
  });

  it("resetBallPhysicsState re-anchors in place without reallocating arrays", () => {
    const state: BallPhysicsState = createBallPhysicsState(0, 0, 40);
    const originalPosX = state.posX;
    const originalPosY = state.posY;
    resetBallPhysicsState(state, 500, -300, 80);
    expect(state.posX).toBe(originalPosX); // same array identity
    expect(state.posY).toBe(originalPosY);
    for (let i = 0; i < BALL_COUNT; i++) {
      const ball = BALL_LAYOUT[i];
      expect(state.posX[i]).toBeCloseTo(500 + ball.ox * 80, 9);
      expect(state.posY[i]).toBeCloseTo(-300 + ball.oy * 80, 9);
    }
  });
});
