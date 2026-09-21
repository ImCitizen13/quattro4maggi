/**
 * LiquidBubbleLive — canvas, live background, backdrop-filter bubble, tuning panel.
 * Design notes: README.md → "LiquidBubbleLive.tsx".
 */

import {
  BackdropFilter,
  Canvas,
  Fill,
  FilterMode,
  Image,
  ImageShader,
  MipmapMode,
  Rect,
  RuntimeShader,
  Shader,
  rect,
  useImage,
  Text as SKText,
  useFont,
  Skia,
} from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useDerivedValue, useSharedValue } from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";
import { useSoapFilmUniforms } from "@/components/soap-film/hooks/useSoapFilmUniforms";
import { SoapFilmShader } from "@/components/soap-film/SoapFilmShader";
import {
  FILM_TOUCH_AGE_INACTIVE,
  FILM_TOUCH_SLOTS,
} from "@/components/soap-film/soapFilmConfig";
import { getSoapFilmRampImage } from "@/lib/shaders/soapFilm";

import { backgroundEffect } from "./backgroundShaders";
import {
  BIRTH_RADIUS_START,
  FLOAT_BUOYANCY_LEVER_DEFAULT,
  FLOAT_ON_DEFAULT,
  INERTIA_DEFAULT,
  STRENGTH_DEFAULT,
  WOBBLE_DEFAULT,
} from "./bubbleModes";
import { BubbleTuningPanel } from "./BubbleTuningPanel";
import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "./hooks/useBubbleGestures";
import { useBubbleFloat, useBubbleTraits } from "./hooks/useBubbleFloat";
import { useBubbleOptics } from "./hooks/useBubbleOptics";
import { useBubbleShape } from "./hooks/useBubbleShape";
import { useImageBubble } from "./hooks/useImageBubble";
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
import { FILM_OVERLAY_SIZE, filmOverlayEffect } from "./filmOverlayShader";
import { liveBubbleEffect } from "./shaders";
import { BoldonseRegular } from "@/assets/fonts/getFonts";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. Real numbers need a release build on device. */
const SHOW_FPS_OVERLAY = true;

/** Spawn box side, pt. Bubbles inflate out of its top edge. */
const BOX_SIZE = 120;

/** Gap between the spawn box and the bottom of the screen, pt. */
const BOX_BOTTOM_OFFSET = 50;

/** Mount `BubbleTuningPanel` (Wobble + the 7 live optics levers). */
const SHOW_TUNING_PANEL = true;

/**
 * Soap-film overlay on at mount (live toggle: Surface tab). On = overlay pass
 * drawn and the bubble's built-in cosine film zeroed; off = no overlay pass
 * (no fill cost) and the built-in film is back.
 */
