/**
 * LiquidBubbles
 *
 * Divergence phase 7B (`temp/liquid-bubbles-divergence.md`): the shape is
 * now driven by real spring physics instead of the phase 5B static param
 * tail. `useBubbleShape` steps the three damped harmonic modes
 * (`hooks/bubbleModeMath.ts`) every frame on the UI runtime and writes a
 * double-buffered 12-float `iParams` buffer that `shaders.ts` reads —
 * replacing the phase 3/4 Verlet ball-physics hook, which is deleted this
 * phase along with `ballLayout.ts` and `hooks/ballPhysicsMath.ts` (history
 * keeps them; see commits 0b104e2…9214c8b).
 *
 * FLOW:
 * 1. `useBubblePanGesture` / `useBubblePinchGesture` own the anchor
 *    (`targetX`, `targetY` — the RAW finger position, not the spring-smoothed
 *    `bubbleX/bubbleY`), `scaledRadius`, `isActive`, and the gesture velocity
 *    (drag speed/angle drive mode 2, the 1→0 edge of `isActive` seeds the mode
 *    3/4 release kick off `velocityX/Y` — see `stepBubbleModes`).
 * 2. `useBubbleShape` consumes those SharedValues on a `useFrameCallback`
 *    and returns the live `paramBuffer` (12-float `iParams`) plus
 *    `bboxX/Y/W/H` — the bounding rect is computed inside `stepBubbleModes`
 *    from the current mode amplitudes, not hand-rolled here.
 * 3. `uniforms` only forwards `paramBuffer.value`, falling back to a zeroed
 *    12-float buffer for the one frame before `useBubbleShape`'s first
 *    `useFrameCallback` tick fires (no array literal, no spread, no math).
 * 4. A `<Rect>` sized from `bboxX/Y/W/H` is the ONLY thing shaded — never a
 *    full-screen `<Fill>`.
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

import { PARAM_FLOATS } from "./bubbleModes";
import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "./hooks/useBubbleGestures";
import { useBubbleShape } from "./hooks/useBubbleShape";
import { bubbleEffect } from "./shaders";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. Real numbers need a release build on device. */
const SHOW_FPS_OVERLAY = true;

/** Blob color (straight rgba, 0..1) fed to the shader's `iColor` uniform. */
const BUBBLE_COLOR: [number, number, number, number] = [0.35, 0.62, 1.0, 0.95];

/**
 * Pre-first-frame uniform fallback. `useBubbleShape`'s `paramBuffer` starts
 * as an empty `SharedValue<number[]>` and is only filled once
 * `useFrameCallback` ticks, so the derived `uniforms` value below falls back
 * to this zeroed `PARAM_FLOATS`-length buffer for that one frame — without
 * it Skia throws "Incorrect uniform size for: iParams". Module-scope
 * constant, mirrors the phase 4 ball-buffer fallback (see
 * `temp/liquid-bubbles-divergence.md`).
 */
const EMPTY_PARAM_BUFFER: number[] = new Array(PARAM_FLOATS).fill(0);

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

  // `targetX/targetY` are the RAW finger position, not the spring-smoothed
  // `bubbleX/bubbleY`. The follow spring trails a moving finger by
  // `(damping / stiffness) × velocity` = 0.1 s × velocity, which reads as lag
  // on a fast drag and also makes mode 2 under-read true speed while the
  // spring is still catching up. Anchoring on the raw target removes both; the
  // liquid character comes from the harmonic modes instead.
  const { targetX, targetY, isActive, velocityX, velocityY, panGesture } =
    useBubblePanGesture({ centerX, centerY });
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

  const { paramBuffer, bboxX, bboxY, bboxW, bboxH } = useBubbleShape({
    bubbleX: targetX,
    bubbleY: targetY,
    scaledRadius,
    isActive,
    velocityX,
    velocityY,
  });

  // Only forwards paramBuffer.value — no array literal, no spread, no math —
  // falling back to a zeroed buffer before the first physics frame.
  const uniforms = useDerivedValue(() => ({
    iParams:
      paramBuffer.value.length === PARAM_FLOATS
        ? paramBuffer.value
        : EMPTY_PARAM_BUFFER,
    iColor: BUBBLE_COLOR,
  }));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          <Rect x={bboxX} y={bboxY} width={bboxW} height={bboxH}>
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
