// ============================================================================
// Gestures interactions
// ============================================================================

import { SPRING_FOLLOW_PROPS } from "@/components/wabi-and-more/constants";
import { SPRING_BOUNCE_ANIMATION, SPRING_CONFIG } from "@/lib/animations/constants";
import { useMemo } from "react";
import {
  Gesture,
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
  panGesture: PanGesture;
};

export function useBubblePanGesture({
  centerX,
  centerY,
}: UseBubblPanGestureParams): UseBubblPanGestureReturn {
  const bubbleX = useSharedValue<number>(centerX);
  const bubbleY = useSharedValue<number>(centerY);
  const onBegin = () => {
    "worklet";
  };

  const onUpdate = (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    bubbleX.value = withSpring(e.x, SPRING_FOLLOW_PROPS);
    bubbleY.value = withSpring(e.y, SPRING_FOLLOW_PROPS);
  };

  const onEnd = () => {
    "worklet";
  };
  const panGesture = useMemo(
    () => Gesture.Pan().onBegin(onBegin).onUpdate(onUpdate).onEnd(onEnd),
    [centerX, centerY],
  );
  return { bubbleX, bubbleY, panGesture };
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
