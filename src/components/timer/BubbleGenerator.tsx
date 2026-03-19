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

const IMAGE_SIZE_MIN = 80;
const IMAGES = imageArray;
const SPREAD_ANGLE = 60;
const BASE_SPEED = 0.00012; // progress per ms (~8.3s for full journey)
const VICINITY = 0.15; // fraction of width around center where bubbles go straight up
const BUBBLE_COUNT = 17;
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
  const t = Math.sqrt(Math.random());
  const y = height * (1 - t); // y=150 at tip, y=0 at top

  const angleRad = (angleDeg / 2) * (Math.PI / 180);
  const spread = height * t * Math.tan(angleRad);
  const x = maxWidth / 2 + (Math.random() * 2 - 1) * spread;

  const p1 = { x, y };

  // Step 2 — choose travel angle based on distance from center
  const centerX = maxWidth / 2;
  const vicinityThreshold = maxWidth * VICINITY;
  const dx = p1.x - centerX;

  let travelAngle: number;
  if (Math.abs(dx) <= vicinityThreshold) {
    // Near center: move straight up
    travelAngle = 90;
  } else if (dx > 0) {
    // Right side: move up-right
    travelAngle = SPREAD_ANGLE;
  } else {
    // Left side: move up-left
    travelAngle = 180 - SPREAD_ANGLE;
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
  ];

  // Varied speeds per bubble (±30% of BASE_SPEED)
  const speeds = useMemo(
    () => targets.map((_, i) => BASE_SPEED * (0.7 + 0.6 * (i / (BUBBLE_COUNT - 1)))),
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
  ];

  const isActive = useSharedValue(false);
  const elapsedSinceStart = useSharedValue(0);

  useAnimatedReaction(
    () => startAnimation.value,
    (val) => {
      isActive.value = val;
      if (val) {
        elapsedSinceStart.value = 0;
      }
    }
  );

  useFrameCallback((frameInfo) => {
    "worklet";
    if (!isActive.value) return;
    const dt = frameInfo.timeSincePreviousFrame ?? 16;

    // Wait for ANIMATION_START_DELAY before starting bubbles
    if (elapsedSinceStart.value < ANIMATION_START_DELAY) {
      elapsedSinceStart.value += dt;
      return;
    }

    for (let i = 0; i < BUBBLE_COUNT; i++) {
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
      {images.map((img, idx) => {
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
