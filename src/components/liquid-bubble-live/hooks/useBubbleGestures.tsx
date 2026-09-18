// ============================================================================
// Gestures interactions
// ============================================================================

import { SPRING_FOLLOW_PROPS } from "@/components/wabi-and-more/constants";
import { SPRING_BOUNCE_ANIMATION, SPRING_CONFIG } from "@/lib/animations/constants";
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
  SharedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type UseBubblPanGestureParams = {
  centerX: number;
  centerY: number;
  /**
   * Per-bubble inertia multiplier (see `bubbleModes.ts` → "Per-bubble
   * inertia and strength"), scaling the follow spring's `mass` — a heavier
   * bubble lags the finger more. Optional so existing callers keep today's
   * mass unchanged.
   */
  inertia?: SharedValue<number>;
};

type UseBubblPanGestureReturn = {
  /**
   * Spring-smoothed anchor. Kept for the older `LiquidGlassBubble` /
   * `LiquidGlassSingleBubble` screens, where the drawn circle itself is what
   * needs to look springy. NOT what drives the harmonic bubble — see
   * `targetX`/`targetY`.
   */
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  /**
   * Raw, unsmoothed finger position. `SPRING_FOLLOW_PROPS` is
   * `stiffness 300 / damping 30`, and a spring tracking a constant-velocity
   * target trails it by `(damping / stiffness) × velocity` = 0.1 s × velocity
   * — 200 pt behind at a 2000 pt/s drag. `LiquidBubbles` anchors on these
   * instead so the bubble stays under the finger and ALL of its liquid
   * character comes from the harmonic modes, not from a lagging center.
   */
  targetX: SharedValue<number>;
  targetY: SharedValue<number>;
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
  inertia,
}: UseBubblPanGestureParams): UseBubblPanGestureReturn {
  const bubbleX = useSharedValue<number>(centerX);
  const bubbleY = useSharedValue<number>(centerY);
  const targetX = useSharedValue<number>(centerX);
  const targetY = useSharedValue<number>(centerY);
  const isActive = useSharedValue<number>(0);
  const velocityX = useSharedValue<number>(0);
  const velocityY = useSharedValue<number>(0);

  const onBegin = (e: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    isActive.value = 1;
    targetX.value = e.x;
    targetY.value = e.y;
    velocityX.value = e.velocityX;
    velocityY.value = e.velocityY;
  };

  const onUpdate = (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    // One config object per gesture event (not per physics frame), reused for
    // both X and Y — a heavier bubble (inertia > 1) gets a heavier follow
    // spring, so it lags the finger more. This allocates a small object per
    // event, off the per-frame physics path; `withSpring` itself allocates
    // per call anyway.
    const cfg = {
      ...SPRING_FOLLOW_PROPS,
      mass: SPRING_FOLLOW_PROPS.mass * (inertia ? Math.max(inertia.value, MULT_MIN) : 1),
    };
    bubbleX.value = withSpring(e.x, cfg);
    bubbleY.value = withSpring(e.y, cfg);
    targetX.value = e.x;
    targetY.value = e.y;
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
