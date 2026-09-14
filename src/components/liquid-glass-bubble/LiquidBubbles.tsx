/**
 * LiquidBubbles
 *
 * Divergence phase 5B (`temp/liquid-bubbles-divergence.md`): the metaball
 * cluster is replaced by ONE harmonic bubble shape — `bubbleEffect` in
 * `shaders.ts` evaluates `r(θ)` once per pixel instead of looping 12 balls.
 * This phase wires the new shader up with a TEMPORARY static param tail
 * (mode amplitudes/phases fixed) so the shape can be seen on-device before
 * phase 6B drives it from real spring physics.
 *
 * FLOW:
 * 1. `useBubblePanGesture` / `useBubblePinchGesture` own the anchor
 *    (`bubbleX`, `bubbleY`) and `scaledRadius` shared values, same as before.
 * 2. `useBallPhysics` is still mounted (its `useFrameCallback` keeps running)
 *    but its output is UNUSED — phase 7B replaces it with `useBubbleShape`
 *    and removes it. Keeping it mounted now avoids touching the physics
 *    hook wiring twice.
 * 3. `uniforms` forwards `bubbleX`/`bubbleY`/`scaledRadius` as `cx, cy, R`
 *    plus a hardcoded mode tail (`STATIC_A2/PHI2/...`) into `iParams[3]`.
 * 4. A `<Rect>` sized to `R · (1 + |a2| + |a3| + |a4|) + BBOX_PAD` is the
 *    ONLY thing shaded — never a full-screen `<Fill>`.
 *
 * KEY FEATURES:
 * - `SHOW_FPS_OVERLAY` mounts `FpsOverlay` for on-device perf sanity checks.
 */

import { Canvas, Rect, Shader } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue } from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";

import { BBOX_PAD } from "./bubbleModes";
import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "./hooks/useBubbleGestures";
import { useBallPhysics } from "./hooks/useBallPhysics";
import { bubbleEffect } from "./shaders";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. Real numbers need a release build on device. */
const SHOW_FPS_OVERLAY = true;

/** Blob color (straight rgba, 0..1) fed to the shader's `iColor` uniform. */
const BUBBLE_COLOR: [number, number, number, number] = [0.35, 0.62, 1.0, 0.95];

// Phase 5B TEMPORARY static mode tail — replaced by real spring output in
// phase 6B/7B. `[a2, phi2, a3, phi3, a4, phi4, filmPhase, unused]`; amplitude
// magnitudes stay well under `A_MAX` (0.15) from `bubbleModes.ts`.
const STATIC_A2 = 0.08;
const STATIC_PHI2 = 0.6;
const STATIC_A3 = 0.04;
const STATIC_PHI3 = 1.2;
const STATIC_A4 = 0.03;
const STATIC_PHI4 = 2.0;

/** `R · (1 + |a2| + |a3| + |a4|)` factor for the static tail above. */
const STATIC_AMP_SUM = STATIC_A2 + STATIC_A3 + STATIC_A4;

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

  // Phase 5B: mounted but UNUSED — its `useFrameCallback` still runs, but
  // nothing below reads its return value. Phase 7B swaps this for
  // `useBubbleShape` and removes this call entirely.
  useBallPhysics({ bubbleX, bubbleY, scaledRadius });

  // Phase 5B TEMPORARY: forwards the live anchor/radius as cx, cy, R and
  // appends the hardcoded static mode tail from the module scope above —
  // no per-frame math beyond the shared-value reads.
  const uniforms = useDerivedValue(() => ({
    iParams: [
      bubbleX.value,
      bubbleY.value,
      scaledRadius.value,
      0,
      STATIC_A2,
      STATIC_PHI2,
      STATIC_A3,
      STATIC_PHI3,
      STATIC_A4,
      STATIC_PHI4,
      0,
      0,
    ],
    iColor: BUBBLE_COLOR,
  }));

  // Bounding Rect: `R · (1 + |a2| + |a3| + |a4|) + BBOX_PAD`, per the divergence
  // doc's bbox formula. The amplitude sum is static this phase, so only the
  // live anchor/radius drive these — a static Rect isn't required.
  const bboxX = useDerivedValue(
    () => bubbleX.value - (scaledRadius.value * (1 + STATIC_AMP_SUM) + BBOX_PAD),
  );
  const bboxY = useDerivedValue(
    () => bubbleY.value - (scaledRadius.value * (1 + STATIC_AMP_SUM) + BBOX_PAD),
  );
  const bboxSize = useDerivedValue(
    () => 2 * (scaledRadius.value * (1 + STATIC_AMP_SUM) + BBOX_PAD),
  );

  return (
    <View style={styles.container}>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          <Rect x={bboxX} y={bboxY} width={bboxSize} height={bboxSize}>
            <Shader source={bubbleEffect} uniforms={uniforms} />
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
