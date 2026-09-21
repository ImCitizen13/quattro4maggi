/**
 * useBubbleFloat — the bubble's life cycle: born in the spawn box, inflates
 * out of its top edge, launches up a cone, floats like a soap bubble
 * (buoyancy, sway, drag, soft bounces off the sides and bottom), drifts out
 * the top and is born again. Design notes: README.md → "hooks/useBubbleFloat.ts".
 *
 * FLOW (UI worklet, one `useFrameCallback`):
 *   SPAWN     → roll traits (wobble/strength/inertia/buoyancy multipliers,
 *               birth deformation, launch v within ±FLOAT_LAUNCH_CONE of up),
 *               R = 1 → withSpring(random target, duration BIRTH_TIME),
 *               pos = box top, `anchored = false` so the modes re-anchor,
 *               `onSpawn` on the JS thread (scheduleOnRN)
 *   INFLATE   → attached at spawnY − R (grows out of the box's top edge)
 *               while the motion eases in; both over T = BIRTH_TIME,
 *               starting together — no hold, no velocity jump
 *   FLOAT     → buoyancy + sway + air drag → pos += v·dt, bounces;
 *               center FLOAT_EXIT_RADII above the top → SPAWN
 *   finger down at any phase → hands off to the pan's follow spring;
 *   release → FLOAT with the fling velocity
 *
 * KEY FEATURES:
 * - Sliders are the BASE; each bubble multiplies them by its own traits
 *   (`useBubbleTraits`), so a spawn never overwrites a slider.
 * - Position and radius are read from and written back to the caller's
 *   SharedValues — no second copy to drift; direct writes cancel any
 *   leftover follow spring.
 * - Multi-bubble ready: every input is a parameter and all state is this
 *   hook's own SharedValues — one `useBubbleTraits` + one `useBubbleFloat`
 *   per bubble.
 */

import {
  useFrameCallback,
  useSharedValue,
  withSpring,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { SPRING_BUBBLE_INFLATE } from "@/lib/animations/constants";

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
  FLOAT_FLING_MAX,
  FLOAT_LAUNCH_CONE,
  FLOAT_LAUNCH_MAX,
  FLOAT_LAUNCH_MIN,
  FLOAT_SWAY,
  FLOAT_SWAY_PERIOD,
  MULT_MIN,
} from "../bubbleModes";

// ============================================================================
// Types
// ============================================================================

/** Per-bubble random traits, re-rolled at every spawn. */
export type BubbleTraits = {
  /** Multiplier on the Wobble slider. */
  wobbleMul: SharedValue<number>;
  /** Multiplier on the Strength slider. */
  strengthMul: SharedValue<number>;
  /** Multiplier on the Inertia slider. */
  inertiaMul: SharedValue<number>;
  /** Multiplier on the Buoyancy slider. */
  buoyancyMul: SharedValue<number>;
  /** `[a2, phi2, a3, phi3, a4, phi4]` for `useBubbleShape`'s `birthShape`. */
  birthShape: SharedValue<number[]>;
};

export type UseBubbleFloatParams = {
  /** Bubble center, canvas points — read and written every frame. */
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  /** Bubble radius, points — sprung from ~0 at each spawn (pinch still works). */
  radius: SharedValue<number>;
  /** Mean birth radius, points; each bubble is `× BIRTH_RADIUS_RANGE`. */
  restRadius: number;
  /** Spawn point: the box's top-center, canvas points. */
  spawnX: number;
  spawnY: number;
  /** Canvas size, points. */
  width: number;
  height: number;
  /** 1 while a finger holds the bubble (from `useBubblePanGesture`). */
  isActive: SharedValue<number>;
  /** Gesture velocity, pt/s — becomes the float velocity on release. */
  flingX: SharedValue<number>;
  flingY: SharedValue<number>;
  /** 1 = float, 0 = park (a newborn waits at the box mouth). */
  enabled: SharedValue<number>;
  /** Buoyancy slider (base); multiplied by `traits.buoyancyMul`. */
  buoyancy: SharedValue<number>;
  /** EFFECTIVE inertia (slider × `traits.inertiaMul`): buoyancy ÷ I, drag ÷ √I. */
  inertia: DerivedValue<number>;
  /** This bubble's traits (from `useBubbleTraits`), re-rolled at spawn. */
  traits: BubbleTraits;
  /** `useBubbleShape`'s `anchored` — set false at spawn. */
  anchored: SharedValue<boolean>;
  /** JS-thread callback fired at each spawn (via scheduleOnRN), e.g. a new ImageBubble picture. */
  onSpawn?: () => void;
};

