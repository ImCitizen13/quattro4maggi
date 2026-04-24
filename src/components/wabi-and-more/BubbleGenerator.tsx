import { Group, Image, useImage } from "@shopify/react-native-skia";
import { Accelerometer } from "expo-sensors";
import React, { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import { Settings } from 'react-native-pulsar';
import {
  SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { imageArray } from "../../../assets/Bubbles/256/images.generated";

const IMAGE_SIZE_MIN = 70;
const IMAGES = imageArray;
const SPREAD_ANGLE = 45;
const BASE_SPEED = 0.00028; // progress per ms (~3.6s for full journey)
const VICINITY = 0.08; // fraction of width around center where bubbles go straight up
const BUBBLE_COUNT = 46;
const ANIMATION_START_DELAY = 600;
Settings.enableSound(false);

// Generate random cone point — works both on JS thread and as worklet
function randomConePoint(
  maxWidth: number,
  height: number,
  angleDeg = SPREAD_ANGLE,
  offsetX = 0,
  offsetY = 0,
): { p1x: number; p1y: number; p2x: number; p2y: number } {
  "worklet";
  const t = Math.pow(Math.random(), 2);
  const y = height * (1 - t) + offsetY;

  const angleRad = (angleDeg / 2) * (Math.PI / 180);
  const spread = height * t * Math.tan(angleRad);
  // Center the image on the screen midpoint + offset, then apply symmetric spread
  const centerX = maxWidth / 2 + offsetX;
  const x = centerX - IMAGE_SIZE_MIN / 2 + (Math.random() * 2 - 1) * spread;

  const vicinityThreshold = maxWidth * VICINITY;
  // dx measures from image center (not top-left) to screen center
  const dx = (x + IMAGE_SIZE_MIN / 2) - centerX;

  const jitter = (Math.random() * 2 - 1) * 15;
  let travelAngle: number;
  if (Math.abs(dx) <= vicinityThreshold) {
    travelAngle = 90 + jitter;
  } else if (dx > 0) {
    travelAngle = SPREAD_ANGLE + jitter * 0.5;
  } else {
    travelAngle = 180 - SPREAD_ANGLE + jitter * 0.5;
  }

  const sinAngle = Math.sin(travelAngle * (Math.PI / 180));
  const lineLength =
    sinAngle > 0 ? (y + IMAGE_SIZE_MIN + 10) / sinAngle : y + IMAGE_SIZE_MIN;
  const travelRad = travelAngle * (Math.PI / 180);
  const p2x = x + lineLength * Math.cos(travelRad);
  const p2y = y - lineLength * Math.sin(travelRad);

  return { p1x: x, p1y: y, p2x, p2y };
}

export default function BubbleGenerator({
  lowerBounds,
  width,
  startAnimation,
  bubbleRadius,
}: {
  lowerBounds: number;
  width: number;
  startAnimation: SharedValue<boolean>;
  bubbleRadius: SharedValue<number>;
}) {
  const images = [
    useImage(IMAGES[0]),
    useImage(IMAGES[1]),
    useImage(IMAGES[2]),
    useImage(IMAGES[3]),
    useImage(IMAGES[4]),
    useImage(IMAGES[5]),
    useImage(IMAGES[6]),
    useImage(IMAGES[7]),
    useImage(IMAGES[8]),
    useImage(IMAGES[9]),
    useImage(IMAGES[10]),
    useImage(IMAGES[11]),
    useImage(IMAGES[12]),
    useImage(IMAGES[13]),
    useImage(IMAGES[14]),
    useImage(IMAGES[15]),
    useImage(IMAGES[16]),
    useImage(IMAGES[17]),
    useImage(IMAGES[18]),
    useImage(IMAGES[19]),
    useImage(IMAGES[20]),
    useImage(IMAGES[21]),
    useImage(IMAGES[22]),
    useImage(IMAGES[23]),
    useImage(IMAGES[24]),
    useImage(IMAGES[25]),
    useImage(IMAGES[26]),
    useImage(IMAGES[27]),
    useImage(IMAGES[28]),
    useImage(IMAGES[29]),
    useImage(IMAGES[30]),
    useImage(IMAGES[31]),
    useImage(IMAGES[32]),
    useImage(IMAGES[33]),
    useImage(IMAGES[34]),
    useImage(IMAGES[35]),
    useImage(IMAGES[36]),
    useImage(IMAGES[37]),
    useImage(IMAGES[38]),
    useImage(IMAGES[39]),
    useImage(IMAGES[40]),
    useImage(IMAGES[41]),
    useImage(IMAGES[42]),
    useImage(IMAGES[43]),
    useImage(IMAGES[44]),
    useImage(IMAGES[45]),
  ];

  // Accelerometer-driven cone offset
  const accelX = useSharedValue(0);
  const accelY = useSharedValue(0);
  const smoothAccelX = useSharedValue(0);
  const smoothAccelY = useSharedValue(0);

  useEffect(() => {
    let subscription: ReturnType<typeof Accelerometer.addListener> | null = null;

    Accelerometer.isAvailableAsync().then((available) => {
      if (!available) return;
      Accelerometer.setUpdateInterval(16);
      subscription = Accelerometer.addListener(({ x, y }) => {
        accelX.value = x;
        accelY.value = -y;
      });
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  // Debug: cone origin position for red dot
  const coneOriginX = useDerivedValue(() =>
    width / 2 + smoothAccelX.value * bubbleRadius.value
  );
  const coneOriginY = useDerivedValue(() =>
    lowerBounds + Math.min(-smoothAccelY.value * bubbleRadius.value, 0)
  );

  // Initial targets computed on JS thread
  const init = useMemo(
    () => Array.from({ length: 46 }, () => randomConePoint(width, lowerBounds)),
    []
  );

  // Target endpoints as shared values (re-randomized on reset in worklet)
  const p1xs = [
    useSharedValue(init[0].p1x),
    useSharedValue(init[1].p1x),
    useSharedValue(init[2].p1x),
    useSharedValue(init[3].p1x),
    useSharedValue(init[4].p1x),
    useSharedValue(init[5].p1x),
    useSharedValue(init[6].p1x),
    useSharedValue(init[7].p1x),
    useSharedValue(init[8].p1x),
    useSharedValue(init[9].p1x),
    useSharedValue(init[10].p1x),
    useSharedValue(init[11].p1x),
    useSharedValue(init[12].p1x),
    useSharedValue(init[13].p1x),
    useSharedValue(init[14].p1x),
    useSharedValue(init[15].p1x),
    useSharedValue(init[16].p1x),
    useSharedValue(init[17].p1x),
    useSharedValue(init[18].p1x),
    useSharedValue(init[19].p1x),
    useSharedValue(init[20].p1x),
    useSharedValue(init[21].p1x),
    useSharedValue(init[22].p1x),
    useSharedValue(init[23].p1x),
    useSharedValue(init[24].p1x),
    useSharedValue(init[25].p1x),
    useSharedValue(init[26].p1x),
    useSharedValue(init[27].p1x),
    useSharedValue(init[28].p1x),
    useSharedValue(init[29].p1x),
    useSharedValue(init[30].p1x),
    useSharedValue(init[31].p1x),
    useSharedValue(init[32].p1x),
    useSharedValue(init[33].p1x),
    useSharedValue(init[34].p1x),
    useSharedValue(init[35].p1x),
    useSharedValue(init[36].p1x),
    useSharedValue(init[37].p1x),
    useSharedValue(init[38].p1x),
    useSharedValue(init[39].p1x),
    useSharedValue(init[40].p1x),
    useSharedValue(init[41].p1x),
    useSharedValue(init[42].p1x),
    useSharedValue(init[43].p1x),
    useSharedValue(init[44].p1x),
    useSharedValue(init[45].p1x),
  ];
  const p1ys = [
    useSharedValue(init[0].p1y),
    useSharedValue(init[1].p1y),
    useSharedValue(init[2].p1y),
    useSharedValue(init[3].p1y),
    useSharedValue(init[4].p1y),
    useSharedValue(init[5].p1y),
    useSharedValue(init[6].p1y),
    useSharedValue(init[7].p1y),
    useSharedValue(init[8].p1y),
    useSharedValue(init[9].p1y),
    useSharedValue(init[10].p1y),
    useSharedValue(init[11].p1y),
    useSharedValue(init[12].p1y),
    useSharedValue(init[13].p1y),
    useSharedValue(init[14].p1y),
    useSharedValue(init[15].p1y),
    useSharedValue(init[16].p1y),
    useSharedValue(init[17].p1y),
    useSharedValue(init[18].p1y),
    useSharedValue(init[19].p1y),
    useSharedValue(init[20].p1y),
    useSharedValue(init[21].p1y),
    useSharedValue(init[22].p1y),
    useSharedValue(init[23].p1y),
    useSharedValue(init[24].p1y),
    useSharedValue(init[25].p1y),
    useSharedValue(init[26].p1y),
    useSharedValue(init[27].p1y),
    useSharedValue(init[28].p1y),
    useSharedValue(init[29].p1y),
    useSharedValue(init[30].p1y),
    useSharedValue(init[31].p1y),
    useSharedValue(init[32].p1y),
    useSharedValue(init[33].p1y),
    useSharedValue(init[34].p1y),
    useSharedValue(init[35].p1y),
    useSharedValue(init[36].p1y),
    useSharedValue(init[37].p1y),
    useSharedValue(init[38].p1y),
    useSharedValue(init[39].p1y),
    useSharedValue(init[40].p1y),
    useSharedValue(init[41].p1y),
    useSharedValue(init[42].p1y),
    useSharedValue(init[43].p1y),
    useSharedValue(init[44].p1y),
    useSharedValue(init[45].p1y),
  ];
  const p2xs = [
    useSharedValue(init[0].p2x),
    useSharedValue(init[1].p2x),
    useSharedValue(init[2].p2x),
    useSharedValue(init[3].p2x),
    useSharedValue(init[4].p2x),
    useSharedValue(init[5].p2x),
    useSharedValue(init[6].p2x),
    useSharedValue(init[7].p2x),
    useSharedValue(init[8].p2x),
    useSharedValue(init[9].p2x),
    useSharedValue(init[10].p2x),
    useSharedValue(init[11].p2x),
    useSharedValue(init[12].p2x),
    useSharedValue(init[13].p2x),
    useSharedValue(init[14].p2x),
    useSharedValue(init[15].p2x),
    useSharedValue(init[16].p2x),
    useSharedValue(init[17].p2x),
    useSharedValue(init[18].p2x),
    useSharedValue(init[19].p2x),
    useSharedValue(init[20].p2x),
    useSharedValue(init[21].p2x),
    useSharedValue(init[22].p2x),
    useSharedValue(init[23].p2x),
    useSharedValue(init[24].p2x),
    useSharedValue(init[25].p2x),
    useSharedValue(init[26].p2x),
    useSharedValue(init[27].p2x),
    useSharedValue(init[28].p2x),
    useSharedValue(init[29].p2x),
    useSharedValue(init[30].p2x),
    useSharedValue(init[31].p2x),
    useSharedValue(init[32].p2x),
    useSharedValue(init[33].p2x),
    useSharedValue(init[34].p2x),
    useSharedValue(init[35].p2x),
    useSharedValue(init[36].p2x),
    useSharedValue(init[37].p2x),
    useSharedValue(init[38].p2x),
    useSharedValue(init[39].p2x),
    useSharedValue(init[40].p2x),
    useSharedValue(init[41].p2x),
    useSharedValue(init[42].p2x),
    useSharedValue(init[43].p2x),
    useSharedValue(init[44].p2x),
    useSharedValue(init[45].p2x),
  ];
  const p2ys = [
    useSharedValue(init[0].p2y),
    useSharedValue(init[1].p2y),
    useSharedValue(init[2].p2y),
    useSharedValue(init[3].p2y),
    useSharedValue(init[4].p2y),
    useSharedValue(init[5].p2y),
    useSharedValue(init[6].p2y),
    useSharedValue(init[7].p2y),
    useSharedValue(init[8].p2y),
    useSharedValue(init[9].p2y),
    useSharedValue(init[10].p2y),
    useSharedValue(init[11].p2y),
    useSharedValue(init[12].p2y),
    useSharedValue(init[13].p2y),
    useSharedValue(init[14].p2y),
    useSharedValue(init[15].p2y),
    useSharedValue(init[16].p2y),
    useSharedValue(init[17].p2y),
    useSharedValue(init[18].p2y),
    useSharedValue(init[19].p2y),
    useSharedValue(init[20].p2y),
    useSharedValue(init[21].p2y),
    useSharedValue(init[22].p2y),
    useSharedValue(init[23].p2y),
    useSharedValue(init[24].p2y),
    useSharedValue(init[25].p2y),
    useSharedValue(init[26].p2y),
    useSharedValue(init[27].p2y),
    useSharedValue(init[28].p2y),
    useSharedValue(init[29].p2y),
    useSharedValue(init[30].p2y),
    useSharedValue(init[31].p2y),
    useSharedValue(init[32].p2y),
    useSharedValue(init[33].p2y),
    useSharedValue(init[34].p2y),
    useSharedValue(init[35].p2y),
    useSharedValue(init[36].p2y),
    useSharedValue(init[37].p2y),
    useSharedValue(init[38].p2y),
    useSharedValue(init[39].p2y),
    useSharedValue(init[40].p2y),
    useSharedValue(init[41].p2y),
    useSharedValue(init[42].p2y),
    useSharedValue(init[43].p2y),
    useSharedValue(init[44].p2y),
    useSharedValue(init[45].p2y),
  ];

  // Animated x/y positions (initialized to p1)
  const xs = [
    useSharedValue(init[0].p1x),
    useSharedValue(init[1].p1x),
    useSharedValue(init[2].p1x),
    useSharedValue(init[3].p1x),
    useSharedValue(init[4].p1x),
    useSharedValue(init[5].p1x),
    useSharedValue(init[6].p1x),
    useSharedValue(init[7].p1x),
    useSharedValue(init[8].p1x),
    useSharedValue(init[9].p1x),
    useSharedValue(init[10].p1x),
    useSharedValue(init[11].p1x),
    useSharedValue(init[12].p1x),
    useSharedValue(init[13].p1x),
    useSharedValue(init[14].p1x),
    useSharedValue(init[15].p1x),
    useSharedValue(init[16].p1x),
    useSharedValue(init[17].p1x),
    useSharedValue(init[18].p1x),
    useSharedValue(init[19].p1x),
    useSharedValue(init[20].p1x),
    useSharedValue(init[21].p1x),
    useSharedValue(init[22].p1x),
    useSharedValue(init[23].p1x),
    useSharedValue(init[24].p1x),
    useSharedValue(init[25].p1x),
    useSharedValue(init[26].p1x),
    useSharedValue(init[27].p1x),
    useSharedValue(init[28].p1x),
    useSharedValue(init[29].p1x),
    useSharedValue(init[30].p1x),
    useSharedValue(init[31].p1x),
    useSharedValue(init[32].p1x),
    useSharedValue(init[33].p1x),
    useSharedValue(init[34].p1x),
    useSharedValue(init[35].p1x),
    useSharedValue(init[36].p1x),
    useSharedValue(init[37].p1x),
    useSharedValue(init[38].p1x),
    useSharedValue(init[39].p1x),
    useSharedValue(init[40].p1x),
    useSharedValue(init[41].p1x),
    useSharedValue(init[42].p1x),
    useSharedValue(init[43].p1x),
    useSharedValue(init[44].p1x),
    useSharedValue(init[45].p1x),
  ];
  const ys = [
    useSharedValue(init[0].p1y),
    useSharedValue(init[1].p1y),
    useSharedValue(init[2].p1y),
    useSharedValue(init[3].p1y),
    useSharedValue(init[4].p1y),
    useSharedValue(init[5].p1y),
    useSharedValue(init[6].p1y),
    useSharedValue(init[7].p1y),
    useSharedValue(init[8].p1y),
    useSharedValue(init[9].p1y),
    useSharedValue(init[10].p1y),
    useSharedValue(init[11].p1y),
    useSharedValue(init[12].p1y),
    useSharedValue(init[13].p1y),
    useSharedValue(init[14].p1y),
    useSharedValue(init[15].p1y),
    useSharedValue(init[16].p1y),
    useSharedValue(init[17].p1y),
    useSharedValue(init[18].p1y),
    useSharedValue(init[19].p1y),
    useSharedValue(init[20].p1y),
    useSharedValue(init[21].p1y),
    useSharedValue(init[22].p1y),
    useSharedValue(init[23].p1y),
    useSharedValue(init[24].p1y),
    useSharedValue(init[25].p1y),
    useSharedValue(init[26].p1y),
    useSharedValue(init[27].p1y),
    useSharedValue(init[28].p1y),
    useSharedValue(init[29].p1y),
    useSharedValue(init[30].p1y),
    useSharedValue(init[31].p1y),
    useSharedValue(init[32].p1y),
    useSharedValue(init[33].p1y),
    useSharedValue(init[34].p1y),
    useSharedValue(init[35].p1y),
    useSharedValue(init[36].p1y),
    useSharedValue(init[37].p1y),
    useSharedValue(init[38].p1y),
    useSharedValue(init[39].p1y),
    useSharedValue(init[40].p1y),
    useSharedValue(init[41].p1y),
    useSharedValue(init[42].p1y),
    useSharedValue(init[43].p1y),
    useSharedValue(init[44].p1y),
    useSharedValue(init[45].p1y),
  ];

  const bubbleScales = [
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
  ];

  // Staggered progress: each bubble starts at a different phase
  const progresses = [
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
  ];

  // Varied speeds per bubble (0.5x to 1.8x of BASE_SPEED, randomly assigned)
  const speeds = useMemo(
    () =>
      Array.from(
        { length: BUBBLE_COUNT },
        () => BASE_SPEED * (0.5 + Math.random() * 1.3)
      ),
    []
  );

  // Staggered start delays per bubble (ms) so they don't all appear at once
  const staggerDelays = useMemo(
    () => Array.from({ length: BUBBLE_COUNT }, (_, i) => i * 200),
    []
  );

  const bubbleTransforms = [
    useDerivedValue(() => [{ scale: bubbleScales[0].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[1].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[2].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[3].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[4].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[5].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[6].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[7].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[8].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[9].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[10].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[11].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[12].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[13].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[14].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[15].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[16].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[17].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[18].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[19].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[20].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[21].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[22].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[23].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[24].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[25].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[26].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[27].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[28].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[29].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[30].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[31].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[32].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[33].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[34].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[35].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[36].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[37].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[38].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[39].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[40].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[41].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[42].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[43].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[44].value }]),
    useDerivedValue(() => [{ scale: bubbleScales[45].value }]),
  ];

  // Scale transform origins — use shared values so they update on re-randomize
  const originXs = [
    useDerivedValue(() => p1xs[0].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[1].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[2].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[3].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[4].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[5].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[6].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[7].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[8].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[9].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[10].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[11].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[12].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[13].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[14].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[15].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[16].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[17].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[18].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[19].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[20].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[21].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[22].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[23].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[24].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[25].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[26].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[27].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[28].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[29].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[30].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[31].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[32].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[33].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[34].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[35].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[36].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[37].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[38].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[39].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[40].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[41].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[42].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[43].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[44].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1xs[45].value + IMAGE_SIZE_MIN / 2),
  ];
  const originYs = [
    useDerivedValue(() => p1ys[0].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[1].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[2].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[3].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[4].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[5].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[6].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[7].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[8].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[9].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[10].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[11].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[12].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[13].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[14].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[15].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[16].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[17].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[18].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[19].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[20].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[21].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[22].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[23].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[24].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[25].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[26].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[27].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[28].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[29].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[30].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[31].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[32].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[33].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[34].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[35].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[36].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[37].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[38].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[39].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[40].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[41].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[42].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[43].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[44].value + IMAGE_SIZE_MIN / 2),
    useDerivedValue(() => p1ys[45].value + IMAGE_SIZE_MIN / 2),
  ];

  // Pre-create origin objects to avoid calling useDerivedValue inside map
  const bubbleOrigins = [
    useDerivedValue(() => ({ x: originXs[0].value, y: originYs[0].value })),
    useDerivedValue(() => ({ x: originXs[1].value, y: originYs[1].value })),
    useDerivedValue(() => ({ x: originXs[2].value, y: originYs[2].value })),
    useDerivedValue(() => ({ x: originXs[3].value, y: originYs[3].value })),
    useDerivedValue(() => ({ x: originXs[4].value, y: originYs[4].value })),
    useDerivedValue(() => ({ x: originXs[5].value, y: originYs[5].value })),
    useDerivedValue(() => ({ x: originXs[6].value, y: originYs[6].value })),
    useDerivedValue(() => ({ x: originXs[7].value, y: originYs[7].value })),
    useDerivedValue(() => ({ x: originXs[8].value, y: originYs[8].value })),
    useDerivedValue(() => ({ x: originXs[9].value, y: originYs[9].value })),
    useDerivedValue(() => ({ x: originXs[10].value, y: originYs[10].value })),
    useDerivedValue(() => ({ x: originXs[11].value, y: originYs[11].value })),
    useDerivedValue(() => ({ x: originXs[12].value, y: originYs[12].value })),
    useDerivedValue(() => ({ x: originXs[13].value, y: originYs[13].value })),
    useDerivedValue(() => ({ x: originXs[14].value, y: originYs[14].value })),
    useDerivedValue(() => ({ x: originXs[15].value, y: originYs[15].value })),
    useDerivedValue(() => ({ x: originXs[16].value, y: originYs[16].value })),
    useDerivedValue(() => ({ x: originXs[17].value, y: originYs[17].value })),
    useDerivedValue(() => ({ x: originXs[18].value, y: originYs[18].value })),
    useDerivedValue(() => ({ x: originXs[19].value, y: originYs[19].value })),
    useDerivedValue(() => ({ x: originXs[20].value, y: originYs[20].value })),
    useDerivedValue(() => ({ x: originXs[21].value, y: originYs[21].value })),
    useDerivedValue(() => ({ x: originXs[22].value, y: originYs[22].value })),
    useDerivedValue(() => ({ x: originXs[23].value, y: originYs[23].value })),
    useDerivedValue(() => ({ x: originXs[24].value, y: originYs[24].value })),
    useDerivedValue(() => ({ x: originXs[25].value, y: originYs[25].value })),
    useDerivedValue(() => ({ x: originXs[26].value, y: originYs[26].value })),
    useDerivedValue(() => ({ x: originXs[27].value, y: originYs[27].value })),
    useDerivedValue(() => ({ x: originXs[28].value, y: originYs[28].value })),
    useDerivedValue(() => ({ x: originXs[29].value, y: originYs[29].value })),
    useDerivedValue(() => ({ x: originXs[30].value, y: originYs[30].value })),
    useDerivedValue(() => ({ x: originXs[31].value, y: originYs[31].value })),
    useDerivedValue(() => ({ x: originXs[32].value, y: originYs[32].value })),
    useDerivedValue(() => ({ x: originXs[33].value, y: originYs[33].value })),
    useDerivedValue(() => ({ x: originXs[34].value, y: originYs[34].value })),
    useDerivedValue(() => ({ x: originXs[35].value, y: originYs[35].value })),
    useDerivedValue(() => ({ x: originXs[36].value, y: originYs[36].value })),
    useDerivedValue(() => ({ x: originXs[37].value, y: originYs[37].value })),
    useDerivedValue(() => ({ x: originXs[38].value, y: originYs[38].value })),
    useDerivedValue(() => ({ x: originXs[39].value, y: originYs[39].value })),
    useDerivedValue(() => ({ x: originXs[40].value, y: originYs[40].value })),
    useDerivedValue(() => ({ x: originXs[41].value, y: originYs[41].value })),
    useDerivedValue(() => ({ x: originXs[42].value, y: originYs[42].value })),
    useDerivedValue(() => ({ x: originXs[43].value, y: originYs[43].value })),
    useDerivedValue(() => ({ x: originXs[44].value, y: originYs[44].value })),
    useDerivedValue(() => ({ x: originXs[45].value, y: originYs[45].value })),
  ];

  const isActive = useSharedValue(false);
  const elapsedSinceStart = useSharedValue(0);

  useAnimatedReaction(
    () => startAnimation.value,
    (val, prev) => {
      // Only react to actual changes, not re-mount triggers
      if (val === prev) return;
      isActive.value = val;
      if (val) {
        elapsedSinceStart.value = 0;
        // Reset all bubbles to scale 0
        for (let i = 0; i < BUBBLE_COUNT; i++) {
          progresses[i].value = 0;
          bubbleScales[i].value = 0;
          xs[i].value = p1xs[i].value;
          ys[i].value = p1ys[i].value;
        }
      }
    }
  );

  const frameCount = useSharedValue(0);

  useFrameCallback((frameInfo) => {
    "worklet";
    frameCount.value += 1;
    // Skip the first frames where shader compilation/layout causes large dt spikes
    if (frameCount.value < 15) return;

    // Clamp dt to avoid jumps from frame spikes
    const dt = Math.min(frameInfo.timeSincePreviousFrame ?? 16, 32);

    // Smooth accelerometer readings (low-pass filter)
    const SMOOTHING = 0.08;
    smoothAccelX.value += (accelX.value - smoothAccelX.value) * SMOOTHING;
    smoothAccelY.value += (accelY.value - smoothAccelY.value) * SMOOTHING;

    // Compute clamped cone offset from smoothed values
    const r = bubbleRadius.value;
    const offX = Math.max(-r, Math.min(smoothAccelX.value * r, r));
    const offY = Math.max(-r, Math.min(-smoothAccelY.value * r, 0));

    if (isActive.value) {
      elapsedSinceStart.value += dt;
    }

    // Wait for ANIMATION_START_DELAY before starting bubbles
    if (elapsedSinceStart.value < ANIMATION_START_DELAY) {
      return;
    }

    for (let i = 0; i < BUBBLE_COUNT; i++) {
      // Skip bubbles that already finished and won't respawn
      if (progresses[i].value >= 1) continue;
      // Skip bubbles not yet started (stagger)
      if (progresses[i].value === 0 && !isActive.value) continue;

      // Wait for this bubble's stagger delay before it starts moving
      const bubbleElapsed =
        elapsedSinceStart.value - ANIMATION_START_DELAY - staggerDelays[i];
      if (bubbleElapsed < 0) continue;

      progresses[i].value += speeds[i] * dt;

      if (progresses[i].value >= 1) {
        // Haptic 
        
        if (isActive.value) {
          // Re-randomize target position from shifted cone origin
          const newTarget = randomConePoint(width, lowerBounds, SPREAD_ANGLE, offX, offY);
          p1xs[i].value = newTarget.p1x;
          p1ys[i].value = newTarget.p1y;
          p2xs[i].value = newTarget.p2x;
          p2ys[i].value = newTarget.p2y;
          // Reset to new start position
          progresses[i].value = 0;
          xs[i].value = newTarget.p1x;
          ys[i].value = newTarget.p1y;
          bubbleScales[i].value = 0;
        } else {
          // Not active — just hide and stop, don't respawn
          progresses[i].value = 1;
          bubbleScales[i].value = 0;
        }
        continue;
      }

      const p = progresses[i].value;

      // Lerp position from p1 to p2, offset by smoothed accelerometer
      xs[i].value = p1xs[i].value + (p2xs[i].value - p1xs[i].value) * p + offX;
      ys[i].value = p1ys[i].value + (p2ys[i].value - p1ys[i].value) * p + offY;

      // Scale: fade in (0→0.15), full (0.15→1.0)
      if (p < 0.15) {
        bubbleScales[i].value = p / 0.15;
      } else {
        bubbleScales[i].value = 1;
      }
    }
  });

  return (
    <Group>
      {images.slice(0, BUBBLE_COUNT).map((img, idx) => {
        return (
          <Group
            key={idx}
            transform={bubbleTransforms[idx]}
            origin={bubbleOrigins[idx]}
          >
            <Image
              fit="fill"
              x={xs[idx]}
              y={ys[idx]}
              image={img}
              width={IMAGE_SIZE_MIN}
              height={IMAGE_SIZE_MIN}
            />
          </Group>
        );
      })}
      {/* Debug: red dot at cone origin */}
      {/* <Circle cx={coneOriginX} cy={coneOriginY} r={6} color="red" /> */}
    </Group>
  );
}

const styles = StyleSheet.create({});
