/// <reference types="bun" />
import { afterEach, describe, expect, it } from "bun:test";

import {
  IMAGE_SIZE_MUL_MAX,
  IMAGE_SIZE_MUL_MIN,
  RESTITUTION,
  SPEED_RELAX_TAU,
  STRIDE,
  WALL_INSET,
  pickSizeMuls,
  pickSources,
  seedBodies,
  stepBodies,
  type StepBodiesParams,
} from "./bouncingImagesMath";

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});

/** Deterministic LCG in [0, 1). */
const seeded = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

/** Params that leave a body alone: no slosh, no resize, cruise = current speed. */
const baseParams = (over: Partial<StepBodiesParams> = {}): StepBodiesParams => ({
  count: 1,
  sizeMuls: [1],
  dt: 1 / 60,
  dvx: 0,
  dvy: 0,
  R: 1000,
  halfBase: 10,
  cruise: 100,
  rescale: 1,
  ...over,
});

describe("pickSources", () => {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8];

  it("returns distinct items from the pool", () => {
    const out = pickSources(pool, 5);
    expect(new Set(out).size).toBe(5);
    expect(out.every((v) => pool.includes(v))).toBe(true);
  });

  it("returns min(count, pool length) items", () => {
    expect(pickSources(pool, 3).length).toBe(3);
    expect(pickSources(pool, 99).length).toBe(pool.length);
    expect(pickSources(pool, 0).length).toBe(0);
  });

  it("does not mutate the pool", () => {
    const copy = pool.slice();
    pickSources(pool, 8);
    expect(pool).toEqual(copy);
  });
});

describe("pickSizeMuls", () => {
  it("returns count values within the multiplier range", () => {
    const out = pickSizeMuls(50);
    expect(out.length).toBe(50);
    for (const m of out) {
      expect(m).toBeGreaterThanOrEqual(IMAGE_SIZE_MUL_MIN);
      expect(m).toBeLessThanOrEqual(IMAGE_SIZE_MUL_MAX);
    }
  });

  it("maps Math.random 0 and ~1 to the range ends", () => {
    Math.random = () => 0;
    expect(pickSizeMuls(1)[0]).toBe(IMAGE_SIZE_MUL_MIN);
    Math.random = () => 1;
    expect(pickSizeMuls(1)[0]).toBe(IMAGE_SIZE_MUL_MAX);
  });
});

describe("seedBodies", () => {
  const R = 400;
  const speed = 140;
  const radii = [20, 30, 25, 40, 15, 35];

  it("lays out count * STRIDE floats", () => {
    Math.random = seeded(1);
    expect(seedBodies(R, radii, speed).length).toBe(radii.length * STRIDE);
  });

  it("keeps every body inside its wall and at the requested speed", () => {
    Math.random = seeded(2);
    const b = seedBodies(R, radii, speed);
    radii.forEach((r, i) => {
      const o = i * STRIDE;
      expect(Math.hypot(b[o], b[o + 1])).toBeLessThanOrEqual(
        R - WALL_INSET - r + 1e-6,
      );
      expect(Math.hypot(b[o + 2], b[o + 3])).toBeCloseTo(speed, 6);
    });
  });

  it("does not overlap bodies when the bubble is roomy", () => {
    Math.random = seeded(3);
    const b = seedBodies(R, radii, speed);
    for (let i = 0; i < radii.length; i++) {
      for (let j = i + 1; j < radii.length; j++) {
        const d = Math.hypot(
          b[j * STRIDE] - b[i * STRIDE],
          b[j * STRIDE + 1] - b[i * STRIDE + 1],
        );
        expect(d).toBeGreaterThanOrEqual(radii[i] + radii[j] - 1e-6);
      }
    }
  });
});

