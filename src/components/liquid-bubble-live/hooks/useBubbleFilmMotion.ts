/**
 * useBubbleFilmMotion — the bubble's motion as soap-film touch impulses, so
 * the film lags opposite to the direction of travel and eases back at rest.
 * Design notes: README.md → "filmOverlayShader.ts" → "Film motion".
 *
 * FLOW (UI worklet, one `useFrameCallback`):
 *   posX/posY (spring-smoothed) → v = Δpos / dt (dt clamped like useClock)
 *   → gate: enabled · drag > 0 · |v| ≥ FILM_DRAG_SPEED_MIN · every 0.1 s
 *   → vFilm = −v · (200 / R) · GAIN · drag, |vFilm| ≤ FILM_DRAG_MAX, ÷ S(τ)
 *   → ring write (FILM_CENTER, FILM_CENTER, vFx, vFy) into one of 8 slots
 *   → every frame: ages = min(time − impactTime, FILM_TOUCH_AGE_INACTIVE)
 *   → SOAP_THICKNESS's `touchVelocity()` inside the backtrace (no SkSL change)
 *
 * KEY FEATURES:
 * - Multi-bubble ready: all state lives in this hook's own SharedValues (no
 *   `globalThis` singleton), and every input is a parameter, so each bubble
 *   gets one instance feeding its own film.
 * - Velocity from the spring-smoothed position, not the gesture: it keeps
 *   seeing motion after release while the follow spring settles.
 * - Returns its own `touchTau` / `touchRadius` so the caller overrides the
 *   film's flow uniforms with them (see `LiquidBubbleLive.tsx`).
 */

import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  FILM_TOUCH_AGE_INACTIVE,
  FILM_TOUCH_SLOTS,
  FILM_TOUCH_TAU_MAX,
  FILM_TOUCH_TAU_MIN,
} from "@/components/soap-film/soapFilmConfig";

import {
  DT_MAX_MS,
  DT_MIN_MS,
  FILM_DRAG_GAIN,
  FILM_DRAG_MAX,
  FILM_DRAG_RADIUS,
  FILM_DRAG_SPEED_MIN,
  FILM_DRAG_TAU,
  FILM_DRAG_WRITE_INTERVAL,
  MULT_MIN,
} from "../bubbleModes";
import { FILM_OVERLAY_SIZE } from "../filmOverlayShader";

// ============================================================================
// Types
// ============================================================================

export type UseBubbleFilmMotionParams = {
  /** Spring-smoothed bubble center, canvas points. */
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  /** Current bubble radius `R`, points (maps onto the film's 200 pt disk). */
  radius: SharedValue<number>;
  /** UI-thread clock, seconds — the same one driving the film's `iTime`. */
  time: SharedValue<number>;
  /** 1 = film overlay on (write impulses), 0 = off (write nothing). */
  enabled: SharedValue<number>;
  /** Film drag lever: 0 off · 1 calibrated · 2 exaggerated. */
  drag: SharedValue<number>;
  /** Bubble inertia multiplier; scales the impulse decay `touchTau`. */
  inertia: SharedValue<number>;
};

export type UseBubbleFilmMotionReturn = {
  /** Flat `[x, y, vx, vy] × 8`, film-space points — matches `uTouch[8]`. */
  filmTouch: SharedValue<number[]>;
  /** Flat `age × 8`, seconds — matches `uTouchAge[8]`. */
  filmTouchAge: SharedValue<number[]>;
  /** Impulse decay, seconds (`FILM_DRAG_TAU × inertia`) — override `flow.touchTau`. */
  touchTau: SharedValue<number>;
  /** Push radius, normalized (`FILM_DRAG_RADIUS`) — override `flow.touchRadius`. */
  touchRadius: SharedValue<number>;
};

// ============================================================================
// Constants
// ============================================================================

/** Film center = impulse position, and the film radius the disk maps onto, film pt. */
const FILM_CENTER = FILM_OVERLAY_SIZE[0] / 2;

// ============================================================================
// Hook
// ============================================================================

