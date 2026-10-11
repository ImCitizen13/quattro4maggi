/// <reference types="bun" />
import { describe, expect, it } from "bun:test";

import {
  BIRTH_INERTIA_RANGE,
  BIRTH_RADIUS_RANGE,
  BIRTH_TIME,
  BIRTH_WOBBLE_RANGE,
} from "../../liquid-bubble-live/bubbleModes";
import { SPAWN_SPREAD, SPAWN_STAGGER } from "../multiBubbleConfig";
import {
  PHASE_FLOAT,
  PHASE_INFLATE,
  PHASE_WAIT,
  createFloatEnv,
  createFloatState,
  stepBubbleFloat,
  type FloatEnv,
  type FloatState,
} from "./multiBubbleMath";

// ============================================================================
// Helpers
// ============================================================================

const DT = 16.7;
const W = 393;
const H = 800;

/** Deterministic PRNG (mulberry32). */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeEnv = (): FloatEnv => {
  const env = createFloatEnv();
  env.spawnX = W / 2;
  env.spawnY = H - 60;
  env.width = W;
  env.height = H;
  env.restRadius = 60;
  return env;
};

/** Step `seconds` of frames; returns how many spawns happened. */
const run = (
  s: FloatState,
  env: FloatEnv,
  seconds: number,
  rand: () => number,
  dt = DT,
): number => {
  let spawns = 0;
  const frames = Math.round((seconds * 1000) / dt);
  for (let i = 0; i < frames; i++) {
    if (stepBubbleFloat(s, env, dt, rand)) spawns++;
  }
  return spawns;
};

// ============================================================================
// Tests
// ============================================================================

describe("createFloatState", () => {
  it("staggers the first spawns and starts hidden", () => {
    for (let i = 0; i < 5; i++) {
      const s = createFloatState(i);
      expect(s.phase).toBe(PHASE_WAIT);
      expect(s.wait).toBeCloseTo(i * SPAWN_STAGGER);
      expect(s.R).toBe(0);
    }
  });
});

describe("stepBubbleFloat — spawn", () => {
  it("bubble 0 spawns on its first frame at the box mouth", () => {
    const env = makeEnv();
    const s = createFloatState(0);
    expect(stepBubbleFloat(s, env, DT, seeded(1))).toBe(true);
    expect(s.phase).toBe(PHASE_INFLATE);
    expect(s.needsAnchor).toBe(true);
    expect(Math.abs(s.x - env.spawnX)).toBeLessThanOrEqual(SPAWN_SPREAD);
    expect(s.y).toBeCloseTo(env.spawnY - 1);
  });

  it("rolls traits and a target radius inside their ranges", () => {
    const env = makeEnv();
    const rand = seeded(2);
    for (let k = 0; k < 50; k++) {
      const s = createFloatState(0);
      stepBubbleFloat(s, env, DT, rand);
      expect(s.wobbleMul).toBeGreaterThanOrEqual(BIRTH_WOBBLE_RANGE[0]);
      expect(s.wobbleMul).toBeLessThanOrEqual(BIRTH_WOBBLE_RANGE[1]);
      expect(s.inertiaMul).toBeGreaterThanOrEqual(BIRTH_INERTIA_RANGE[0]);
      expect(s.inertiaMul).toBeLessThanOrEqual(BIRTH_INERTIA_RANGE[1]);
      expect(s.rTarget).toBeGreaterThanOrEqual(
        env.restRadius * BIRTH_RADIUS_RANGE[0],
      );
      expect(s.rTarget).toBeLessThanOrEqual(
        env.restRadius * BIRTH_RADIUS_RANGE[1],
      );
    }
  });

  it("bubble 2 waits 2 × SPAWN_STAGGER before spawning", () => {
    const env = makeEnv();
    const s = createFloatState(2);
    const rand = seeded(3);
    run(s, env, 2 * SPAWN_STAGGER - 0.1, rand);
    expect(s.phase).toBe(PHASE_WAIT);
    expect(run(s, env, 0.2, rand)).toBe(1);
  });

  it("float off: a waiting bubble never spawns", () => {
    const env = makeEnv();
    env.enabled = 0;
    const s = createFloatState(1);
    expect(run(s, env, 10, seeded(4))).toBe(0);
    expect(s.phase).toBe(PHASE_WAIT);
  });
});

describe("stepBubbleFloat — inflate + float", () => {
  it("reaches FLOAT at BIRTH_TIME with R settled near its target", () => {
    const env = makeEnv();
    const s = createFloatState(0);
    const rand = seeded(5);
    run(s, env, BIRTH_TIME + 0.1, rand);
    expect(s.phase).toBe(PHASE_FLOAT);
    run(s, env, 1, rand);
    expect(Math.abs(s.R - s.rTarget) / s.rTarget).toBeLessThan(0.02);
  });

  it("rises from the box", () => {
    const env = makeEnv();
    const s = createFloatState(0);
    run(s, env, 3, seeded(6));
    expect(s.y).toBeLessThan(env.spawnY - 150);
  });

  it("stays inside the side walls", () => {
    const env = makeEnv();
    const s = createFloatState(0);
    const rand = seeded(7);
    for (let i = 0; i < 3000; i++) {
      stepBubbleFloat(s, env, DT, rand);
      if (s.phase === PHASE_FLOAT) {
        expect(s.x).toBeGreaterThanOrEqual(s.R - 1e-6);
        expect(s.x).toBeLessThanOrEqual(W - s.R + 1e-6);
      }
    }
  });

  it("exits the top and respawns from the box", () => {
    const env = makeEnv();
    const s = createFloatState(0);
    expect(run(s, env, 60, seeded(8))).toBeGreaterThanOrEqual(2);
  });

  it("float off: a floating bubble parks", () => {
    const env = makeEnv();
    const s = createFloatState(0);
    const rand = seeded(9);
    run(s, env, 3, rand);
    env.enabled = 0;
    stepBubbleFloat(s, env, DT, rand);
    const x = s.x;
    const y = s.y;
    run(s, env, 2, rand);
    expect(s.x).toBe(x);
    expect(s.y).toBe(y);
    expect(s.vx).toBe(0);
    expect(s.vy).toBe(0);
  });
});

describe("stepBubbleFloat — robustness", () => {
  it("never produces NaN under jittery frame times", () => {
    const env = makeEnv();
    const rand = seeded(10);
    const jitter = seeded(11);
    const bubbles = [0, 1, 2, 3, 4].map(createFloatState);
    for (let i = 0; i < 6000; i++) {
      const dt = 4 + jitter() * 40;
      for (const s of bubbles) {
        stepBubbleFloat(s, env, dt, rand);
        expect(Number.isFinite(s.x + s.y + s.R + s.vx + s.vy)).toBe(true);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const env = makeEnv();
    const a = createFloatState(0);
    const b = createFloatState(0);
    run(a, env, 20, seeded(12));
    run(b, env, 20, seeded(12));
    expect(a).toEqual(b);
  });
});
