import { useMemo } from "react";
import {
  Gesture,
  GestureUpdateEvent,
  PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import { Presets } from "react-native-pulsar";
import {
  clamp,
  SharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  SPRING_FOLLOW_PROPS,
  SPRING_SNAP_PROPS,
  SPRING_TEXT_PROPS,
} from "../constants";

type UseBubbleGestureParams = {
  bubbleYPos: SharedValue<number>;
  bubbleXPos: SharedValue<number>;
  textMainYPos: SharedValue<number>;
  startY: SharedValue<number>;
  bubbleAtCenter: SharedValue<boolean>;
  canvasWidth: number;
  centerY: number;
  bottomY: number;
  centerTextY: number;
  bottomTextY: number;
};

export function useBubbleGesture({
  bubbleYPos,
  bubbleXPos,
  textMainYPos,
  startY,
  bubbleAtCenter,
  canvasWidth,
  centerY,
  bottomY,
  centerTextY,
  bottomTextY,
}: UseBubbleGestureParams) {
  const onBegin = () => {
    "worklet";
    Presets.keyboardMembrane();
    startY.value = bubbleYPos.value;
  };

  const onUpdate = (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
    "worklet";
    const targetY = clamp(startY.value + e.translationY, 0, bottomY);
    const targetX = canvasWidth / 2 + e.translationX;
    bubbleYPos.value = withSpring(targetY, SPRING_FOLLOW_PROPS);
    bubbleXPos.value = withSpring(targetX, SPRING_FOLLOW_PROPS);
    textMainYPos.value = clamp(
      startY.value + e.translationY,
      centerTextY,
      bottomTextY
    );
  };

  const onEnd = () => {
    "worklet";
    Presets.keyboardMembrane();
    const halfway = (centerY + bottomY) / 2;
    const snapTo = bubbleYPos.value < halfway ? centerY : bottomY;
    const snapTextTo = textMainYPos.value < halfway ? centerTextY : bottomTextY;
    bubbleYPos.value = withSpring(snapTo, SPRING_SNAP_PROPS);
    bubbleXPos.value = withSpring(canvasWidth / 2, SPRING_SNAP_PROPS);
    bubbleAtCenter.value = snapTo === centerY;
    textMainYPos.value = withSpring(snapTextTo, SPRING_TEXT_PROPS);
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(onBegin)
        .onUpdate(onUpdate)
        .onEnd(onEnd),
    [canvasWidth, centerY, bottomY, centerTextY, bottomTextY]
  );

  return gesture;
}
