/**
 * Liquid Bubbles Multi — one bubble's float life cycle as a pure step.
 * Design notes: README.md → "hooks/multiBubbleMath.ts".
 *
 * FLOW (called once per bubble per frame by `useMultiBubblePhysics`):
 *   WAIT     → count down this bubble's stagger (only while float is on)
 *   SPAWN    → roll traits + birth shape, pick a target radius, launch v
 *              within ±FLOAT_LAUNCH_CONE of up, `needsAnchor = true`
 *   INFLATE  → R springs 1 → target; attached at the box mouth (spawnY − R)
 *              while the motion eases in over BIRTH_TIME
 *   FLOAT    → buoyancy + sway + air drag, soft bounces off the sides and
 *              bottom; FLOAT_EXIT_RADII above the top → SPAWN
 *
 * KEY FEATURES:
 * - A port of `liquid-bubble-live/hooks/useBubbleFloat.ts` with the same
 *   constants and the same forces; SharedValues become plain fields.
 * - The radius is integrated here (see `INFLATE_ZETA` / `INFLATE_OMEGA`)
 *   instead of `withSpring`, so the whole step is plain numbers and
 *   `bun test` can run it.
 * - `rand` is a parameter: `Math.random` on device, a seeded generator in
 *   the tests.
 * - No allocation after `createFloatState`, and no calls to sibling
 *   helpers: a captured `'worklet'` helper can resolve as undefined in
 *   Bundle Mode (see `bubbleModeMath.ts`), so everything is inline.
 * - Gestures (phase 4) are not here yet: nothing holds a bubble.
 */

import {
  BIRTH_A2_RANGE,
  BIRTH_A3_MAX,
  BIRTH_A4_MAX,
  BIRTH_BUOYANCY_RANGE,
  BIRTH_INERTIA_RANGE,
  BIRTH_RADIUS_RANGE,
  BIRTH_RADIUS_START,
  BIRTH_STRENGTH_RANGE,
  BIRTH_TIME,
  BIRTH_WOBBLE_RANGE,
  DT_MAX_MS,
  DT_MIN_MS,
  FLOAT_BOUNCE_KEEP,
  FLOAT_BUOYANCY,
  FLOAT_DRAG,
  FLOAT_EXIT_RADII,
  FLOAT_LAUNCH_CONE,
  FLOAT_LAUNCH_MAX,
  FLOAT_LAUNCH_MIN,
  FLOAT_SWAY,
  FLOAT_SWAY_PERIOD,
  MULT_MIN,
} from "../../liquid-bubble-live/bubbleModes";
import {
  INFLATE_OMEGA,
  INFLATE_ZETA,
  SPAWN_SPREAD,
  SPAWN_STAGGER,
} from "../multiBubbleConfig";

// ============================================================================
// Types
// ============================================================================

/** Life-cycle phases. */
export const PHASE_WAIT = 0;
export const PHASE_SPAWN = 1;
export const PHASE_INFLATE = 2;
export const PHASE_FLOAT = 3;

/** One bubble's mutable float state. Owned by the UI runtime. */
export type FloatState = {
  phase: number;
  /** Seconds left in WAIT. */
  wait: number;
  /** Seconds since this spawn (drives the INFLATE ease-in). */
  age: number;
  /** Center, canvas points. */
  x: number;
  y: number;
  /** Velocity, pt/s (y down). */
  vx: number;
  vy: number;
  /** Free-flight displacement from the box mouth, built up during INFLATE. */
  offsetX: number;
  offsetY: number;
  /** This spawn's mouth x (box center ± SPAWN_SPREAD). */
  mouthX: number;
  /** Radius, points, its spring velocity and its target. */
  R: number;
  rVel: number;
  rTarget: number;
  swayTime: number;
  swayPhase: number;
  /** Random traits, re-rolled at every spawn (multiply the sliders). */
  wobbleMul: number;
  strengthMul: number;
  inertiaMul: number;
  buoyancyMul: number;
  /** `[a2, phi2, a3, phi3, a4, phi4]`, applied when the modes re-anchor. */
  birth: number[];
  /** Set at spawn: the caller re-anchors the modes, applies `birth`, clears it. */
  needsAnchor: boolean;
};

/**
 * Per-frame inputs shared by every bubble. The caller allocates it once and
 * overwrites the fields each frame.
 */
