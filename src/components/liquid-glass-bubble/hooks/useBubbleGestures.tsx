// ============================================================================
// Gestures interactions
// ============================================================================

import { SPRING_FOLLOW_PROPS } from "@/components/wabi-and-more/constants";
import { SPRING_BOUNCE_ANIMATION, SPRING_CONFIG } from "@/lib/animations/constants";
import { useMemo } from "react";
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
  SharedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type UseBubblPanGestureParams = {
  centerX: number;
  centerY: number;
};

type UseBubblPanGestureReturn = {
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  /** 1 while the pan is active (begin..end/finalize), 0 otherwise. Read by
   * `bubbleModeMath.ts` to detect the release edge for the mode 3/4 kick. */
  isActive: SharedValue<number>;
  /** Raw `e.velocityX`/`e.velocityY` from the gesture, pt/s. Plumbed for
   * later phases — the mode-2 physics derives its own speed/angle from the
   * (cx, cy) position delta, not from these. */
  velocityX: SharedValue<number>;
  velocityY: SharedValue<number>;
  panGesture: PanGesture;
};

export function useBubblePanGesture({
  centerX,
  centerY,
}: UseBubblPanGestureParams): UseBubblPanGestureReturn {
  const bubbleX = useSharedValue<number>(centerX);
  const bubbleY = useSharedValue<number>(centerY);
  const isActive = useSharedValue<number>(0);
  const velocityX = useSharedValue<number>(0);
  const velocityY = useSharedValue<number>(0);

  const onBegin = (e: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    isActive.value = 1;
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const onUpdate = (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    bubbleX.value = withSpring(e.x, SPRING_FOLLOW_PROPS);
    bubbleY.value = withSpring(e.y, SPRING_FOLLOW_PROPS);
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const onEnd = (
    e: GestureStateChangeEvent<PanGestureHandlerEventPayload>,
  ) => {
    "worklet";
    isActive.value = 0;
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const onFinalize = (
    e: GestureStateChangeEvent<PanGestureHandlerEventPayload>,
  ) => {
    "worklet";
    // Covers the cancelled/failed path too — onEnd doesn't always fire, but
    // onFinalize always does, so this is the reliable place to guarantee
    // isActive drops back to 0.
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
  return { bubbleX, bubbleY, isActive, velocityX, velocityY, panGesture };
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
  // Radius at the moment this pinch started — the base `e.scale` multiplies.
  // Both values are in points; mixing a multiplier in here collapses the bubble.
  const savedRadius = useSharedValue<number>(restRadius);

  const onBegin = () => {
    "worklet";
    // Capture on begin rather than on end so a cancelled pinch can't leave a
    // stale base behind.
    savedRadius.value = scaledRadius.value;
  };

  const onUpdate = (e: GestureUpdateEvent<PinchGestureHandlerEventPayload>) => {
    "worklet";
    // `e.scale` is cumulative from the start of the gesture, so this is an
    // absolute target recomputed each frame — it cannot drift.
    scaledRadius.value = withSpring(clamp(
      savedRadius.value * e.scale,
      minRadius,
      maxRadius,
    ), SPRING_BOUNCE_ANIMATION);
  };

  const pinchGesture = useMemo(
    () => Gesture.Pinch().onBegin(onBegin).onUpdate(onUpdate),
    [minRadius, maxRadius],
  );
  return { scaledRadius, pinchGesture };
}
