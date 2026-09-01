/// <reference types="bun" />
import { describe, expect, it } from "bun:test";
import {
  advanceSprite,
  alphaFor,
  DEFAULTS,
  depthScale,
  hasExited,
  makeParams,
  projectSprite,
  type Rng,
  sizeScale,
  spawnScale,
  spawnSprite,
  type SpriteParams,
  type SpriteState,
} from "./movingBubbleMath";

/** Deterministic LCG so distribution tests are reproducible across runs. */
const makeRng = (seed = 1): Rng => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
};

const blank = (): SpriteState => ({
  worldX: 0,
  worldY: 0,
  z: 0,
  speed: 0,
  age: 0,
  finalSize: 0,
});

describe("spawnSprite", () => {
  it("places projected spawn position inside the spawn disc", () => {
    const params = makeParams();
    const canvasH = 800;
    const rng = makeRng(42);
    const radiusNdc = params.spawnRadiusPx / (canvasH / 2);
    for (let i = 0; i < 500; i++) {
      const s = blank();
      spawnSprite(s, params, canvasH, rng);
      const px = s.worldX / s.z;
      const py = s.worldY / s.z;
      expect(Math.hypot(px, py)).toBeLessThanOrEqual(radiusNdc + 1e-12);
    }
  });

  it("resets z to zFar and age to 0", () => {
    const params = makeParams();
    const s = blank();
    s.z = 0.1;
    s.age = 99;
    spawnSprite(s, params, 800, makeRng(1));
    expect(s.z).toBe(params.zFar);
    expect(s.age).toBe(0);
  });

  it("samples speed within [speedMin, speedMax]", () => {
    const params = makeParams({ speedMin: 0.5, speedMax: 3 });
    const rng = makeRng(7);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 500; i++) {
      const s = blank();
      spawnSprite(s, params, 800, rng);
      expect(s.speed).toBeGreaterThanOrEqual(params.speedMin);
      expect(s.speed).toBeLessThanOrEqual(params.speedMax);
      min = Math.min(min, s.speed);
      max = Math.max(max, s.speed);
    }
    // Sanity: distribution actually spans most of the range.
    expect(min).toBeLessThan(params.speedMin + 0.1);
    expect(max).toBeGreaterThan(params.speedMax - 0.1);
  });

  it("samples finalSize within [sizeMin, sizeMax]", () => {
    const params = makeParams({ sizeMin: 0.1, sizeMax: 1.0 });
    const rng = makeRng(13);
    for (let i = 0; i < 500; i++) {
      const s = blank();
      spawnSprite(s, params, 800, rng);
      expect(s.finalSize).toBeGreaterThanOrEqual(params.sizeMin);
      expect(s.finalSize).toBeLessThanOrEqual(params.sizeMax);
    }
  });

  it("spawn radius scales with canvas height (px → NDC conversion)", () => {
    // With a fixed RNG, the same `rand` produces the same angle/radius pick;
    // doubling canvasH should halve the resulting projected NDC radius.
    const params = makeParams();
    const a = blank();
    const b = blank();
    spawnSprite(a, params, 400, makeRng(99));
    spawnSprite(b, params, 800, makeRng(99));
    const rA = Math.hypot(a.worldX / a.z, a.worldY / a.z);
    const rB = Math.hypot(b.worldX / b.z, b.worldY / b.z);
    expect(rA / rB).toBeCloseTo(2, 6);
  });
});

