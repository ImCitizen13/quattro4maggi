/**
 * BouncingImagesBubble — one big glass bubble in the middle of the screen,
 * with the wabi-and-more pictures bouncing around inside it.
 *
 * FLOW:
 *   mount (JS)   → useBouncingImages: IMAGE_COUNT distinct random sources from
 *                  `imageArray`, non-overlapping start spots inside the disk,
 *                  random headings (hooks/bouncingImagesMath.ts)
 *   every frame  → useBouncingImages' useFrameCallback (UI): bubble accel →
 *                  opposite kick on every image (slosh) · move · bounce off the
 *                  round wall · bounce off each other · relax speed back to
 *                  IMAGE_SPEED (`stepBodies`)
 *   draw         → background → images (BouncingImage.tsx) → BackdropFilter
 *                  (bubble shader), so the glass refracts the images near its
 *                  rim → soap-film overlay (hooks/useBubbleSoapFilm.ts,
 *                  filmOverlayShader.ts, toggle in the Surface tab); the film
 *                  lags the bubble's drag / spring home (useBubbleFilmMotion)
 *   drag         → useBubbleDragHomeGesture: pan moves the bubble by the
 *                  finger's translation; release springs it back to the center
 *
 * KEY FEATURES:
 * - Radius starts at `width / 2` (spans the screen) and is adjustable (Shape →
 *   Size slider, or pinch). Image size, cruise speed and the wall all scale
 *   with it; a resize rescales positions/velocities in place.
 * - Each image has a random size (IMAGE_SIZE_MUL_MIN..MAX) and mass ∝ area.
 * - Image positions are LOCAL to the bubble center, so they ride with it.
 * - Zero React renders per frame: one `SharedValue<number[]>` mutated with
 *   `modify`, each image derives its own x/y.
 * - Shape physics + optics from useBubbleShape, useBubbleOptics, shaders.ts.
 */