// ============================================================================
// Constants
// ============================================================================

/** Life-cycle phases, stored in a SharedValue<number>. */
const PHASE_SPAWN = 0;
const PHASE_INFLATE = 1;
const PHASE_FLOAT = 2;

// ============================================================================
// Hooks
// ============================================================================

/**
 * One bubble's random traits. A separate hook (no frame callback) because
 * `useBubbleShape` needs the effective wobble/strength/inertia BEFORE
 * `useBubbleFloat` can be called with its `anchored` output.
 */
export function useBubbleTraits(): BubbleTraits {
  return {
    wobbleMul: useSharedValue<number>(1),
    strengthMul: useSharedValue<number>(1),
    inertiaMul: useSharedValue<number>(1),
    buoyancyMul: useSharedValue<number>(1),
    birthShape: useSharedValue<number[]>([]),
  };
}

export function useBubbleFloat({
  posX,
  posY,
  radius,
  restRadius,
  spawnX,
  spawnY,
  width,
  height,
  isActive,
  flingX,
  flingY,
  enabled,
  buoyancy,
  inertia,
  traits,
  anchored,
  onSpawn,
}: UseBubbleFloatParams): void {
  const phase = useSharedValue<number>(PHASE_SPAWN);
  const birthAge = useSharedValue<number>(0);
  const vx = useSharedValue<number>(0);
  const vy = useSharedValue<number>(0);
  // Free-flight displacement from the box mouth, built up during INFLATE.
  const offsetX = useSharedValue<number>(0);
  const offsetY = useSharedValue<number>(0);
  const swayTime = useSharedValue<number>(0);
  const swayPhase = useSharedValue<number>(0);
  const wasActive = useSharedValue<number>(0);

  useFrameCallback((frameInfo) => {
    "worklet";
    const dt =
      Math.min(
        Math.max(frameInfo.timeSincePreviousFrame ?? 16.7, DT_MIN_MS),
        DT_MAX_MS,
      ) / 1000;

    const active = isActive.value;
    const released = wasActive.value === 1 && active === 0;
    wasActive.value = active;

    // ---- SPAWN: roll traits, start inflating at the box mouth ----
    // Inline, not a helper: a captured `'worklet'` helper can resolve as
    // undefined in Bundle Mode, and a nested one allocates every frame.
    if (phase.value === PHASE_SPAWN && active === 0) {
      traits.wobbleMul.value =
        BIRTH_WOBBLE_RANGE[0] +
        Math.random() * (BIRTH_WOBBLE_RANGE[1] - BIRTH_WOBBLE_RANGE[0]);
      traits.strengthMul.value =
        BIRTH_STRENGTH_RANGE[0] +
        Math.random() * (BIRTH_STRENGTH_RANGE[1] - BIRTH_STRENGTH_RANGE[0]);
      traits.inertiaMul.value =
        BIRTH_INERTIA_RANGE[0] +
        Math.random() * (BIRTH_INERTIA_RANGE[1] - BIRTH_INERTIA_RANGE[0]);
      traits.buoyancyMul.value =
        BIRTH_BUOYANCY_RANGE[0] +
        Math.random() * (BIRTH_BUOYANCY_RANGE[1] - BIRTH_BUOYANCY_RANGE[0]);
      traits.birthShape.value = [
        BIRTH_A2_RANGE[0] +
          Math.random() * (BIRTH_A2_RANGE[1] - BIRTH_A2_RANGE[0]),
        Math.random() * 2 * Math.PI,
        Math.random() * BIRTH_A3_MAX,
        Math.random() * 2 * Math.PI,
        Math.random() * BIRTH_A4_MAX,
        Math.random() * 2 * Math.PI,
      ];

      const targetR =
        restRadius *
        (BIRTH_RADIUS_RANGE[0] +
          Math.random() * (BIRTH_RADIUS_RANGE[1] - BIRTH_RADIUS_RANGE[0]));
      radius.value = BIRTH_RADIUS_START;
      // Spring duration = BIRTH_TIME, the same factor the motion eases over.
      radius.value = withSpring(targetR, {
        ...SPRING_BUBBLE_INFLATE,
        duration: BIRTH_TIME * 1000,
      });

      posX.value = spawnX;
      posY.value = spawnY - BIRTH_RADIUS_START;
      // Launch velocity is picked now but only eases in during INFLATE.
      const angle =
        -Math.PI / 2 + (Math.random() * 2 - 1) * FLOAT_LAUNCH_CONE;
      const speed =
        FLOAT_LAUNCH_MIN + Math.random() * (FLOAT_LAUNCH_MAX - FLOAT_LAUNCH_MIN);
      vx.value = Math.cos(angle) * speed;
      vy.value = Math.sin(angle) * speed;
      offsetX.value = 0;
      offsetY.value = 0;
      birthAge.value = 0;
      swayPhase.value = Math.random() * 2 * Math.PI;
      // A teleport is not motion — re-anchor the modes (and apply birthShape).
      anchored.value = false;
      phase.value = PHASE_INFLATE;
      if (onSpawn) {
        scheduleOnRN(onSpawn);
      }
      return;
    }

    // Finger down: the pan's follow spring owns the position.
    if (active === 1) {
      return;
    }
    if (released) {
      // The fling becomes the float velocity, capped — from any phase.
      let fx = flingX.value;
      let fy = flingY.value;
      const fling = Math.sqrt(fx * fx + fy * fy);
      if (fling > FLOAT_FLING_MAX) {
        fx *= FLOAT_FLING_MAX / fling;
        fy *= FLOAT_FLING_MAX / fling;
      }
      vx.value = fx;
      vy.value = fy;
      phase.value = PHASE_FLOAT;
    }

    const R = Math.max(radius.value, BIRTH_RADIUS_START);
    const inflating = phase.value === PHASE_INFLATE;

    // ---- INFLATE: grow and start moving together, both over BIRTH_TIME ----
    // Motion weight m = smoothstep(age / T). The bubble stays attached to
    // the mouth (spawnY − R, rising as it grows) plus a free-flight offset
    // that accumulates v·m·dt, so there is no hold and no velocity jump at
    // the hand-off to FLOAT.
    let m = 1;
    if (inflating) {
      // Float off: a newborn keeps growing but waits at the mouth.
      if (enabled.value === 1) {
        birthAge.value += dt;
      }
      const u = Math.min(birthAge.value / BIRTH_TIME, 1);
      m = u * u * (3 - 2 * u);
      if (m === 0) {
        posX.value = spawnX + offsetX.value;
        posY.value = spawnY - R + offsetY.value;
        return;
      }
      if (u >= 1) {
        phase.value = PHASE_FLOAT;
      }
    } else if (enabled.value !== 1) {
      // ---- FLOAT off: park ----
      vx.value = 0;
      vy.value = 0;
      return;
    }

    let nvx = vx.value;
    let nvy = vy.value;

    // Forces (both phases). y is DOWN, so buoyancy subtracts. During the
    // ease-in they shape `v` too, so the launch already curves upward.
    const I = Math.max(inertia.value, MULT_MIN);
    swayTime.value += dt;
    nvy -= ((FLOAT_BUOYANCY * buoyancy.value * traits.buoyancyMul.value) / I) * dt;
    nvx +=
      FLOAT_SWAY *
      Math.sin(
        (2 * Math.PI * swayTime.value) / FLOAT_SWAY_PERIOD + swayPhase.value,
      ) *
      dt;
    const damp = Math.exp((-FLOAT_DRAG / Math.sqrt(I)) * dt);
    nvx *= damp;
    nvy *= damp;

    let x: number;
    let y: number;
    if (inflating) {
      offsetX.value += nvx * m * dt;
      offsetY.value += nvy * m * dt;
      x = spawnX + offsetX.value;
      y = spawnY - R + offsetY.value;
      vx.value = nvx;
      vy.value = nvy;
      posX.value = x;
      posY.value = y;
      return;
    }

    x = posX.value + nvx * dt;
    y = posY.value + nvy * dt;

    // Soft bounce: left, right, bottom. Only reflect a velocity heading
    // INTO the wall, so a bubble resting against it can't jitter.
    const minX = R;
    const maxX = Math.max(width - R, R);
    const maxY = Math.max(height - R, R);
    if (x < minX) {
      x = minX;
      if (nvx < 0) nvx = -nvx * FLOAT_BOUNCE_KEEP;
    } else if (x > maxX) {
      x = maxX;
      if (nvx > 0) nvx = -nvx * FLOAT_BOUNCE_KEEP;
    }
    if (y > maxY) {
      y = maxY;
      if (nvy > 0) nvy = -nvy * FLOAT_BOUNCE_KEEP;
    }

    vx.value = nvx;
    vy.value = nvy;
    posX.value = x;
    posY.value = y;

    // Out the top: next frame spawns a new bubble from the box.
    if (y < -R * FLOAT_EXIT_RADII) {
      phase.value = PHASE_SPAWN;
    }
  }, true);
}
