/**
 * LiquidBubbles
 *
 * Divergence phase 8B (`temp/liquid-bubbles-divergence.md`): the harmonic
 * shape from 5B–7B now refracts a real image. `useBubbleShape` steps the
 * three damped harmonic modes (`hooks/bubbleModeMath.ts`) every frame on the
 * UI runtime and writes a double-buffered 12-float `iParams` buffer that
 * `shaders.ts` reads; this phase adds the optics uniforms (`iRefract`,
 * `iFilm`) and the child `<ImageShader>` the shader samples as `iImage`.
 *
 * FLOW:
 * 1. `useBubblePanGesture` / `useBubblePinchGesture` own the anchor
 *    (`bubbleX`, `bubbleY` — the SPRING-SMOOTHED follow position, so the
 *    bubble trails a fast drag by design), `scaledRadius`, `isActive`, and the
 *    gesture velocity (drag speed/angle drive mode 2, the 1→0 edge of
 *    `isActive` seeds the mode 3/4 release kick off `velocityX/Y` — see
 *    `stepBubbleModes`).
 * 2. `useBubbleShape` consumes those SharedValues on a `useFrameCallback`
 *    and returns the live `paramBuffer` (12-float `iParams`) plus
 *    `bboxX/Y/W/H` — the bounding rect is computed inside `stepBubbleModes`
 *    from the current mode amplitudes, not hand-rolled here.
 * 3. `uniforms` only forwards `paramBuffer.value` plus the two constant
 *    optics scalars, falling back to a zeroed 12-float buffer for the one
 *    frame before `useBubbleShape`'s first `useFrameCallback` tick fires.
 * 4. `imageRect` maps the profile image onto the bubble: centered on the SAME
 *    anchor the shape uses (`bubbleX/bubbleY`) and sized
 *    `2·R·IMAGE_RECT_SCALE`. The two must never read different anchors or the
 *    image slides out from under the rim.
 * 5. A `<Rect>` sized from `bboxX/Y/W/H` is the ONLY thing shaded — never a
 *    full-screen `<Fill>`. `BBOX_PAD` is AA feather only (2 pt): refraction
 *    moves which texel is sampled, not where alpha is non-zero.
 *
 * KEY FEATURES:
 * - The image arrives as a child `<ImageShader>` feeding `uniform shader
 *   iImage`, sampled analytically in the shader — deliberately NOT a
 *   `<Group layer>` / offscreen snapshot / backdrop filter, both of which
 *   rasterize at logical resolution and pixelate the rim (see
 *   `.claude/rules/webgpu-shaders.md` and the Skia notes in project memory).
 * - `tx`/`ty` are `clamp`, not the `decal` default: the rim samples up to
 *   `iRefract` pt OUTSIDE the image rect, and decal would return transparent
 *   there and punch a hole in the rim.
 * - `SHOW_FPS_OVERLAY` mounts `FpsOverlay` for on-device perf sanity checks.
 */

import {
  Canvas,
  ImageShader,
  Rect,
  Shader,
  rect,
  useImage,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue } from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";

import { image128Array } from "../../../assets/profile-images/images.generated";

import { FILM, PARAM_FLOATS, REFRACT } from "./bubbleModes";
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

/**
 * `iColor`: rgb = tint hue, **a = tint WEIGHT, not opacity**.
 *
 * The semantics changed in phase 8B. Up to 7B the bubble was a flat blob, so
 * `iColor.rgb` WAS the body color and `.a` its alpha — hence the old
 * `[0.35, 0.62, 1.0, 0.95]`. Now the body is the refracted image and the
 * shader does `mix(img.rgb, img.rgb * iColor.rgb, iColor.a)`, so the old
 * value would multiply a saturated blue over the whole disk at 95% weight and
 * destroy the "clear sharp center" this phase is gated on. A faint cool tint
 * at low weight leaves the center reading as the image itself. Phase 9B owns
 * the final value.
 */
const BUBBLE_COLOR: [number, number, number, number] = [0.85, 0.93, 1.0, 0.35];

/**
 * The image rect is `2 · R · IMAGE_RECT_SCALE` on a side, centered on the
 * anchor: 10% larger than the bubble so `fit="cover"` has a little margin
 * around the rim to refract into.
 */
const IMAGE_RECT_SCALE = 1.1;

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

  // Anchored on the spring-smoothed `bubbleX/bubbleY`, restoring the pre-7B-
  // follow-up behaviour on request. The follow spring trails a moving finger
  // by `(damping / stiffness) × velocity` = 0.1 s × velocity, so the bubble
  // lags behind a fast drag — that trailing IS the effect being asked for
  // here. Side effect to keep in mind: mode 2 under-reads true speed during a
  // flick's acceleration phase, because its drive comes from this anchor's
  // position delta. The raw `targetX/targetY` are still exported by the
  // gesture hook and unused here.
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

  // ============================================================================
  // Physics
  // ============================================================================

  const { paramBuffer, bboxX, bboxY, bboxW, bboxH } = useBubbleShape({
    bubbleX,
    bubbleY,
    scaledRadius,
    isActive,
    velocityX,
    velocityY,
  });

  // Only forwards paramBuffer.value and the two constant optics scalars — no
  // spread, no math — falling back to a zeroed buffer before the first
  // physics frame. The fallback covers every float uniform: `iRefract` and
  // `iFilm` are plain constants, so only `iParams` needs a stand-in, and it
  // must be exactly PARAM_FLOATS long or Skia throws "Incorrect uniform size
  // for: iParams".
  const uniforms = useDerivedValue(() => ({
    iParams:
      paramBuffer.value.length === PARAM_FLOATS
        ? paramBuffer.value
        : EMPTY_PARAM_BUFFER,
    iColor: BUBBLE_COLOR,
    iRefract: REFRACT,
    iFilm: FILM,
  }));

  // ============================================================================
  // Refraction source
  // ============================================================================

  const image = useImage(image128Array[0]);

  // Centered on `bubbleX/bubbleY` — the SAME anchor `useBubbleShape` gets.
  // These two must always read the same SharedValue pair: if the image used
  // the raw target while the shape used the sprung anchor, the image would
  // lead the rim by the full trailing distance on a fast drag.
  const imageRect = useDerivedValue(() => {
    const half = scaledRadius.value * IMAGE_RECT_SCALE;
    const side = 2 * half;
    return rect(bubbleX.value - half, bubbleY.value - half, side, side);
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          {/*
            Gated on `image`: Skia's `declareImageShader` bails out when
            `image` is null, which would leave the runtime effect's `iImage`
            child unbound. The asset is bundled, so this is one or two frames.
          */}
          {image !== null && (
            <Rect x={bboxX} y={bboxY} width={bboxW} height={bboxH}>
              <Shader source={bubbleEffect} uniforms={uniforms}>
                <ImageShader
                  image={image}
                  fit="cover"
                  rect={imageRect}
                  tx="clamp"
                  ty="clamp"
                />
              </Shader>
            </Rect>
          )}
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
