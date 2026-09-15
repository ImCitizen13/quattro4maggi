/**
 * LiquidBubbleLive
 *
 * Divergence phase 12B (`temp/liquid-bubbles-divergence.md` → "Refraction
 * source"): the same harmonic bubble as `liquid-glass-bubble/LiquidBubbles`,
 * refracting LIVE content instead of a still image. That demo is untouched and
 * stays as the one-pass, cheapest-available version.
 *
 * WHY THIS IS A SEPARATE DEMO, NOT A FLAG
 * The two differ in pass structure, not in a prop. The still-image version is:
 *     pass 1: draw Rect, shader samples a child ImageShader → store
 * — one pass, the photo already a texture. This one is:
 *     pass 1: draw the background                        → STORE (forced:
 *             the backdrop must be samplable)
 *     pass 2: bubble shader reads that snapshot          → store
 *     pass 3: composite the layer back onto the canvas   → store
 * Pass 3 exists only because Skia's `saveLayer` is a TEMPORARY it has to paste
 * back; there is no "keep this layer between frames" in Skia. Clipping bounds
 * how much AREA each pass touches, but not how many passes there are, and on a
 * tile-based GPU each break is real main-memory traffic. That is the price of
 * live content on this route, and it is why the doc lists a 2-pass
 * WebGPU/TypeGPU variant as the alternative if these three ever prove too many.
 *
 * FLOW:
 * 1. Gestures and physics are IMPORTED from the still-image demo, not
 *    reimplemented: `useBubblePanGesture` / `useBubblePinchGesture` own the
 *    anchor and radius, `useBubbleShape` steps `stepBubbleModes` on the UI
 *    runtime and publishes the double-buffered 12-float `iParams` buffer plus
 *    the shape bbox. The mode state is renderer-independent — nothing in it
 *    knows whether the thing behind the bubble is a photo or a live scene.
 * 2. A `<Fill>` draws the live background (`backgroundShaders.ts`) FIRST, so
 *    it is what Skia snapshots as the backdrop. It has to live inside this
 *    same `<Canvas>`: sibling RN views are composited by CoreAnimation only
 *    after Skia has finished, so at shader time there is nothing behind the
 *    Canvas to read.
 * 3. `<BackdropFilter>` runs the bubble effect over that snapshot. Skia binds
 *    the snapshot to the effect's single `uniform shader` slot; there is no
 *    `<ImageShader>` child here and therefore no `tx/ty="clamp"` guardrail.
 * 4. `clipRect` is the shape bbox grown by `REFRACT + CLIP_SLACK`. This is the
 *    ONE place where the still-image demo's `BBOX_PAD` reasoning inverts — see
 *    `liveConfig.ts`. A clip governs which pixels are READABLE, and the rim
 *    samples outward; the draw rect governs where alpha is non-zero, and that
 *    never leaves `r + 0.75`.
 *
 * KEY FEATURES:
 * - The 12-float physics buffer is forwarded to the shader VERBATIM. The
 *   backdrop filter was expected to need a PixelRatio conversion (a runtime
 *   shader image filter is usually handed the layer's device space); measuring
 *   it showed this one runs in absolute canvas POINTS, so there is nothing to
 *   rescale and nothing allocated per frame. See `shaders.ts` for the
 *   measurement and how to redo it.
 * - Outside the bubble the filter returns alpha 0, and the layer composites
 *   src-over, so the clip rect never reads as a visible box over the
 *   background.
 * - `LIVE_REFRACT` (18 pt) is a demo-local override, not the still-image
 *   demo's `REFRACT` (9). That 9 exists to stop the rim sampling past the edge
 *   of a small `<ImageShader>` rect; the backdrop is the whole canvas, so the
 *   bend can be twice as strong without smearing.
 * - `SHOW_FPS_OVERLAY` mounts `FpsOverlay`. Note the simulator caps at 60 Hz,
 *   which pins `j120` at 100% and makes it carry no signal — real numbers need
 *   a release build on a 120 Hz device.
 */

import {
  BackdropFilter,
  Canvas,
  Fill,
  RuntimeShader,
  Shader,
  rect,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue } from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";

import { FILM, PARAM_FLOATS } from "../liquid-glass-bubble/bubbleModes";
import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "../liquid-glass-bubble/hooks/useBubbleGestures";
import { useBubbleShape } from "../liquid-glass-bubble/hooks/useBubbleShape";

