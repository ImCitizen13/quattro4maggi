/**
 * LiquidBubbles
 *
 * The Phase 4+ replacement for `LiquidGlassBubble`'s `Circle` + `Image`
 * scaffold: a 12-ball Skia metaball cluster driven entirely by shared-value
 * physics. Pan moves the cluster's anchor, pinch scales its radius, and the
 * Verlet solver in `useBallPhysics` makes the rear balls lag the motion.
 *
 * FLOW:
 * 1. `useBubblePanGesture` / `useBubblePinchGesture` own the anchor
 *    (`bubbleX`, `bubbleY`) and `scaledRadius` shared values.
 * 2. `useBallPhysics` steps a 12-ball Verlet cluster off those shared values
 *    every frame (UI thread), producing a 48-float `ballBuffer` plus a
 *    bounding-box (`bboxX/Y/W/H`) sized to just the cluster + AA padding.
 * 3. A `<Rect>` sized to that bbox is the ONLY thing shaded — never a
 *    full-screen `<Fill>` — so the metaball `<Shader>` evaluates its field
 *    once per pixel over a few hundred points, not the whole screen.
 *
 * KEY FEATURES:
 * - Zero per-frame allocation on the JS/React side: `uniforms` is a
 *   `useDerivedValue` that only *forwards* `ballBuffer.value` — all the
 *   math lives in the physics worklet.
 * - `iSmooth = 0` here (Phase 4/2 hard union); Phase 5 raises it to blend
 *   the balls into one gooey blob.
 * - `SHOW_FPS_OVERLAY` mounts `FpsOverlay` for on-device perf sanity checks.
 */

import { Canvas, Rect, Shader } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue } from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";

import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "./hooks/useBubbleGestures";
import { useBallPhysics } from "./hooks/useBallPhysics";
import { BUFFER_LENGTH } from "./ballLayout";
import { metaballEffect } from "./shaders";

// ============================================================================
// Config
// ============================================================================

// `useBallPhysics` seeds `ballBuffer` as `[]` until the first frame callback
// runs, but the shader's `iBalls` uniform is a fixed-size float4[12] — Skia
// throws ("Incorrect uniform size for: iBalls. Expected 48 got 0") if it ever
// sees the empty initial value. This all-zero buffer (every ball's `active`
// flag is 0) stands in for that one frame so the field evaluates to nothing
// instead of crashing.
const EMPTY_BALL_BUFFER: number[] = new Array(BUFFER_LENGTH).fill(0);

/** Mount the on-screen FPS readout. Real numbers need a release build on device. */
const SHOW_FPS_OVERLAY = true;

/** Blob color (straight rgba, 0..1) fed to the shader's `iColor` uniform. */
const BUBBLE_COLOR: [number, number, number, number] = [0.35, 0.62, 1.0, 0.95];

// ============================================================================
// Types
// ============================================================================

export type LiquidBubblesProps = {
  /** Radius the cluster rests at before any interaction, in points. */
  restRadius?: number;
  /** Largest radius a pinch can reach, in points. */
  maxRadius?: number;
};

// ============================================================================
// Component
// ============================================================================

export function LiquidBubbles({
  restRadius = 40,
  maxRadius = 140,
}: LiquidBubblesProps) {
  const { width, height } = useWindowDimensions();
  const centerX = width / 2;
  const centerY = height / 2;

  // ============================================================================
  // Gestures
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

  // ============================================================================
  // Physics
  // ============================================================================

  const { ballBuffer, bboxX, bboxY, bboxW, bboxH } = useBallPhysics({
    bubbleX,
    bubbleY,
    scaledRadius,
  });

  // Only forwards `ballBuffer.value` — no math here, so this never becomes a
  // second per-frame cost center on top of the physics worklet. The length
  // check only ever trips on the pre-first-frame value; the physics worklet
  // always keeps `ballBuffer` at BUFFER_LENGTH afterwards.
  const uniforms = useDerivedValue(() => ({
    iBalls:
      ballBuffer.value.length === BUFFER_LENGTH
        ? ballBuffer.value
        : EMPTY_BALL_BUFFER,
    iSmooth: 0,
    iColor: BUBBLE_COLOR,
  }));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          <Rect x={bboxX} y={bboxY} width={bboxW} height={bboxH}>
            <Shader source={metaballEffect} uniforms={uniforms} />
          </Rect>
        </Canvas>
      </GestureDetector>
      {SHOW_FPS_OVERLAY && <FpsOverlay dark />}
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
  canvas: {
    backgroundColor: "#fff",
  },
});
