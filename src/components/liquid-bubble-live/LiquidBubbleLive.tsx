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
 * - `LIVE_REFRACT` (18 pt) is a demo-local starting `iRefract`, not the
 *   still-image demo's `REFRACT` (9); it is now live-tunable via
 *   `BubbleTuningPanel`, so the clip pads by the current slider value, not the
 *   constant. That 9 exists to stop the rim sampling past the edge of a small
 *   `<ImageShader>` rect; the backdrop is the whole canvas, so the bend can be
 *   twice as strong without smearing.
 * - `SHOW_FPS_OVERLAY` mounts `FpsOverlay`. Note the simulator caps at 60 Hz,
 *   which pins `j120` at 100% and makes it carry no signal — real numbers need
 *   a release build on a 120 Hz device.
 * - `SHOW_TUNING_PANEL` mounts `BubbleTuningPanel` (Wobble + the 7 optics
 *   levers), all `SharedValue`s written on the UI thread with no React
 *   re-render per tick.
 */

import {
  BackdropFilter,
  Canvas,
  Fill,
  Image,
  RuntimeShader,
  rect,
  useImage,
  Text as SKText,
  useFont,
  Skia,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";

import { WOBBLE_DEFAULT } from "../liquid-glass-bubble/bubbleModes";
import { BubbleTuningPanel } from "../liquid-glass-bubble/BubbleTuningPanel";
import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "../liquid-glass-bubble/hooks/useBubbleGestures";
import { useBubbleOptics } from "../liquid-glass-bubble/hooks/useBubbleOptics";
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
import { BoldonseRegular } from "@/assets/fonts/getFonts";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. Real numbers need a release build on device. */
const SHOW_FPS_OVERLAY = true;

/** Mount `BubbleTuningPanel` (Wobble + the 7 live optics levers). */
const SHOW_TUNING_PANEL = true;

/**
 * `iColor` tint hue, rgb 0..1. The tint WEIGHT (`iColor.a`) is no longer a
 * constant here — it comes from the live `tint` lever in `useBubbleOptics`,
 * seeded from `bubbleModes.ts`'s `TINT` default.
 */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

/**
 * Upper bound of the tuning panel's Refract slider, pt. The backdrop is the
 * whole canvas (not a small `<ImageShader>` rect), so a higher cap is cheap
 * in sampling correctness — but `clipRect` pads by the live refract value, so
 * a higher slider still means a larger snapshot to fill.
 */
const LIVE_REFRACT_SLIDER_MAX = 40;

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

  // Master wobble visibility knob (see `bubbleModes.ts` → "Wobble
  // visibility"), live-tunable from the slider below with no React re-render.
  const wobble = useSharedValue(WOBBLE_DEFAULT);

  const { paramBuffer, bboxX, bboxY, bboxW, bboxH } = useBubbleShape({
    bubbleX,
    bubbleY,
    scaledRadius,
    isActive,
    velocityX,
    velocityY,
    wobble,
  });

  // `paramBuffer` is in POINTS and the filter runs in points, so there is
  // nothing to rescale (see the coordinate-space note in `shaders.ts`, which
  // is a measurement, not an assumption). The optics levers (refract, film,
  // tint, rim, falloff) are live `SharedValue`s written by `BubbleTuningPanel`.
  const { optics, defaults, uniforms } = useBubbleOptics({
    paramBuffer,
    tintColor: BUBBLE_TINT,
    refract: LIVE_REFRACT,
  });

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

  // The shape bbox (AA-padded only) grown by every outward sample plus the
  // halo draw. Padding the DRAW region by the refraction offset would be the
  // mistake the 8B follow-up corrected; padding the READ region by it is
  // mandatory, because the backdrop snapshot stops at this rect and returns
  // transparent past it. Lens only pushes the read outward when negative
  // (pincushion — positive/magnify samples inward); dispersion samples up to
  // ±R·dispersion along the radial on either side of the base sample; and the
  // halo draws up to R·haloSpread outside the rim — the clip has to bound
  // both what the shader reads and what it draws.
  const clipRect = useDerivedValue(() => {
    // Refract is live (tunable via BubbleTuningPanel), not the constant
    // `LIVE_REFRACT` — padding by the stale constant would under-pad the
    // moment the slider is raised, biting a transparent ring around the rim.
    const R = Math.max(bboxW.value, bboxH.value) / 2;
    const pad =
      optics.refract.value +
      R *
        (Math.max(0, -optics.lens.value) +
          optics.dispersion.value +
          // Halo off (opacity 0) draws nothing, so don't pay its fill.
          (optics.haloOpacity.value !== 0 ? optics.haloSpread.value : 0)) +
      CLIP_SLACK;
    return rect(
      bboxX.value - pad,
      bboxY.value - pad,
      bboxW.value + 2 * pad,
      bboxH.value + 2 * pad,
    );
  });
  const fontSize = 64;
  const font = useFont(BoldonseRegular.font, fontSize);
  const label = "Hello World";
  // Skia text `y` is the baseline, not the top — `measureText` bounds are
  // baseline-relative (bounds.y is negative), so centering has to subtract
  // the bounds origin, not just half the width/height.
  const textBounds = font ? font.measureText(label) : null;
  const textX = textBounds ? centerX - textBounds.x - textBounds.width / 2 : 0;
  const textY = textBounds
    ? centerY - textBounds.y - textBounds.height / 2
    : 0;

  const imagePath = require("../../../assets/liquid-glass-bubble/refract-image.png");
  const image = useImage(imagePath);
  // 1. Wait for the image to resolve
  if (!image) return null;
  // 2. Read the image's raw dimensions
  const imageSize = width * 0.9; //image.width();

  // 3. Center it on the same point the bubble rests at
  const imageX = centerX - imageSize / 2;
  const imageY = centerY - imageSize / 2;

  return (
    <View style={styles.container}>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          {/* Drawn first — this IS the backdrop the bubble samples. */}

          <Fill color="#ffffff" />
          {/*{font && <SKText
            x={textX}
            y={textY}
            text={label}
            font={font}
            color={"black"}
          />}*/}
          {image && (
            // <Circle r={imgWidth} cx={x}cy={y} color={"red"} />}
            <Image
              image={image}
              fit="cover"
              // rect={imageRect}
              width={imageSize}
              height={imageSize}
              x={imageX}
              y={imageY}
              // tx="clamp"
              // ty="clamp"
            />
          )}

          <BackdropFilter
            clip={clipRect}
            filter={
              <RuntimeShader source={liveBubbleEffect} uniforms={uniforms} />
            }
          />
        </Canvas>
      </GestureDetector>
      {SHOW_FPS_OVERLAY && <FpsOverlay dark />}
      {/* After the GestureDetector, not inside it, so the bubble's pan can't steal the slider's touches. */}
      {SHOW_TUNING_PANEL && (
        <BubbleTuningPanel
          wobble={wobble}
          wobbleDefault={WOBBLE_DEFAULT}
          optics={optics}
          defaults={defaults}
          refractMax={LIVE_REFRACT_SLIDER_MAX}
        />
      )}
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
    backgroundColor: "#ffffff",
  },
  canvas: {
    backgroundColor: "#ffffff",
  },
});
