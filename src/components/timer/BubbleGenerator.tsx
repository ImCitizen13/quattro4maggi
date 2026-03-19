import { Group, Image, useImage } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import { imageArray } from "../../../assets/Bubbles/256/images.generated";

const IMAGE_SIZE_MIN = 65;
const IMAGES = imageArray;
const SPREAD_ANGLE = 70;
const BASE_SPEED = 0.00028; // progress per ms (~3.6s for full journey)
const VICINITY = 0.08; // fraction of width around center where bubbles go straight up
const BUBBLE_COUNT = 33;
const ANIMATION_START_DELAY = 600;
type Point = {
  x: number;
  y: number;
};

// Calculate destination point from the origin and the angle, moving upward (negative y)
function getP2(point: Point, angleDeg: number, length: number): Point {
  const angleRad = angleDeg * (Math.PI / 180);
  const x2 = point.x + length * Math.cos(angleRad);
  const y2 = point.y - length * Math.sin(angleRad);
  return { x: x2, y: y2 };
}

function randomPointInConeUniform(
  maxWidth: number,
  height: number, // e.g. 150 (the tip y position)
  angleDeg = SPREAD_ANGLE
): { p1: Point; p2: Point } {
  // Step 1 — P1 inside cone
  // y goes from height (tip) down to 0 (top)
  // Using pow(random, 2) to bias toward tip (center) instead of sqrt for uniform
  const t = Math.pow(Math.random(), 2);
  const y = height * (1 - t); // y=height at tip (center), y=0 at top

  const angleRad = (angleDeg / 2) * (Math.PI / 180);
  const spread = height * t * Math.tan(angleRad);
  const x = maxWidth / 2 - IMAGE_SIZE_MIN / 2 + (Math.random() * 2 - 1) * spread;

  const p1 = { x, y };

  // Step 2 — choose travel angle based on distance from center
  const centerX = maxWidth / 2;
  const vicinityThreshold = maxWidth * VICINITY;
  const dx = p1.x - centerX;

  // Add ±15° randomness to travel angle for organic spread
  const jitter = (Math.random() * 2 - 1) * 15;
  let travelAngle: number;
  if (Math.abs(dx) <= vicinityThreshold) {
    // Near center: mostly up with some random lean
    travelAngle = 90 + jitter;
  } else if (dx > 0) {
    // Right side: move up-right
    travelAngle = SPREAD_ANGLE + jitter * 0.5;
  } else {
    // Left side: move up-left
    travelAngle = 180 - SPREAD_ANGLE + jitter * 0.5;
  }

  // Compute line length so p2.y reaches -IMAGE_SIZE_MIN (fully off screen top)
  // getP2: y2 = p1.y - length * sin(angle), set y2=-IMAGE_SIZE_MIN
  // → length = (p1.y + IMAGE_SIZE_MIN) / sin(angle)
  const sinAngle = Math.sin(travelAngle * (Math.PI / 180));
  const lineLength =
    sinAngle > 0 ? (y + IMAGE_SIZE_MIN + 10) / sinAngle : y + IMAGE_SIZE_MIN;
  const p2 = getP2(p1, travelAngle, lineLength);

  return { p1, p2 };
}