export type FloatEnv = {
  /** Spawn box top-center, canvas points. */
  spawnX: number;
  spawnY: number;
  /** Canvas size, points. */
  width: number;
  height: number;
  /** Mean birth radius, points; each bubble is `× BIRTH_RADIUS_RANGE`. */
  restRadius: number;
  /** 1 = float, 0 = park (waiting bubbles stay hidden, newborns wait at the mouth). */
  enabled: number;
  /** Buoyancy slider (base), × each bubble's `buoyancyMul`. */
  buoyancy: number;
  /** Inertia slider (base), × each bubble's `inertiaMul`. */
  inertia: number;
};

// ============================================================================
// Setup (once per mount, not per frame)
// ============================================================================

/** Fresh state for bubble `index`: hidden, waiting `index × SPAWN_STAGGER` s. */
export function createFloatState(index: number): FloatState {
  "worklet";
  return {
    phase: PHASE_WAIT,
    wait: index * SPAWN_STAGGER,
    age: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    offsetX: 0,
    offsetY: 0,
    mouthX: 0,
    R: 0,
    rVel: 0,
    rTarget: 0,
    swayTime: 0,
    swayPhase: 0,
    wobbleMul: 1,
    strengthMul: 1,
    inertiaMul: 1,
    buoyancyMul: 1,
    birth: [0, 0, 0, 0, 0, 0],
    needsAnchor: false,
  };
}

/** Allocate a `FloatEnv`. */
export function createFloatEnv(): FloatEnv {
  "worklet";
  return {
    spawnX: 0,
    spawnY: 0,
    width: 0,
    height: 0,
    restRadius: 0,
    enabled: 1,
    buoyancy: 1,
    inertia: 1,
  };
}

// ============================================================================
// Per-frame step
// ============================================================================

/**
 * Advance one bubble by one frame. Returns `true` on the frame it spawned
 * (the caller fires `onSpawn` then). A WAIT bubble has `R = 0` and should
 * not be drawn.
 */