import {
  BackdropFilter,
  Canvas,
  Fill,
  FilterMode,
  Group,
  Image,
  ImageShader,
  MipmapMode,
  Rect,
  RuntimeShader,
  Shader,
  rect,
  useImage,
} from "react-native-skia";
import React, { useMemo } from "react";
import {
  PixelRatio,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";

import { IslandFps } from "@/components/common/IslandFps";
import { SoapFilmShader } from "@/components/soap-film/SoapFilmShader";

import { BouncingImage } from "./BouncingImage";
import {
  INERTIA_DEFAULT,
  STRENGTH_DEFAULT,
  WOBBLE_DEFAULT,
  FILM_DRAG_DEFAULT,
} from "./bubbleModes";
import { BubbleTuningPanel } from "./BubbleTuningPanel";
import { useBouncingImages } from "./hooks/useBouncingImages";
import {
  useBubbleDragHomeGesture,
  useBubblePinchGesture,
} from "./hooks/useBubbleGestures";
import { useBubbleOptics } from "./hooks/useBubbleOptics";
import { useBubbleShape } from "./hooks/useBubbleShape";
import { useBubbleSoapFilm } from "./hooks/useBubbleSoapFilm";
import { filmOverlayEffect } from "./filmOverlayShader";
import { CLIP_SLACK, LIVE_REFRACT } from "./liveConfig";
import { liveBubbleEffect } from "./shaders";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. */
const SHOW_FPS_OVERLAY = true;

/** Mount `BubbleTuningPanel` (shape + optics levers). */
const SHOW_TUNING_PANEL = true;

/** Upper bound of the Refract slider, pt. */
const REFRACT_SLIDER_MAX = 40;

/**
 * Render the bubble's backdrop at device resolution instead of logical
 * points. Skia can't apply the canvas matrix to a `RuntimeShader` image
 * filter, so it snapshots the backdrop at 1 texel per local unit (= 1 per
 * point); on a 3x screen the images moving behind the glass then snap to a
 * 3-device-pixel grid and visibly pixelate/jump.
 *
 * Fix: draw everything inside a `1 / pd` group (local unit = device pixel)
 * and put the backdrop back in points with a matching `pd` group; the bubble
 * pass sits between the two and gets its point-valued inputs x `pd`.
 *
 * Costs ~pd² (≈ 9x) the texels per pass. false = the old look, for FPS
 * comparison. Same approach as liquid-bubble-interaction.
 */
const CRISP_BUBBLES = true;

/** Local units per point inside the canvas. 1 = the old, logical-res look. */
const PD = CRISP_BUBBLES ? PixelRatio.get() : 1;

/** Outer group: puts the canvas in device pixels for the bubble pass. */
const DPR_DOWN = [{ scale: 1 / PD }];

/** Inner group: backdrop and film overlay stay authored in points. */
const DPR_UP = [{ scale: PD }];

/** Full-screen background the bubble refracts (fit: cover). */
const BACKGROUND_SOURCE = require("../../../assets/liquid-glass-bubble/stars_bg.jpg");

/** Tint hue, rgb 0..1. */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

/** Bubble radius range for the Size slider / pinch, × the default (width/2). */
const RADIUS_MUL_MIN = 0.35;
const RADIUS_MUL_MAX = 1;

// ============================================================================
// Types
// ============================================================================

export type BouncingImagesBubbleProps = {
  /** Number of images inside the bubble (≤ imageArray length). */
  imageCount?: number;
  /** Base image side at the default bubble size (width/2), pt. Scales with the bubble. */
  imageSize?: number;
  /** Cruise speed at the default bubble size, pt/s. Scales with the bubble. */
  imageSpeed?: number;
};

// ============================================================================
// Component
// ============================================================================

export function BouncingImagesBubble({
  imageCount = 10,
  imageSize = 64,
  imageSpeed = 140,
}: BouncingImagesBubbleProps) {
  const { width, height } = useWindowDimensions();
  const restX = width / 2;
  const restY = height / 2;
  // Default radius; the live one is `scaledRadius` (Size slider / pinch).
  const radius = width / 2;

  // Bubble drag (translation, not jump-to-finger) + spring home on release.
  const { bubbleX, bubbleY, isActive, velocityX, velocityY, panGesture } =
    useBubbleDragHomeGesture({ restX, restY });

  // Pinch and the Size slider both write `scaledRadius`.
  const { scaledRadius, pinchGesture } = useBubblePinchGesture({
    restRadius: radius,
    minRadius: radius * RADIUS_MUL_MIN,
    maxRadius: radius * RADIUS_MUL_MAX,
  });

  // Simultaneous so a two-finger pinch doesn't lose to the pan.
  const gesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture],
  );

  // ==========================================================================
  // Shape physics + optics
  // ==========================================================================

  const wobble = useSharedValue(WOBBLE_DEFAULT);
  const inertia = useSharedValue(INERTIA_DEFAULT);
  const strength = useSharedValue(STRENGTH_DEFAULT);

  const { paramBuffer, bboxX, bboxY, bboxW, bboxH } = useBubbleShape({
    bubbleX,
    bubbleY,
    scaledRadius,
    isActive,
    velocityX,
    velocityY,
    wobble,
    inertia,
    strength,
  });

  const { optics, defaults, uniforms } = useBubbleOptics({
    paramBuffer,
    tintColor: BUBBLE_TINT,
    refract: LIVE_REFRACT,
  });

  // Soap film overlay (second pass — see filmOverlayShader.ts)
  const {
    soapFilmOn,
    soapFilmOnValue,
    toggleSoapFilm,
    filmDrag,
    filmFlow,
    filmRamp,
    filmOverlayUniforms,
  } = useBubbleSoapFilm({
    bubbleX,
    bubbleY,
    scaledRadius,
    inertia,
    optics,
    uniforms,
  });

  // The bubble pass runs in device pixels (outside DPR_UP): scale every
  // length in points by PD. cx, cy, R (iParams 0..2), iRefract and the rim
  // width (iOptics.y) are points; harmonics are unitless and the other
  // lengths are fractions of R, so they follow for free.
  const bubbleUniforms = useDerivedValue(() => {
    const u = uniforms.value;
    const p = u.iParams.slice();
    p[0] *= PD;
    p[1] *= PD;
    p[2] *= PD;
    return {
      ...u,
      iParams: p,
      iFilm: soapFilmOnValue.value === 1 ? 0 : u.iFilm,
      iRefract: u.iRefract * PD,
      iOptics: [u.iOptics[0], u.iOptics[1] * PD, u.iOptics[2], u.iOptics[3]],
    };
  });

  // Clip = shape bbox grown by refract + CLIP_SLACK (see liveConfig.ts).
  const clipRect = useDerivedValue(() => {
    const R = Math.max(bboxW.value, bboxH.value) / 2;
    const pad =
      optics.refract.value +
      R *
        (Math.max(0, -optics.lens.value) +
          optics.dispersion.value +
          (optics.haloOpacity.value !== 0 ? optics.haloSpread.value : 0)) +
      CLIP_SLACK;
    return rect(
      bboxX.value - pad,
      bboxY.value - pad,
      bboxW.value + 2 * pad,
      bboxH.value + 2 * pad,
    );
  });

  // The same rect in the bubble pass's space (device pixels) for the
  // BackdropFilter clip; the film overlay uses `clipRect` in points.
  const clipRectPx = useDerivedValue(() => {
    const r = clipRect.value;
    return rect(r.x * PD, r.y * PD, r.width * PD, r.height * PD);
  });

  // ==========================================================================
  // Bouncing images
  // ==========================================================================

  // Full-screen backdrop; drawn first so the glass refracts it too.
  const background = useImage(BACKGROUND_SOURCE);

  const { sources, sizeMuls, bodies, baseSize } = useBouncingImages({
    imageCount,
    imageSize,
    imageSpeed,
    radius,
    restX,
    restY,
    bubbleX,
    bubbleY,
    scaledRadius,
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          {/* Device-pixel space: one local unit = one device pixel, so the
              bubble pass snapshots its backdrop at full resolution. */}
          <Group transform={DPR_DOWN}>
            {/* ---- Backdrop (what the bubble refracts), drawn first.
                DPR_UP puts it back in points. ---- */}
            <Group transform={DPR_UP}>
              <Fill color="#000000" />
              {background && (
                <Image
                  image={background}
                  fit="cover"
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                />
              )}

              {sources.map((source, i) => (
                <BouncingImage
                  key={i}
                  source={source}
                  index={i}
                  sizeMul={sizeMuls[i]}
                  baseSize={baseSize}
                  bodies={bodies}
                  paramBuffer={paramBuffer}
                />
              ))}
            </Group>

            {/* ---- Bubble: refracts everything above within the clip. Outside
                DPR_UP, so its uniforms and clip are in device pixels. ---- */}
            <BackdropFilter
              clip={clipRectPx}
              filter={
                <RuntimeShader
                  source={liveBubbleEffect}
                  uniforms={bubbleUniforms}
                />
              }
            />

            {/* ---- Soap-film overlay, same shape, composited on top. A plain
                shader fill (not an image filter), so it just goes back in
                points via DPR_UP and its uniforms stay unscaled. ---- */}
            {soapFilmOn && (
              <Group transform={DPR_UP}>
                <Rect rect={clipRect}>
                  <Shader
                    source={filmOverlayEffect}
                    uniforms={filmOverlayUniforms}
                  >
                    <SoapFilmShader
                      generator="curl"
                      output="thickness"
                      flow={filmFlow}
                    />
                    <ImageShader
                      image={filmRamp}
                      tx="repeat"
                      ty="clamp"
                      fit="none"
                      sampling={{
                        filter: FilterMode.Linear,
                        mipmap: MipmapMode.None,
                      }}
                    />
                  </Shader>
                </Rect>
              </Group>
            )}
          </Group>
        </Canvas>
      </GestureDetector>

      {SHOW_FPS_OVERLAY && <IslandFps />}

      {/* After the GestureDetector so the bubble's pan can't steal slider
          touches. No Float / Buoyancy here: this mode doesn't float. */}
      {SHOW_TUNING_PANEL && (
        <BubbleTuningPanel
          wobble={wobble}
          wobbleDefault={WOBBLE_DEFAULT}
          inertia={inertia}
          inertiaDefault={INERTIA_DEFAULT}
          strength={strength}
          strengthDefault={STRENGTH_DEFAULT}
          size={scaledRadius}
          sizeDefault={radius}
          sizeMin={radius * RADIUS_MUL_MIN}
          sizeMax={radius * RADIUS_MUL_MAX}
          optics={optics}
          defaults={defaults}
          refractMax={REFRACT_SLIDER_MAX}
          soapFilmOn={soapFilmOn}
          onSoapFilmToggle={toggleSoapFilm}
          filmDrag={filmDrag}
          filmDragDefault={FILM_DRAG_DEFAULT}
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
    backgroundColor: "#000000",
  },
  canvas: {
    backgroundColor: "#000000",
  },
});
