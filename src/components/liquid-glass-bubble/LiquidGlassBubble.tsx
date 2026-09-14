/**
 * LiquidGlassBubble
 *
 * A glassy bubble that grows while held, drifts with light physics, and pops
 * on release. Skia draws the bubble body and highlights; Reanimated shared
 * values drive growth, drift and the pop burst on the UI thread.
 *
 * FLOW:
 * 1. Component mounts → bubble sits at its rest radius, idle drift running
 * 2. Press and hold → radius grows with `withSpring`, wobble amplitude rises
 * 3. Release (or max radius reached) → pop: radius collapses, burst ring
 *    expands and fades, then the bubble respawns at rest radius
 *
 * KEY FEATURES:
 * - TODO: Skia canvas with refractive/glass shading for the bubble body
 * - TODO: Grow-on-hold driven by a single `radius` shared value
 * - TODO: Pop burst (expanding ring + fading droplets) on release
 * - TODO: Lightweight physics — buoyancy drift and wobble on the UI thread
 */

import { SPRING_BOUNCE_ANIMATION } from "@/lib/animations/constants";
import { Canvas, Circle, useImage, Image } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import  {
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "./hooks/useBubbleGestures";
import { image128Array } from "../../../assets/profile-images/images.generated";

// ============================================================================
// Types
// ============================================================================

export type LiquidGlassBubbleProps = {
  /** Radius the bubble rests at before any interaction, in points. */
  restRadius?: number;
  /** Radius at which the bubble pops on its own, in points. */
  maxRadius?: number;
  /** Fired when the bubble pops. */
  onPop?: () => void;
};

// ============================================================================
// Component
// ============================================================================

export function LiquidGlassBubble({
  restRadius = 40,
  maxRadius = 140,
}: LiquidGlassBubbleProps) {
  // Drives both the Skia bubble geometry and the pop burst.
  const radius = useSharedValue(restRadius);
  // Let's test this
  const { width, height } = useWindowDimensions();
  const centerX = width / 2;
  const centerY = height / 2;

  const profileImages = image128Array;
  const profileImage = useImage(profileImages[0]);

  // ============================================================================
  // Pan Gesture interaction
  // ============================================================================

  const { bubbleX, bubbleY, panGesture } = useBubblePanGesture({
    centerX,
    centerY,
  });
  const { scaledRadius, pinchGesture } = useBubblePinchGesture({
    restRadius,
    maxRadius,
  });

  // Simultaneous, not Race: Pan activates on a few points of movement, so in a
  // race it wins the moment two fingers slide and Pinch never gets to fire.
  const compositeGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture],
  );
  const imageSize = restRadius
  const imagePositionX = useDerivedValue<number>(() => { return bubbleX.value - imageSize / 2 })
  const imagePositionY = useDerivedValue<number>(() => { return bubbleY.value - imageSize / 2 })

  return (
    <View style={styles.container}>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={[styles.placeholder, { width: width, height: height }]}>
          <Circle cx={bubbleX} cy={bubbleY} r={scaledRadius} color="black">
            {profileImage && (
              <Image
                fit="fill"
                x={imagePositionX}
                y={imagePositionY}
                width={imageSize}
                height={imageSize}
                image={profileImage}
              />
            )}
          </Circle>
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
    backgroundColor: "white",
  },
  placeholder: {
    backgroundColor: "#fff",
  },
});
