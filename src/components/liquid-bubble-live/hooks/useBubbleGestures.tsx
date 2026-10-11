// ============================================================================
// Gestures interactions
// ============================================================================

import { SPRING_FOLLOW_PROPS } from "@/components/wabi-and-more/constants";
import {
  SPRING_BOUNCE_ANIMATION,
  SPRING_CONFIG,
} from "@/lib/animations/constants";
import { useMemo } from "react";
import { MULT_MIN } from "../bubbleModes";
import {
  Gesture,
  GestureStateChangeEvent,
  GestureUpdateEvent,
  PanGesture,
  PanGestureHandlerEventPayload,
  PinchGesture,
  PinchGestureChangeEventPayload,
  PinchGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import {
  clamp,
  DerivedValue,
  SharedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type UseBubblPanGestureParams = {
  centerX: number;
  centerY: number;
  /** Scales the follow spring's `mass`: a heavier bubble lags the finger more. */
  inertia?: DerivedValue<number>;
};

type UseBubblPanGestureReturn = {
  /** Spring-smoothed anchor (trails the finger ~0.1 s × velocity). */
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  /** Raw, unsmoothed finger position: anchor on these to keep the bubble under the finger. */
  targetX: SharedValue<number>;
  targetY: SharedValue<number>;
  /** 1 while the pan is active, 0 otherwise (release edge triggers the kick). */
  isActive: SharedValue<number>;
  /** Raw gesture velocity, pt/s (feeds the release kick only). */
  velocityX: SharedValue<number>;
  velocityY: SharedValue<number>;
  panGesture: PanGesture;
};

export function useBubblePanGesture({
  centerX,
  centerY,
  inertia,
}: UseBubblPanGestureParams): UseBubblPanGestureReturn {
  const bubbleX = useSharedValue<number>(centerX);
  const bubbleY = useSharedValue<number>(centerY);
  const targetX = useSharedValue<number>(centerX);
  const targetY = useSharedValue<number>(centerY);
  const isActive = useSharedValue<number>(0);
  const velocityX = useSharedValue<number>(0);
  const velocityY = useSharedValue<number>(0);

  const onBegin = (
    e: GestureStateChangeEvent<PanGestureHandlerEventPayload>,
  ) => {
    "worklet";
    isActive.value = 1;
    targetX.value = e.x;
    targetY.value = e.y;
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const onUpdate = (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    // Heavier bubble (inertia > 1) = heavier follow spring.
    const cfg = {
      ...SPRING_FOLLOW_PROPS,
      mass:
        SPRING_FOLLOW_PROPS.mass *
        (inertia ? Math.max(inertia.value, MULT_MIN) : 1),
    };
    bubbleX.value = withSpring(e.x, cfg);
    bubbleY.value = withSpring(e.y, cfg);
    targetX.value = e.x;
    targetY.value = e.y;
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const onEnd = (e: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    isActive.value = 0;
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const onFinalize = (
    e: GestureStateChangeEvent<PanGestureHandlerEventPayload>,
  ) => {
    "worklet";
    // onEnd doesn't fire on cancel/fail; onFinalize always does.
    isActive.value = 0;
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(onBegin)
        .onUpdate(onUpdate)
        .onEnd(onEnd)
        .onFinalize(onFinalize),
    [centerX, centerY],
  );
  return {
    bubbleX,
    bubbleY,
    targetX,
    targetY,
    isActive,
    velocityX,
    velocityY,
    panGesture,
  };
}

type UseBubblPinchGestureParams = {
  /** Radius the bubble starts at, in points. */
  restRadius: number;
  /** Largest radius a pinch can reach, in points. */
  maxRadius: number;
  /** Smallest radius a pinch can reach, in points. */
  minRadius?: number;
};

type UseBubblPinchGestureReturn = {
  scaledRadius: SharedValue<number>;
  pinchGesture: PinchGesture;
};

export function useBubblePinchGesture({
  restRadius,
  maxRadius,
  minRadius = 16,
}: UseBubblPinchGestureParams): UseBubblPinchGestureReturn {
  const scaledRadius = useSharedValue<number>(restRadius);
  // Radius (points) when this pinch started — the base `e.scale` multiplies.
  const savedRadius = useSharedValue<number>(restRadius);

  const onBegin = () => {
    "worklet";
    // Captured on begin so a cancelled pinch can't leave a stale base.
    savedRadius.value = scaledRadius.value;
  };

  const onUpdate = (e: GestureUpdateEvent<PinchGestureHandlerEventPayload>) => {
    "worklet";
    // `e.scale` is cumulative, so this absolute target cannot drift.
    scaledRadius.value = withSpring(
      clamp(savedRadius.value * e.scale, minRadius, maxRadius),
      SPRING_BOUNCE_ANIMATION,
    );
  };

  const pinchGesture = useMemo(
    () => Gesture.Pinch().onBegin(onBegin).onUpdate(onUpdate),
    [minRadius, maxRadius],
  );
  return { scaledRadius, pinchGesture };
}