export function stepBubbleFloat(
  s: FloatState,
  env: FloatEnv,
  dtMs: number,
  rand: () => number,
): boolean {
  "worklet";
  const dt = Math.min(Math.max(dtMs, DT_MIN_MS), DT_MAX_MS) / 1000;

  // ---- WAIT: hidden until this bubble's turn ----
  if (s.phase === PHASE_WAIT) {
    if (env.enabled !== 1) {
      return false;
    }
    s.wait -= dt;
    if (s.wait > 0) {
      return false;
    }
    s.phase = PHASE_SPAWN;
  }

  // ---- SPAWN: roll traits, start inflating at the box mouth ----
  if (s.phase === PHASE_SPAWN) {
    s.wobbleMul =
      BIRTH_WOBBLE_RANGE[0] +
      rand() * (BIRTH_WOBBLE_RANGE[1] - BIRTH_WOBBLE_RANGE[0]);
    s.strengthMul =
      BIRTH_STRENGTH_RANGE[0] +
      rand() * (BIRTH_STRENGTH_RANGE[1] - BIRTH_STRENGTH_RANGE[0]);
    s.inertiaMul =
      BIRTH_INERTIA_RANGE[0] +
      rand() * (BIRTH_INERTIA_RANGE[1] - BIRTH_INERTIA_RANGE[0]);
    s.buoyancyMul =
      BIRTH_BUOYANCY_RANGE[0] +
      rand() * (BIRTH_BUOYANCY_RANGE[1] - BIRTH_BUOYANCY_RANGE[0]);
    s.birth[0] =
      BIRTH_A2_RANGE[0] + rand() * (BIRTH_A2_RANGE[1] - BIRTH_A2_RANGE[0]);
    s.birth[1] = rand() * 2 * Math.PI;
    s.birth[2] = rand() * BIRTH_A3_MAX;
    s.birth[3] = rand() * 2 * Math.PI;
    s.birth[4] = rand() * BIRTH_A4_MAX;
    s.birth[5] = rand() * 2 * Math.PI;

    s.rTarget =
      env.restRadius *
      (BIRTH_RADIUS_RANGE[0] +
        rand() * (BIRTH_RADIUS_RANGE[1] - BIRTH_RADIUS_RANGE[0]));
    s.R = BIRTH_RADIUS_START;
    s.rVel = 0;

    s.mouthX = env.spawnX + (rand() * 2 - 1) * SPAWN_SPREAD;
    s.x = s.mouthX;
    s.y = env.spawnY - BIRTH_RADIUS_START;
    // Launch velocity is picked now but only eases in during INFLATE.
    const angle = -Math.PI / 2 + (rand() * 2 - 1) * FLOAT_LAUNCH_CONE;
    const speed =
      FLOAT_LAUNCH_MIN + rand() * (FLOAT_LAUNCH_MAX - FLOAT_LAUNCH_MIN);
    s.vx = Math.cos(angle) * speed;
    s.vy = Math.sin(angle) * speed;
    s.offsetX = 0;
    s.offsetY = 0;
    s.age = 0;
    s.swayTime = 0;
    s.swayPhase = rand() * 2 * Math.PI;
    // A teleport is not motion — the caller re-anchors the modes.
    s.needsAnchor = true;
    s.phase = PHASE_INFLATE;
    return true;
  }

  // ---- Radius spring (every visible phase; stands in for withSpring) ----
  // Semi-implicit Euler: stable for ω·dt ≪ 1 (ω ≈ 4.4, dt ≤ 20 ms).
  s.rVel +=
    (-INFLATE_OMEGA * INFLATE_OMEGA * (s.R - s.rTarget) -
      2 * INFLATE_ZETA * INFLATE_OMEGA * s.rVel) *
    dt;
  s.R += s.rVel * dt;
  if (s.R < BIRTH_RADIUS_START) {
    s.R = BIRTH_RADIUS_START;
    s.rVel = 0;
  }
  const R = s.R;
  const inflating = s.phase === PHASE_INFLATE;

  // ---- INFLATE: grow and start moving together, both over BIRTH_TIME ----
  let m = 1;
  if (inflating) {
    // Float off: a newborn keeps growing but waits at the mouth.
    if (env.enabled === 1) {
      s.age += dt;
    }
    const u = Math.min(s.age / BIRTH_TIME, 1);
    m = u * u * (3 - 2 * u);
    if (m === 0) {
      s.x = s.mouthX + s.offsetX;
      s.y = env.spawnY - R + s.offsetY;
      return false;
    }
    if (u >= 1) {
      s.phase = PHASE_FLOAT;
    }
  } else if (env.enabled !== 1) {
    // ---- FLOAT off: park ----
    s.vx = 0;
    s.vy = 0;
    return false;
  }

  let nvx = s.vx;
  let nvy = s.vy;

  // Forces (both phases). y is DOWN, so buoyancy subtracts.
  const I = Math.max(env.inertia * s.inertiaMul, MULT_MIN);
  s.swayTime += dt;
  nvy -= ((FLOAT_BUOYANCY * env.buoyancy * s.buoyancyMul) / I) * dt;
  nvx +=
    FLOAT_SWAY *
    Math.sin((2 * Math.PI * s.swayTime) / FLOAT_SWAY_PERIOD + s.swayPhase) *
    dt;
  const damp = Math.exp((-FLOAT_DRAG / Math.sqrt(I)) * dt);
  nvx *= damp;
  nvy *= damp;
  s.vx = nvx;
  s.vy = nvy;

  if (inflating) {
    s.offsetX += nvx * m * dt;
    s.offsetY += nvy * m * dt;
    s.x = s.mouthX + s.offsetX;
    s.y = env.spawnY - R + s.offsetY;
    return false;
  }

  let x = s.x + nvx * dt;
  let y = s.y + nvy * dt;

  // Soft bounce: left, right, bottom. Only reflect a velocity heading INTO
  // the wall, so a bubble resting against it can't jitter.
  const minX = R;
  const maxX = Math.max(env.width - R, R);
  const maxY = Math.max(env.height - R, R);
  if (x < minX) {
    x = minX;
    if (s.vx < 0) s.vx = -s.vx * FLOAT_BOUNCE_KEEP;
  } else if (x > maxX) {
    x = maxX;
    if (s.vx > 0) s.vx = -s.vx * FLOAT_BOUNCE_KEEP;
  }
  if (y > maxY) {
    y = maxY;
    if (s.vy > 0) s.vy = -s.vy * FLOAT_BOUNCE_KEEP;
  }
  s.x = x;
  s.y = y;

  // Out the top: next frame spawns a new bubble from the box.
  if (y < -R * FLOAT_EXIT_RADII) {
    s.phase = PHASE_SPAWN;
  }
  return false;
}
