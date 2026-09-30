/**
 * Soap Film — touch ring buffer, feeding the shader's `uTouch[8]`/`uTouchAge[8]`.
 * Design notes: README.md → "hooks/useFilmTouches.ts".
 */

import { useMemo } from "react";
import {
  Gesture,
  type GestureStateChangeEvent,
  type GestureUpdateEvent,
  type PanGesture,
  type PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  FILM_TOUCH_AGE_INACTIVE,
  FILM_TOUCH_SLOTS,
  FILM_TOUCH_VELOCITY_CLAMP,
} from "../soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

export type UseFilmTouchesParams = {
  /** UI-thread clock — ages are derived from it, not incremented by hand. */
  time: SharedValue<number>;
};

export type UseFilmTouchesReturn = {
  /** Flat `[x, y, vx, vy] * FILM_TOUCH_SLOTS`, points — matches `uTouch[8]`. */
  touch: SharedValue<number[]>;
  /** Flat `age * FILM_TOUCH_SLOTS`, seconds — matches `uTouchAge[8]`. */
  touchAge: SharedValue<number[]>;
  /** Attach over the same view the squircle is drawn in (canvas points). */
  panGesture: PanGesture;
};

// ============================================================================
// Hook
// ============================================================================

export function useFilmTouches({
  time,
}: UseFilmTouchesParams): UseFilmTouchesReturn {
  const touch = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS * 4).fill(0),
  );
  const touchAge = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS).fill(FILM_TOUCH_AGE_INACTIVE),
  );
  // Wall-clock time (from `time`) each slot's impulse was written, so age is
  // always `time.value - impactTime[i]` — never hand-incremented, so it can
  // never drift out of sync with the clock that drives the flow field.
  const impactTime = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS).fill(-FILM_TOUCH_AGE_INACTIVE * 10),
  );
  const cursor = useSharedValue<number>(0);

  const writeImpulse = (x: number, y: number, vx: number, vy: number) => {
    "worklet";
    const slot = cursor.value % FILM_TOUCH_SLOTS;
    const clampedVx = Math.min(
      Math.max(vx, -FILM_TOUCH_VELOCITY_CLAMP),
      FILM_TOUCH_VELOCITY_CLAMP,
    );
    const clampedVy = Math.min(
      Math.max(vy, -FILM_TOUCH_VELOCITY_CLAMP),
      FILM_TOUCH_VELOCITY_CLAMP,
    );

    const nextTouch = touch.value.slice();
    nextTouch[slot * 4] = x;
    nextTouch[slot * 4 + 1] = y;
    nextTouch[slot * 4 + 2] = clampedVx;
    nextTouch[slot * 4 + 3] = clampedVy;
    touch.value = nextTouch;

    const nextImpact = impactTime.value.slice();
    nextImpact[slot] = time.value;
    impactTime.value = nextImpact;

    cursor.value = slot + 1;
  };

  const onBegin = (
    e: GestureStateChangeEvent<PanGestureHandlerEventPayload>,
  ) => {
    "worklet";
    writeImpulse(e.x, e.y, e.velocityX, e.velocityY);
  };

  const onUpdate = (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    writeImpulse(e.x, e.y, e.velocityX, e.velocityY);
  };

  const panGesture = useMemo(
    () => Gesture.Pan().onBegin(onBegin).onUpdate(onUpdate).minDistance(0),
    [],
  );

  // Ages are recomputed every frame from `time` — the only per-frame write,
  // and it never touches `touch`/`impactTime` themselves.
  useFrameCallback(() => {
    "worklet";
    const ages = new Array(FILM_TOUCH_SLOTS);
    const impacts = impactTime.value;
    for (let i = 0; i < FILM_TOUCH_SLOTS; i++) {
      ages[i] = Math.min(time.value - impacts[i], FILM_TOUCH_AGE_INACTIVE);
    }
    touchAge.value = ages;
  }, true);

  return { touch, touchAge, panGesture };
}