const SOAP_FILM_ON_DEFAULT = true;

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
  /** Mean birth radius, in points — each bubble is `× BIRTH_RADIUS_RANGE`. */
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
  // Per-bubble inertia/strength (see `bubbleModes.ts` → "Per-bubble inertia
  // and strength"), live-tunable from the panel with no React re-render.
  const inertia = useSharedValue(INERTIA_DEFAULT);
  const strength = useSharedValue(STRENGTH_DEFAULT);
  // Master wobble visibility knob (see `bubbleModes.ts` → "Wobble
  // visibility"), live-tunable from the slider below with no React re-render.
  const wobble = useSharedValue(WOBBLE_DEFAULT);

  // Per-bubble random traits (re-rolled at every spawn by useBubbleFloat).
  // The sliders stay the BASE; the physics reads slider × trait.
  const traits = useBubbleTraits();
  const bubbleInertia = useDerivedValue(
    () => inertia.value * traits.inertiaMul.value,
  );
  const bubbleStrength = useDerivedValue(
    () => strength.value * traits.strengthMul.value,
  );
  const bubbleWobble = useDerivedValue(
    () => wobble.value * traits.wobbleMul.value,
  );

  // Every bubble is born at the spawn box's top-center.
  const spawnX = width / 2;
  const spawnY = height - (BOX_SIZE + BOX_BOTTOM_OFFSET);

  const { bubbleX, bubbleY, isActive, velocityX, velocityY, panGesture } =
    useBubblePanGesture({
      centerX: spawnX,
      centerY: spawnY - BIRTH_RADIUS_START,
      inertia: bubbleInertia,
    });
  // Starts at ~0 so the first bubble inflates out of the box too; the
  // spawner springs it to its random size.
  const { scaledRadius, pinchGesture } = useBubblePinchGesture({
    restRadius: BIRTH_RADIUS_START,
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

  const { paramBuffer, bboxX, bboxY, bboxW, bboxH, anchored } = useBubbleShape({
    bubbleX,
    bubbleY,
    scaledRadius,
    isActive,
    velocityX,
    velocityY,
    wobble: bubbleWobble,
    inertia: bubbleInertia,
    strength: bubbleStrength,
    birthShape: traits.birthShape,
  });

  // ==========================================================================
  // Float (the bubble moving on its own — see hooks/useBubbleFloat.ts)
  // ==========================================================================

  // React state for the toggle label; the SharedValue mirror is what the
  // worklet reads, so toggling never rebuilds the frame callback.
  const [floatOn, setFloatOn] = useState(FLOAT_ON_DEFAULT);
  const floatOnValue = useSharedValue(FLOAT_ON_DEFAULT ? 1 : 0);
  const toggleFloat = () => {
    const next = !floatOn;
    setFloatOn(next);
    floatOnValue.value = next ? 1 : 0;
  };
  const buoyancy = useSharedValue(FLOAT_BUOYANCY_LEVER_DEFAULT);

  // Picture riding behind the bubble; a new random one at every spawn.
  // Follows the glass's own center/radius (paramBuffer), not bubbleX/Y, so
  // the picture and the glass never draw from different frames.
  const imageBubble = useImageBubble({ paramBuffer });

  useBubbleFloat({
    posX: bubbleX,
    posY: bubbleY,
    radius: scaledRadius,
    restRadius,
    spawnX,
    spawnY,
    width,
    height,
    isActive,
    flingX: velocityX,
    flingY: velocityY,
    enabled: floatOnValue,
    buoyancy,
    inertia: bubbleInertia,
    traits,
    anchored,
    onSpawn: imageBubble.onSpawn,
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

  const time = useClock();

  // ==========================================================================
  // Soap film overlay (second pass — see filmOverlayShader.ts)
  // ==========================================================================

  const filmSize = useSharedValue<[number, number]>(FILM_OVERLAY_SIZE);
  // No film touches yet — every slot inactive.
  const filmTouch = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS * 4).fill(0),
  );
  const filmTouchAge = useSharedValue<number[]>(
    new Array(FILM_TOUCH_SLOTS).fill(FILM_TOUCH_AGE_INACTIVE),
  );
  const film = useSoapFilmUniforms({
    time,
    size: filmSize,
    touch: filmTouch,
    touchAge: filmTouchAge,
  });
  const filmRamp = useMemo(() => getSoapFilmRampImage(), []);

  // React state mounts/unmounts the overlay pass; the SharedValue mirror lets
  // the bubble's uniforms react on the UI thread without a closure rebuild.
  const [soapFilmOn, setSoapFilmOn] = useState(SOAP_FILM_ON_DEFAULT);
  const soapFilmOnValue = useSharedValue(SOAP_FILM_ON_DEFAULT ? 1 : 0);
  const toggleSoapFilm = () => {
    const next = !soapFilmOn;
    setSoapFilmOn(next);
    soapFilmOnValue.value = next ? 1 : 0;
  };

  // The overlay replaces the bubble's built-in cosine film, so zero it there.
  const bubbleUniforms = useDerivedValue(() => ({
    ...uniforms.value,
    iFilm: soapFilmOnValue.value === 1 ? 0 : uniforms.value.iFilm,
  }));

  const filmOverlayUniforms = useDerivedValue(() => ({
    iParams: uniforms.value.iParams,
    iFilm: optics.film.value,
    iFalloff: optics.falloff.value,
    uReach: optics.filmReach.value,
    uFilmSize: filmSize.value,
    uFilmColor: [
      film.color.mode.value,
      film.color.thicknessScale.value,
      film.color.intensity.value,
      film.color.opacity.value,
    ],
  }));

  // ==========================================================================
  // Live background
  // ==========================================================================

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
  const textY = textBounds ? centerY - textBounds.y - textBounds.height / 2 : 0;

  // Spawn box: its top-center is where every bubble is born (spawnX/spawnY).
  const blackBoxRect = rect(
    spawnX - BOX_SIZE / 2,
    spawnY,
    BOX_SIZE,
    BOX_SIZE,
  );

  const imagePath = require("../../../assets/liquid-glass-bubble/refract-image.png");
  const bg_path = require("../../../assets/liquid-glass-bubble/focus_bg.jpg");
  // const imagePath1 = require("../../../assets/images/pedra.jpg");
  const image = useImage(bg_path);
  // 1. Wait for the image to resolve
  if (!image) return null;
  // 2. Read the image's raw dimensions
  const imageSize = width * 2; //image.width();

  // 3. Center it on the same point the bubble rests at
  const imageX = centerX - imageSize / 2;
  const imageY = centerY - imageSize / 2;

  return (
    <View style={styles.container}>
      {/* Gestures: pan (drag / throw) + pinch (resize), over the whole canvas. */}
      <GestureDetector gesture={compositeGesture}>
        {/* One Skia canvas: everything the bubble refracts must be drawn in it,
            BEFORE the BackdropFilter (sibling RN views composite too late). */}
        <Canvas style={[styles.canvas, { width, height }]}>
          {/* ---- Backdrop (what the bubble refracts), drawn first ---- */}

          {/* Base fill under the background image. */}
          <Fill color="#ffffff" />

          {/* Background image, centered, 2× screen width. */}
          {image && (
            <Image
              image={image}
              fit="contain"
              width={imageSize}
              height={imageSize}
              x={imageX}
              y={imageY}
            />
          )}

          {/* ImageBubble: a random picture per bubble, filling the bubble and
              following it. Drawn before the BackdropFilter, so the glass
              refracts it (see hooks/useImageBubble.ts).
             make the image less */}
          {imageBubble.image && (
            <Image
              image={imageBubble.image}
              fit="contain"
              sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
              x={imageBubble.x}
              y={imageBubble.y}
              width={imageBubble.size}
              height={imageBubble.size}
            />
          )}

          {/* ---- Bubble ---- */}

          {/* Pass 1: the glass bubble. Snapshots everything above within
              clipRect and runs the bubble shader over it (shaders.ts). */}
          <BackdropFilter
            clip={clipRect}
            filter={
              <RuntimeShader
                source={liveBubbleEffect}
                uniforms={bubbleUniforms}
              />
            }
          />

          {/* Pass 2: soap-film overlay, same shape as the bubble, composited
              on top (filmOverlayShader.ts). Unmounted when the toggle is off. */}
          {soapFilmOn && (
            <Rect rect={clipRect}>
              <Shader source={filmOverlayEffect} uniforms={filmOverlayUniforms}>
                <SoapFilmShader
                  generator="curl"
                  output="thickness"
                  flow={film.flow}
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
          )}
          {/* ---- Foreground ---- */}

          {/* Spawn box: every bubble inflates out of its top edge. Drawn after
              the bubble, so it covers it and is not refracted. */}
          <Rect rect={blackBoxRect}></Rect>
        </Canvas>
      </GestureDetector>

      {/* FPS readout (real numbers need a release build on device). */}
      {SHOW_FPS_OVERLAY && <FpsOverlay dark />}

      {/* Tuning panel. After the GestureDetector, not inside it, so the
          bubble's pan can't steal the slider's touches. */}
      {SHOW_TUNING_PANEL && (
        <BubbleTuningPanel
          wobble={wobble}
          wobbleDefault={WOBBLE_DEFAULT}
          inertia={inertia}
          inertiaDefault={INERTIA_DEFAULT}
          strength={strength}
          strengthDefault={STRENGTH_DEFAULT}
          buoyancy={buoyancy}
          buoyancyDefault={FLOAT_BUOYANCY_LEVER_DEFAULT}
          floatOn={floatOn}
          onFloatToggle={toggleFloat}
          optics={optics}
          defaults={defaults}
          refractMax={LIVE_REFRACT_SLIDER_MAX}
          soapFilmOn={soapFilmOn}
          onSoapFilmToggle={toggleSoapFilm}
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