describe("advanceSprite", () => {
  const params = makeParams();

  it("decreases z and increases age", () => {
    const s = blank();
    s.z = params.zFar;
    s.speed = 1;
    advanceSprite(s, params, 0.1);
    expect(s.z).toBeLessThan(params.zFar);
    expect(s.age).toBeCloseTo(0.1, 9);
  });

  it("accelerates as z shrinks (NEAR_BOOST term)", () => {
    const far = blank();
    far.z = params.zFar;
    far.speed = 1;
    const near = blank();
    near.z = params.zFar / 4;
    near.speed = 1;
    const dt = 0.016;
    const z0Far = far.z;
    const z0Near = near.z;
    advanceSprite(far, params, dt);
    advanceSprite(near, params, dt);
    expect(z0Near - near.z).toBeGreaterThan(z0Far - far.z);
  });

  it("is linear in speedFactor", () => {
    const p1 = makeParams({ speedFactor: 1 });
    const p2 = makeParams({ speedFactor: 2 });
    const s1 = blank();
    const s2 = blank();
    s1.z = s2.z = p1.zFar;
    s1.speed = s2.speed = 1.0;
    advanceSprite(s1, p1, 0.016);
    advanceSprite(s2, p2, 0.016);
    const d1 = p1.zFar - s1.z;
    const d2 = p2.zFar - s2.z;
    expect(d2).toBeCloseTo(d1 * 2, 9);
  });

  it("is linear in per-sprite speed", () => {
    const slow = blank();
    const fast = blank();
    slow.z = fast.z = params.zFar;
    slow.speed = 1;
    fast.speed = 3;
    advanceSprite(slow, params, 0.016);
    advanceSprite(fast, params, 0.016);
    const dSlow = params.zFar - slow.z;
    const dFast = params.zFar - fast.z;
    expect(dFast / dSlow).toBeCloseTo(3, 9);
  });
});

describe("depthScale", () => {
  const params = makeParams();

  it("0 at z = zFar, 1 at z = zNear", () => {
    expect(depthScale(params.zFar, params)).toBe(0);
    expect(depthScale(params.zNear, params)).toBe(1);
  });

  it("clamps outside [zNear, zFar]", () => {
    expect(depthScale(params.zFar * 2, params)).toBe(0);
    expect(depthScale(0, params)).toBe(1);
    expect(depthScale(-5, params)).toBe(1);
  });

  it("is monotonically non-decreasing as z decreases", () => {
    let prev = -1;
    for (let i = 0; i <= 50; i++) {
      const z = params.zFar - (params.zFar - params.zNear) * (i / 50);
      const ds = depthScale(z, params);
      expect(ds).toBeGreaterThanOrEqual(prev);
      prev = ds;
    }
  });
});

