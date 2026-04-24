/**
 * RippleEffect
 *
 * A touch-reactive water ripple shader effect using Skia RuntimeShader.
 * Tap anywhere on the image to trigger a bouncy ripple that expands
 * outward and reflects from edges.
 *
 * FLOW:
 * 1. Component mounts -> load image, initialize clock
 * 2. User taps -> capture tap position and start time
 * 3. Shader calculates wave propagation from tap point
 * 4. Reflected waves bounce back from edges
 * 5. Animation decays naturally over time
 *
 * KEY FEATURES:
 * - Bouncy water ripple with outward and reflected waves
 * - Touch position normalized for aspect-correct propagation
 * - Exponential decay for natural motion
 * - GPU-accelerated via Skia RuntimeShader
 */

import {
  Canvas,
  DataSourceParam,
  Group,
  Image,
  Paint,
  rect,
  rrect,
  RuntimeShader,
  useClock,
  useImage,
} from "@shopify/react-native-skia";
import React from "react";
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";

import { BouncyRippleShader } from "./shaders";

// ============================================================================
// Types
// ============================================================================

export type RippleEffectProps = {
  /** Image source to apply ripple effect on */
  imageSource?: DataSourceParam;
  /** Border radius for the container */
  borderRadius?: number;
  /** Height as percentage of screen (0-1) */
  heightRatio?: number;
  /** Width as percentage of screen (0-1) */
  widthRatio?: number;
};

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_IMAGE = require("@/assets/images/SkiaImageShaders/man.png");
const DEFAULT_BORDER_RADIUS = 15;
const DEFAULT_HEIGHT_RATIO = 0.65;
const DEFAULT_WIDTH_RATIO = 0.9;

// ============================================================================
// Component
// ============================================================================

export function RippleEffect({
  imageSource = DEFAULT_IMAGE,
  borderRadius = DEFAULT_BORDER_RADIUS,
  heightRatio = DEFAULT_HEIGHT_RATIO,
  widthRatio = DEFAULT_WIDTH_RATIO,
}: RippleEffectProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const canvasWidth = screenWidth * widthRatio;
  const canvasHeight = screenHeight * heightRatio;

  // Load image
  const image = useImage(imageSource);

  // Animation state
  const clock = useClock();
  const center = useSharedValue([0.5, 0.5]);
  const tapStartTime = useSharedValue(-1);

  // Clip path for rounded corners
  const imageRect = rect(0, 0, canvasWidth, canvasHeight);
  const roundedClip = rrect(imageRect, borderRadius, borderRadius);

  // Tap gesture handler
  const tapGesture = Gesture.Tap().onEnd((e) => {
    const normalizedX = Math.max(0, Math.min(1, e.x / canvasWidth));
    const normalizedY = Math.max(0, Math.min(1, e.y / canvasHeight));

    center.value = [normalizedX, normalizedY];
    tapStartTime.value = clock.value;
  });

  // Shader uniforms (updated each frame)
  const uniforms = useDerivedValue(() => ({
    u_resolution: [canvasWidth, canvasHeight],
    u_center: center.value,
    u_time: clock.value / 1000,
    u_tapTime: tapStartTime.value / 1000,
  }));

  return (
    <View style={styles.container}>
      {!image && <ActivityIndicator size="large" color="#fff" style={styles.loader} />}

      <GestureDetector gesture={tapGesture}>
        <Canvas style={[styles.canvas, { width: canvasWidth, height: canvasHeight }]}>
          {image && (
            <Group
              clip={roundedClip}
              layer={
                <Paint>
                  <RuntimeShader source={BouncyRippleShader} uniforms={uniforms} />
                </Paint>
              }
            >
              <Image
                image={image}
                x={0}
                y={0}
                width={canvasWidth}
                height={canvasHeight}
                fit="cover"
              />
            </Group>
          )}
        </Canvas>
      </GestureDetector>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    // backgroundColor: "#1a1a1a",
  },
  canvas: {
    borderRadius: DEFAULT_BORDER_RADIUS,
  },
  loader: {
    position: "absolute",
  },
});
