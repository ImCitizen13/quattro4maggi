import { Group, Image, useImage } from "@shopify/react-native-skia";
import React, { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import { useDerivedValue, useSharedValue, withSpring } from "react-native-reanimated";
import { imageArray } from "../../../assets/Bubbles/256/images.generated";

const BOTTOM_BOUNDS = 160;
const WIDTH = 100;
const NUMBER_OF_CIRCLES = 17;
const IMAGE_SIZE_MAX = 64;
const IMAGE_SIZE_MIN = 80;
const DURATIONS = [3000, 5000];
const IMAGES = imageArray;
const SPREAD_ANGLE = 60;
const VICINITY = 0.15; // fraction of width around center where bubbles go straight up
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
  const lineLength = sinAngle > 0 ? (y + IMAGE_SIZE_MIN + 10) / sinAngle : y + IMAGE_SIZE_MIN;
  const p2 = getP2(p1, travelAngle, lineLength);

  return { p1, p2 };
}

export default function BubbleGenerator({
  lowerBounds,
  width,
}: {
  lowerBounds: number;
  width: number;
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
    useImage(IMAGES[16])];

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
    useSharedValue(0),

  ];

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

  // Animate bubble from p1 to p2
  const startAnimation = (index: number) => {
    const { p2 } = targets[index];
    const springConfig = { duration: DURATIONS[1], dampingRatio: 1 };
    bubbleScales[index].value = withSpring(1, springConfig);
    xs[index].value = withSpring(p2.x, springConfig);
    ys[index].value = withSpring(p2.y, springConfig);
  };

  useEffect(() => {
    startAnimation(0);
    startAnimation(1);
    startAnimation(2);
    startAnimation(3);
    startAnimation(4);
    startAnimation(5);
    startAnimation(6);
    startAnimation(7);
    startAnimation(8);
    startAnimation(9);
    startAnimation(10);
    startAnimation(11);
    startAnimation(12);
    startAnimation(13);
    startAnimation(14);
    startAnimation(15);
    startAnimation(16);
  }, []);

  return (
    <Group>
      {/* <Rect width={width} height={lowerBounds} color="white" /> */}
      {images.map((img, idx) => {
        return (
          <Group
            key={idx}
            transform={bubbleTransforms[idx]}
            origin={{ x: targets[idx].p1.x + IMAGE_SIZE_MIN / 2, y: targets[idx].p1.y + IMAGE_SIZE_MIN / 2 }}
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