describe("spawnScale", () => {
  const params = makeParams();

  it("0 at age=0, 1 at age >= spawnDuration", () => {
    expect(spawnScale(0, params)).toBe(0);
    expect(spawnScale(params.spawnDuration, params)).toBe(1);
    expect(spawnScale(params.spawnDuration * 5, params)).toBe(1);
  });

  it("smoothstep midpoint is 0.5", () => {
    expect(spawnScale(params.spawnDuration / 2, params)).toBeCloseTo(0.5, 9);
  });

  it("monotonically non-decreasing during ramp", () => {
    let prev = -1;
    for (let i = 0; i <= 30; i++) {
      const v = spawnScale((i / 30) * params.spawnDuration, params);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("disabled when spawnDuration <= 0", () => {
    const p = makeParams({ spawnDuration: 0 });
    expect(spawnScale(0, p)).toBe(1);
  });
});

describe("sizeScale", () => {
  const params = makeParams();

  it("0 at z = zFar, 1 at z = zNear", () => {
    expect(sizeScale(params.zFar, params)).toBe(0);
    expect(sizeScale(params.zNear, params)).toBe(1);
  });

  it("equals depthScale when sizePower = 1", () => {
    const p = makeParams({ sizePower: 1 });
    for (let i = 0; i <= 10; i++) {
      const z = p.zFar - (p.zFar - p.zNear) * (i / 10);
      expect(sizeScale(z, p)).toBeCloseTo(depthScale(z, p), 9);
    }
  });

  it("with sizePower > 1, stays well below depthScale at the midpoint", () => {
    const p = makeParams({ sizePower: 3 });
    const zMid = (p.zFar + p.zNear) / 2;
    expect(depthScale(zMid, p)).toBeCloseTo(0.5, 6);
    // Power 3 → midpoint sizeScale = 0.125, far below the linear 0.5.
    expect(sizeScale(zMid, p)).toBeCloseTo(0.125, 6);
  });

  it("monotonically non-decreasing as z decreases", () => {
    const p = makeParams({ sizePower: 3 });
    let prev = -1;
    for (let i = 0; i <= 50; i++) {
      const z = p.zFar - (p.zFar - p.zNear) * (i / 50);
      const s = sizeScale(z, p);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("only reaches max (1.0) at the closest depth", () => {
    const p = makeParams({ sizePower: 3 });
    for (let i = 0; i < 50; i++) {
      // Any z strictly greater than zNear should give sizeScale strictly < 1.
      const z = p.zFar - (p.zFar - p.zNear) * (i / 50);
      if (z > p.zNear + 1e-9) {
        expect(sizeScale(z, p)).toBeLessThan(1);
      }
    }
    expect(sizeScale(p.zNear, p)).toBe(1);
  });
});

describe("alphaFor", () => {
  const params = makeParams();

  it("equals 1 at z=zFar (fully far)", () => {
    expect(alphaFor(params.zFar, params)).toBe(1);
  });

  it("equals minAlpha at z=zNear (fully near)", () => {
    expect(alphaFor(params.zNear, params)).toBeCloseTo(params.minAlpha, 9);
  });

  it("equals 1 just before fade threshold, < 1 just after (with fading enabled)", () => {
    // DEFAULTS may set minAlpha=1 (no fade); test the curve with fading on.
    const fading = makeParams({ minAlpha: 0.5 });
    const zFadeStart =
      fading.zFar - (fading.zFar - fading.zNear) * fading.fadeStartDepth;
    expect(alphaFor(zFadeStart + 1e-6, fading)).toBeCloseTo(1, 6);
    expect(alphaFor(zFadeStart - 0.01, fading)).toBeLessThan(1);
  });

  it("monotonically non-increasing as z decreases", () => {
    let prev = 2;
    for (let i = 0; i <= 50; i++) {
      const z = params.zFar - (params.zFar - params.zNear) * (i / 50);
      const a = alphaFor(z, params);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      prev = a;
    }
  });

  it("linear interpolation between fade-start and zNear", () => {
    const zFadeStart =
      params.zFar - (params.zFar - params.zNear) * params.fadeStartDepth;
    const zMid = (zFadeStart + params.zNear) / 2;
    const expected = 1 + (params.minAlpha - 1) * 0.5;
    expect(alphaFor(zMid, params)).toBeCloseTo(expected, 6);
  });
});

describe("projectSprite", () => {
  const params = makeParams();

  it("scales from zero on spawn", () => {
    const s = blank();
    s.finalSize = params.sizeMax;
    s.z = params.zNear;
    s.age = 0;
    const r0 = projectSprite(s, params, 800, 800);
    expect(r0.w).toBe(0);

    s.age = params.spawnDuration;
    const rDone = projectSprite(s, params, 800, 800);
    expect(rDone.w).toBeGreaterThan(0);
  });

  it("on-screen size never exceeds finalSize (which itself respects sizeMax)", () => {
    const s = blank();
    s.finalSize = params.sizeMax;
    s.age = 999;
    for (let i = 0; i <= 20; i++) {
      s.z = params.zFar - (params.zFar - params.zNear) * (i / 20);
      const r = projectSprite(s, params, 800, 800);
      expect(r.w).toBeLessThanOrEqual(params.sizeMax + 1e-12);
    }
  });

  it("size grows monotonically as z decreases (post spawn-in)", () => {
    const s = blank();
    s.finalSize = 0.5;
    s.age = 999;
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      s.z = params.zFar - (params.zFar - params.zNear) * (i / 20);
      const r = projectSprite(s, params, 800, 800);
      expect(r.w).toBeGreaterThanOrEqual(prev);
      prev = r.w;
    }
  });

  it("aspect compensation keeps sprites pixel-square", () => {
    const s = blank();
    s.finalSize = 0.5;
    s.age = 999;
    s.z = params.zFar / 2;
    const cw = 400;
    const ch = 800;
    const r = projectSprite(s, params, cw, ch);
    expect(r.h / r.w).toBeCloseTo(cw / ch, 9);
  });

  it("sprite center == worldX/z, worldY/z (pinhole projection)", () => {
    const s = blank();
    s.worldX = 0.6;
    s.worldY = -0.4;
    s.z = 2.0;
    s.age = 999;
    s.finalSize = 0.3;
    const r = projectSprite(s, params, 800, 800);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    expect(cx).toBeCloseTo(0.6 / 2.0, 9);
    expect(cy).toBeCloseTo(-0.4 / 2.0, 9);
  });

  it("only reaches finalSize at the closest depth (sizePower curve)", () => {
    const p = makeParams({ sizePower: 3 });
    const s = blank();
    s.finalSize = p.sizeMax;
    s.age = 999;
    // Sweep depths above zNear: width must stay strictly below finalSize.
    for (let i = 0; i < 20; i++) {
      const z = p.zFar - (p.zFar - p.zNear) * (i / 20);
      if (z > p.zNear + 1e-9) {
        s.z = z;
        const r = projectSprite(s, p, 800, 800);
        expect(r.w).toBeLessThan(p.sizeMax);
      }
    }
    // At zNear (and age past spawn), width hits finalSize.
    s.z = p.zNear;
    const r = projectSprite(s, p, 800, 800);
    expect(r.w).toBeCloseTo(p.sizeMax, 9);
  });

  it("returned alpha matches alphaFor(z)", () => {
    const s = blank();
    s.finalSize = 0.5;
    s.age = 999;
    s.z = params.zNear;
    const r = projectSprite(s, params, 800, 800);
    expect(r.alpha).toBeCloseTo(alphaFor(params.zNear, params), 9);
  });
});

describe("hasExited", () => {
  it("false when sprite is fully on-screen", () => {
    expect(hasExited({ x: -0.05, y: -0.05, w: 0.1, h: 0.1, alpha: 1 })).toBe(false);
  });

  it("false during partial exit (still touching viewport)", () => {
    expect(hasExited({ x: 0.95, y: -0.05, w: 0.1, h: 0.1, alpha: 1 })).toBe(false);
  });

  it("true once rect's center is more than half-width past ±1", () => {
    expect(hasExited({ x: 1.5, y: -0.05, w: 0.1, h: 0.1, alpha: 1 })).toBe(true);
    expect(hasExited({ x: -1.6, y: -0.05, w: 0.1, h: 0.1, alpha: 1 })).toBe(true);
    expect(hasExited({ x: -0.05, y: 1.5, w: 0.1, h: 0.1, alpha: 1 })).toBe(true);
    expect(hasExited({ x: -0.05, y: -1.6, w: 0.1, h: 0.1, alpha: 1 })).toBe(true);
  });
});

describe("end-to-end: spawn → advance → respawn", () => {
  it("advancing a freshly spawned sprite eventually exits, then a respawn lands inside the spawn disc", () => {
    const params = makeParams({ baseSpeed: 5, nearBoost: 5, speedFactor: 1 });
    const canvasH = 800;
    const rng = makeRng(2026);
    const s = blank();
    spawnSprite(s, params, canvasH, rng);

    // Run up to 5s of simulation at 60 FPS — the sprite should exit before that.
    let exited = false;
    for (let f = 0; f < 300; f++) {
      advanceSprite(s, params, 1 / 60);
      const r = projectSprite(s, params, canvasH, canvasH);
      if (hasExited(r) || s.z <= params.zNear) {
        exited = true;
        break;
      }
    }
    expect(exited).toBe(true);

    // Respawn lands inside the spawn disc again.
    spawnSprite(s, params, canvasH, rng);
    const r = Math.hypot(s.worldX / s.z, s.worldY / s.z);
    const radiusNdc = params.spawnRadiusPx / (canvasH / 2);
    expect(r).toBeLessThanOrEqual(radiusNdc + 1e-12);
  });
});

describe("DEFAULTS sanity", () => {
  it("all numeric and finite", () => {
    for (const v of Object.values(DEFAULTS)) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("zNear < zFar, sizeMin <= sizeMax, speedMin <= speedMax, fadeStartDepth in [0, 1]", () => {
    const p: SpriteParams = DEFAULTS;
    expect(p.zNear).toBeLessThan(p.zFar);
    expect(p.sizeMin).toBeLessThanOrEqual(p.sizeMax);
    expect(p.speedMin).toBeLessThanOrEqual(p.speedMax);
    expect(p.fadeStartDepth).toBeGreaterThanOrEqual(0);
    expect(p.fadeStartDepth).toBeLessThanOrEqual(1);
    expect(p.minAlpha).toBeGreaterThanOrEqual(0);
    expect(p.minAlpha).toBeLessThanOrEqual(1);
  });
});