describe("stepBodies — integrate", () => {
  it("moves a free body by v * dt (already at cruise speed)", () => {
    const b = [0, 0, 100, 0];
    stepBodies(b, baseParams());
    expect(b[0]).toBeCloseTo(100 / 60, 9);
    expect(b[1]).toBeCloseTo(0, 9);
    expect(b[2]).toBeCloseTo(100, 9);
  });

  it("relaxes speed toward cruise", () => {
    const dt = 1 / 60;
    const relax = 1 - Math.exp(-dt / SPEED_RELAX_TAU);
    const fast = [0, 0, 300, 0];
    stepBodies(fast, baseParams({ dt }));
    expect(fast[2]).toBeCloseTo(300 + (100 - 300) * relax, 9);
    expect(fast[2]).toBeLessThan(300);
    expect(fast[2]).toBeGreaterThan(100);

    const slow = [0, 0, 20, 0];
    stepBodies(slow, baseParams({ dt }));
    expect(slow[2]).toBeGreaterThan(20);
    expect(slow[2]).toBeLessThan(100);
  });

  it("applies the slosh kick as a velocity subtraction", () => {
    const b = [0, 0, 100, 0];
    stepBodies(b, baseParams({ dvx: 10, cruise: 90 }));
    expect(b[2]).toBeCloseTo(90, 9);
  });

  it("scales positions and velocities on rescale", () => {
    const b = [10, 20, 0, 0];
    // Zero speed: relax is skipped, so velocity stays exactly rescaled.
    stepBodies(b, baseParams({ rescale: 2, dt: 1e-9 }));
    expect(b[0]).toBeCloseTo(20, 6);
    expect(b[1]).toBeCloseTo(40, 6);

    const v = [10, 0, 50, 80];
    stepBodies(v, baseParams({ rescale: 0.5, dt: 1e-9, cruise: 0 }));
    expect(v[0]).toBeCloseTo(5, 6);
    expect(v[2]).toBeCloseTo(25, 4);
    expect(v[3]).toBeCloseTo(40, 4);
  });
});

describe("stepBodies — wall", () => {
  it("clamps an outside body to the wall and reflects its normal velocity", () => {
    const R = 100;
    const halfBase = 10;
    const wall = R - WALL_INSET - halfBase;
    // Past the wall on +x, moving outward.
    const b = [wall + 5, 0, 100, 0];
    stepBodies(b, baseParams({ R, halfBase }));
    expect(b[0]).toBeCloseTo(wall, 9);
    expect(b[1]).toBeCloseTo(0, 9);
    expect(b[2]).toBeLessThan(0);
    expect(b[2]).toBeCloseTo(-RESTITUTION * 100, 6);
  });

  it("leaves an inward-moving body's velocity alone", () => {
    const R = 100;
    const wall = R - WALL_INSET - 10;
    const b = [wall + 5, 0, -100, 0];
    stepBodies(b, baseParams({ R, halfBase: 10 }));
    expect(b[2]).toBeCloseTo(-100, 9);
  });
});

describe("stepBodies — collisions", () => {
  // Zero speed + zero cruise: relax is a no-op, isolating the collision pass.
  const collide = (b: number[], sizeMuls: number[]) =>
    stepBodies(
      b,
      baseParams({ count: 2, sizeMuls, halfBase: 10, cruise: 0, dt: 1e-9 }),
    );

  it("separates a head-on equal-mass pair and stops closing", () => {
    // minDist = 10 * (1 + 1) = 20; centers 10 apart, approaching.
    const b = [-5, 0, 50, 0, 5, 0, -50, 0];
    collide(b, [1, 1]);
    const d = Math.hypot(b[4] - b[0], b[5] - b[1]);
    expect(d).toBeCloseTo(20, 6);
    const rel = b[6] - b[2];
    expect(rel).toBeGreaterThanOrEqual(0);
    // Equal masses: velocities swap sign scaled by restitution.
    expect(b[2]).toBeCloseTo(50 - (1 + RESTITUTION) * 50, 6);
    expect(b[6]).toBeCloseTo(-50 + (1 + RESTITUTION) * 50, 6);
  });

  it("makes the heavier body move less", () => {
    // sizeMul 2 → mass 4, sizeMul 1 → mass 1. minDist = 10 * 3 = 30.
    const b = [0, 0, 0, 0, 10, 0, 0, 0];
    collide(b, [2, 1]);
    const moveHeavy = Math.abs(b[0] - 0);
    const moveLight = Math.abs(b[4] - 10);
    expect(moveHeavy).toBeLessThan(moveLight);
    expect(moveHeavy + moveLight).toBeCloseTo(30 - 10, 6);
  });

  it("ignores separated pairs", () => {
    const b = [0, 0, 10, 0, 100, 0, -10, 0];
    const before = b.slice();
    collide(b, [1, 1]);
    expect(b[0]).toBeCloseTo(before[0], 6);
    expect(b[2]).toBeCloseTo(before[2], 6);
    expect(b[6]).toBeCloseTo(before[6], 6);
  });
});