export default function BubbleGenerator({
  lowerBounds,
  width,
  startAnimation,
}: {
  lowerBounds: number;
  width: number;
  startAnimation: SharedValue<boolean>;
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
  ];

  // Precompute random p1 (start) and p2 (destination) for each bubble
  const targets = useMemo(
    () => images.map(() => randomPointInConeUniform(width, lowerBounds)),
    []
  );

  // Animated x positions (initialized to p1.x)
  const xs = [
    useSharedValue(targets[0].p1.x),
    useSharedValue(targets[1].p1.x),
    useSharedValue(targets[2].p1.x),
    useSharedValue(targets[3].p1.x),
    useSharedValue(targets[4].p1.x),
    useSharedValue(targets[5].p1.x),
    useSharedValue(targets[6].p1.x),
    useSharedValue(targets[7].p1.x),
    useSharedValue(targets[8].p1.x),
    useSharedValue(targets[9].p1.x),
    useSharedValue(targets[10].p1.x),
    useSharedValue(targets[11].p1.x),
    useSharedValue(targets[12].p1.x),
    useSharedValue(targets[13].p1.x),
    useSharedValue(targets[14].p1.x),
    useSharedValue(targets[15].p1.x),
    useSharedValue(targets[16].p1.x),
    useSharedValue(targets[17].p1.x),
    useSharedValue(targets[18].p1.x),
    useSharedValue(targets[19].p1.x),
    useSharedValue(targets[20].p1.x),
    useSharedValue(targets[21].p1.x),
    useSharedValue(targets[22].p1.x),
    useSharedValue(targets[23].p1.x),
    useSharedValue(targets[24].p1.x),
    useSharedValue(targets[25].p1.x),
    useSharedValue(targets[26].p1.x),
    useSharedValue(targets[27].p1.x),
    useSharedValue(targets[28].p1.x),
    useSharedValue(targets[29].p1.x),
    useSharedValue(targets[30].p1.x),
    useSharedValue(targets[31].p1.x),
    useSharedValue(targets[32].p1.x),
    useSharedValue(targets[33].p1.x),
  ];

  // Animated y positions (initialized to p1.y)
  const ys = [
    useSharedValue(targets[0].p1.y),
    useSharedValue(targets[1].p1.y),
    useSharedValue(targets[2].p1.y),
    useSharedValue(targets[3].p1.y),
    useSharedValue(targets[4].p1.y),
    useSharedValue(targets[5].p1.y),
    useSharedValue(targets[6].p1.y),
    useSharedValue(targets[7].p1.y),
    useSharedValue(targets[8].p1.y),
    useSharedValue(targets[9].p1.y),
    useSharedValue(targets[10].p1.y),
    useSharedValue(targets[11].p1.y),
    useSharedValue(targets[12].p1.y),
    useSharedValue(targets[13].p1.y),
    useSharedValue(targets[14].p1.y),
    useSharedValue(targets[15].p1.y),
    useSharedValue(targets[16].p1.y),
    useSharedValue(targets[17].p1.y),
    useSharedValue(targets[18].p1.y),
    useSharedValue(targets[19].p1.y),
    useSharedValue(targets[20].p1.y),
    useSharedValue(targets[21].p1.y),
    useSharedValue(targets[22].p1.y),
    useSharedValue(targets[23].p1.y),
    useSharedValue(targets[24].p1.y),
    useSharedValue(targets[25].p1.y),
    useSharedValue(targets[26].p1.y),
    useSharedValue(targets[27].p1.y),
    useSharedValue(targets[28].p1.y),
    useSharedValue(targets[29].p1.y),
    useSharedValue(targets[30].p1.y),
    useSharedValue(targets[31].p1.y),
    useSharedValue(targets[32].p1.y),
    useSharedValue(targets[33].p1.y),
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
  ];

  // Staggered progress: each bubble starts at a different phase
  const progresses = [
    useSharedValue(0 / BUBBLE_COUNT),
    useSharedValue(1 / BUBBLE_COUNT),
    useSharedValue(2 / BUBBLE_COUNT),
    useSharedValue(3 / BUBBLE_COUNT),
    useSharedValue(4 / BUBBLE_COUNT),
    useSharedValue(5 / BUBBLE_COUNT),
    useSharedValue(6 / BUBBLE_COUNT),
    useSharedValue(7 / BUBBLE_COUNT),
    useSharedValue(8 / BUBBLE_COUNT),
    useSharedValue(9 / BUBBLE_COUNT),
    useSharedValue(10 / BUBBLE_COUNT),
    useSharedValue(11 / BUBBLE_COUNT),
    useSharedValue(12 / BUBBLE_COUNT),
    useSharedValue(13 / BUBBLE_COUNT),
    useSharedValue(14 / BUBBLE_COUNT),
    useSharedValue(15 / BUBBLE_COUNT),
    useSharedValue(16 / BUBBLE_COUNT),
    useSharedValue(17 / BUBBLE_COUNT),
    useSharedValue(18 / BUBBLE_COUNT),
    useSharedValue(19 / BUBBLE_COUNT),
    useSharedValue(20 / BUBBLE_COUNT),
    useSharedValue(21 / BUBBLE_COUNT),
    useSharedValue(22 / BUBBLE_COUNT),
    useSharedValue(23 / BUBBLE_COUNT),
    useSharedValue(24 / BUBBLE_COUNT),
    useSharedValue(25 / BUBBLE_COUNT),
    useSharedValue(26 / BUBBLE_COUNT),
    useSharedValue(27 / BUBBLE_COUNT),
    useSharedValue(28 / BUBBLE_COUNT),
    useSharedValue(29 / BUBBLE_COUNT),
    useSharedValue(30 / BUBBLE_COUNT),
    useSharedValue(31 / BUBBLE_COUNT),
    useSharedValue(32 / BUBBLE_COUNT),
  ];

  // Varied speeds per bubble (0.5x to 1.8x of BASE_SPEED, randomly assigned)
  const speeds = useMemo(
    () => targets.map(() => BASE_SPEED * (0.5 + Math.random() * 1.3)),
    []
  );

  // Staggered start delays per bubble (ms) so they don't all appear at once
  const staggerDelays = useMemo(
    () => targets.map((_, i) => i * 200),
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
  ];

  const isActive = useSharedValue(false);
  const elapsedSinceStart = useSharedValue(0);

  useAnimatedReaction(
    () => startAnimation.value,
    (val) => {
      isActive.value = val;
      if (val) {
        elapsedSinceStart.value = 0;
        // Reset all bubbles to scale 0 with staggered progress
        for (let i = 0; i < BUBBLE_COUNT; i++) {
          progresses[i].value = 0;
          bubbleScales[i].value = 0;
          xs[i].value = targets[i].p1.x;
          ys[i].value = targets[i].p1.y;
        }
      }
    }
  );

  useFrameCallback((frameInfo) => {
    "worklet";
    if (!isActive.value) return;
    const dt = frameInfo.timeSincePreviousFrame ?? 16;
    elapsedSinceStart.value += dt;

    // Wait for ANIMATION_START_DELAY before starting bubbles
    if (elapsedSinceStart.value < ANIMATION_START_DELAY) {
      return;
    }

    for (let i = 0; i < BUBBLE_COUNT; i++) {
      // Wait for this bubble's stagger delay before it starts moving
      const bubbleElapsed = elapsedSinceStart.value - ANIMATION_START_DELAY - staggerDelays[i];
      if (bubbleElapsed < 0) continue;

      progresses[i].value += speeds[i] * dt;

      if (progresses[i].value >= 1) {
        // Reset: snap back to p1 instantly, hidden (scale 0)
        progresses[i].value = 0;
        const { p1 } = targets[i];
        xs[i].value = p1.x;
        ys[i].value = p1.y;
        bubbleScales[i].value = 0;
        continue;
      }

      const p = progresses[i].value;
      const { p1, p2 } = targets[i];

      // Lerp position from p1 to p2
      xs[i].value = p1.x + (p2.x - p1.x) * p;
      ys[i].value = p1.y + (p2.y - p1.y) * p;

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
      {/* <Rect width={width} height={lowerBounds} color="white" /> */}
      {images.slice(0, BUBBLE_COUNT).map((img, idx) => {
        return (
          <Group
            key={idx}
            transform={bubbleTransforms[idx]}
            origin={{
              x: targets[idx].p1.x + IMAGE_SIZE_MIN / 2,
              y: targets[idx].p1.y + IMAGE_SIZE_MIN / 2,
            }}
          >
            <Image
              fit="contain"
              x={xs[idx]}
              y={ys[idx]}
              image={img}
              width={IMAGE_SIZE_MIN}
              height={IMAGE_SIZE_MIN}
            />
          </Group>
        );
      })}
    </Group>
  );
}

const styles = StyleSheet.create({});