export function useBubbleFilmMotion({
  posX,
  posY,
  radius,
  time,
  enabled,
  drag,
  inertia,
}: UseBubbleFilmMotionParams): UseBubbleFilmMotionReturn {
  const filmTouch = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS * 4).fill(0),
  );
  const filmTouchAge = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS).fill(FILM_TOUCH_AGE_INACTIVE),
  );
  const touchTau = useSharedValue<number>(FILM_DRAG_TAU);
  const touchRadius = useSharedValue<number>(FILM_DRAG_RADIUS);

  // Clock time each slot was written — ages are always `time − impactTime`,
  // never hand-incremented (same as soap-film's `useFilmTouches`).
  const impactTime = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS).fill(-FILM_TOUCH_AGE_INACTIVE * 10),
  );
  const cursor = useSharedValue<number>(0);
  const lastWrite = useSharedValue<number>(-FILM_TOUCH_AGE_INACTIVE);
  const prevX = useSharedValue<number>(0);
  const prevY = useSharedValue<number>(0);
  const hasPrev = useSharedValue<boolean>(false);
  // True once every slot has aged out — the per-frame age write is skipped.
  const idle = useSharedValue<boolean>(true);

  useFrameCallback((frameInfo) => {
    "worklet";
    const dt =
      Math.min(
        Math.max(frameInfo.timeSincePreviousFrame ?? 16.7, DT_MIN_MS),
        DT_MAX_MS,
      ) / 1000;

    const x = posX.value;
    const y = posY.value;
    // First frame has no previous position: zero velocity, not a jump from 0.
    const vx = hasPrev.value ? (x - prevX.value) / dt : 0;
    const vy = hasPrev.value ? (y - prevY.value) / dt : 0;
    prevX.value = x;
    prevY.value = y;
    hasPrev.value = true;

    // Heavier bubble = impulses linger = the film sloshes longer.
    const tau = Math.min(
      Math.max(FILM_DRAG_TAU * Math.max(inertia.value, MULT_MIN), FILM_TOUCH_TAU_MIN),
      FILM_TOUCH_TAU_MAX,
    );
    if (touchTau.value !== tau) {
      touchTau.value = tau;
    }

    const now = time.value;
    const strength = drag.value;
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (
      enabled.value === 1 &&
      strength > 0 &&
      speed >= FILM_DRAG_SPEED_MIN &&
      now - lastWrite.value >= FILM_DRAG_WRITE_INTERVAL
    ) {
      // Canvas pt/s → film pt/s: the disk (radius R) maps onto a 200 pt
      // radius, and the MINUS makes the backtrace sample ahead of travel,
      // so the pattern shifts backward (lags).
      const toFilm =
        -(FILM_CENTER / Math.max(radius.value, 1)) * FILM_DRAG_GAIN * strength;
      let fx = vx * toFilm;
      let fy = vy * toFilm;
      const mag = Math.sqrt(fx * fx + fy * fy);
      if (mag > FILM_DRAG_MAX) {
        fx *= FILM_DRAG_MAX / mag;
        fy *= FILM_DRAG_MAX / mag;
      }
      // Stacking factor S(τ): all 8 impulses sit at the film center and sum,
      // so a steady drag reaches Σ e^(−k·Δt/τ) × one impulse. Dividing by it
      // makes the STEADY sum hit the calibrated speed at any τ.
      const decayStep = Math.exp(-FILM_DRAG_WRITE_INTERVAL / tau);
      const stack =
        (1 - Math.pow(decayStep, FILM_TOUCH_SLOTS)) / (1 - decayStep);
      fx /= stack;
      fy /= stack;

      const slot = cursor.value % FILM_TOUCH_SLOTS;
      const nextTouch = filmTouch.value.slice();
      nextTouch[slot * 4] = FILM_CENTER;
      nextTouch[slot * 4 + 1] = FILM_CENTER;
      nextTouch[slot * 4 + 2] = fx;
      nextTouch[slot * 4 + 3] = fy;
      filmTouch.value = nextTouch;

      const nextImpact = impactTime.value.slice();
      nextImpact[slot] = now;
      impactTime.value = nextImpact;

      cursor.value = slot + 1;
      lastWrite.value = now;
      idle.value = false;
    }

    if (idle.value) {
      return;
    }
    const ages = new Array<number>(FILM_TOUCH_SLOTS);
    const impacts = impactTime.value;
    let allInactive = true;
    for (let i = 0; i < FILM_TOUCH_SLOTS; i++) {
      ages[i] = Math.min(now - impacts[i], FILM_TOUCH_AGE_INACTIVE);
      if (ages[i] < FILM_TOUCH_AGE_INACTIVE) {
        allInactive = false;
      }
    }
    filmTouchAge.value = ages;
    idle.value = allInactive;
  }, true);

  return { filmTouch, filmTouchAge, touchTau, touchRadius };
}