import { backgroundEffect } from "./backgroundShaders";
import { useClock } from "./hooks/useClock";
import {
  BG_BAND_DIR_X,
  BG_BAND_DIR_Y,
  BG_GRID_DENSITY,
  BG_GRID_DRIFT,
  BG_GRID_STRENGTH,
  BG_GRID_WIDTH,
  BG_SCROLL_RATE,
  CLIP_SLACK,
  LIVE_REFRACT,
} from "./liveConfig";
import { liveBubbleEffect } from "./shaders";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. Real numbers need a release build on device. */
const SHOW_FPS_OVERLAY = true;

/**
 * `iColor`: rgb = tint hue, **a = tint WEIGHT, not opacity**. Same semantics
 * and same value as the still-image demo, so the two can be compared directly:
 * the only intended visual difference is what is being refracted.
 */
const BUBBLE_COLOR: [number, number, number, number] = [0.85, 0.93, 1.0, 0.35];

/**
 * Pre-first-frame uniform fallback. `useBubbleShape`'s `paramBuffer` starts as
 * an empty `SharedValue<number[]>` and is only filled once `useFrameCallback`
 * ticks; without a correctly-sized stand-in for that one frame Skia throws
 * "Incorrect uniform size for: iParams".
 */
const EMPTY_PARAM_BUFFER: number[] = new Array(PARAM_FLOATS).fill(0);

// ============================================================================
// Types
// ============================================================================

export type LiquidBubbleLiveProps = {
  /** Radius the bubble rests at before any interaction, in points. */
  restRadius?: number;
  /** Largest radius a pinch can reach, in points. */
  maxRadius?: number;
};

// ============================================================================
// Component
// ============================================================================

export function LiquidBubbleLive({
  restRadius = 60,
  maxRadius = 160,
}: LiquidBubbleLiveProps) {
  const { width, height } = useWindowDimensions();
  const centerX = width / 2;
  const centerY = height / 2;

  // ==========================================================================
  // Gestures
  // ==========================================================================

  // Anchored on the spring-smoothed `bubbleX/bubbleY`, matching the
  // still-image demo: the follow spring trails a moving finger by
  // `(damping / stiffness) × velocity` = 0.1 s × velocity, and that trailing is
  // wanted (see the ANCHOR note in `temp/liquid-bubbles-divergence.md`).
  const { bubbleX, bubbleY, isActive, velocityX, velocityY, panGesture } =
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

  // ==========================================================================
  // Physics (imported wholesale — the mode state is renderer-independent)
  // ==========================================================================

  const { paramBuffer, bboxX, bboxY, bboxW, bboxH } = useBubbleShape({
    bubbleX,
    bubbleY,
    scaledRadius,
    isActive,
    velocityX,
    velocityY,
  });

  // Only forwards `paramBuffer.value` and constants — no spread, no math, no
  // allocation. The buffer is in POINTS and the filter runs in points, so
  // there is nothing to rescale (see the coordinate-space note in
  // `shaders.ts`, which is a measurement, not an assumption).
  const uniforms = useDerivedValue(() => ({
    iParams:
      paramBuffer.value.length === PARAM_FLOATS
        ? paramBuffer.value
        : EMPTY_PARAM_BUFFER,
    iColor: BUBBLE_COLOR,
    iRefract: LIVE_REFRACT,
    iFilm: FILM,
  }));

  // ==========================================================================
  // Live background
  // ==========================================================================

  const time = useClock();

  const backgroundUniforms = useDerivedValue(() => ({
    iResolution: [width, height],
    iTime: time.value,
    iBand: [BG_SCROLL_RATE, BG_BAND_DIR_X, BG_BAND_DIR_Y, BG_GRID_DENSITY],
    iGrid: [BG_GRID_DRIFT, BG_GRID_WIDTH, BG_GRID_STRENGTH, 0],
  }));

  // ==========================================================================
  // Backdrop clip
  // ==========================================================================

  // The shape bbox (AA-padded only) grown by the refraction reach. Padding the
  // DRAW region by the refraction offset would be the mistake the 8B follow-up
  // corrected; padding the READ region by it is mandatory, because the
  // backdrop snapshot stops at this rect and returns transparent past it.
  const clipRect = useDerivedValue(() => {
    const pad = LIVE_REFRACT + CLIP_SLACK;
    return rect(
      bboxX.value - pad,
      bboxY.value - pad,
      bboxW.value + 2 * pad,
      bboxH.value + 2 * pad,
    );
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          {/* Drawn first — this IS the backdrop the bubble samples. */}
          <Fill>
            <Shader source={backgroundEffect} uniforms={backgroundUniforms} />
          </Fill>

          <BackdropFilter
            clip={clipRect}
            filter={
              <RuntimeShader source={liveBubbleEffect} uniforms={uniforms} />
            }
          />
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
    backgroundColor: "#1a1a1a",
  },
  canvas: {
    backgroundColor: "#1a1a1a",
  },
});
