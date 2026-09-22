/**
 * StackedBubbles — two concentric glass bubbles at the screen center. The
 * inner one is INNER_SCALE (0.875) of the outer and shares its shape: same
 * wobble, same stretch, same film.
 *
 * FLOW:
 *   gestures (UI) → pan drags the pair, pinch resizes it (useBubbleGestures)
 *   release (UI)  → bubbleX/Y = withSpring(center, release velocity)
 *   physics (UI)  → ONE useBubbleShape → outer iParams [cx, cy, R, modes…]
 *   inner         → same buffer with R × INNER_SCALE. The mode amplitudes are
 *                   fractions of R, so the scaled shape is exactly similar
 *   draw          → live background → outer BackdropFilter → outer film
 *                   → inner BackdropFilter (refracts the outer bubble too)
 *                   → inner film
 *
 * KEY FEATURES:
 * - One physics state, so the pair can never drift out of sync — and the
 *   `useBubbleShape` UI-runtime singleton stays a singleton.
 * - Same optics, film and tuning levers as the other modes (one set, both
 *   bubbles).
 * - Controls are mounted only while the top-right toggle is on.
 */

import {
  BackdropFilter,
  Canvas,
  Fill,
  FilterMode,
  ImageShader,
  MipmapMode,
  Rect,
  RuntimeShader,
  Shader,
  rect,
  type SkImage,
} from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type DerivedValue,
} from "react-native-reanimated";
import { PressableScale } from "pressto";

import { FpsOverlay } from "@/components/common/FpsOverlay";
import { useSoapFilmUniforms } from "@/components/soap-film/hooks/useSoapFilmUniforms";
import {
  SoapFilmShader,
  type SoapFilmShaderProps,
} from "@/components/soap-film/SoapFilmShader";
import { SPRING_BUBBLE_RECENTER } from "@/lib/animations/constants";
import { getSoapFilmRampImage } from "@/lib/shaders/soapFilm";

import { backgroundEffect } from "./backgroundShaders";
import {
  BBOX_PAD,
  FILM_DRAG_DEFAULT,
  INERTIA_DEFAULT,
  STRENGTH_DEFAULT,
  WOBBLE_DEFAULT,
} from "./bubbleModes";
import { BubbleTuningPanel } from "./BubbleTuningPanel";
import {
  useBubblePanGesture,
  useBubblePinchGesture,
} from "./hooks/useBubbleGestures";
import { useBubbleFilmMotion } from "./hooks/useBubbleFilmMotion";
import { useBubbleOptics, type BubbleUniforms } from "./hooks/useBubbleOptics";
import { useBubbleShape } from "./hooks/useBubbleShape";
import { useClock } from "./hooks/useClock";
import { FILM_OVERLAY_SIZE, filmOverlayEffect } from "./filmOverlayShader";
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

/** Mount the on-screen FPS readout. */
const SHOW_FPS_OVERLAY = true;

/** Inner bubble radius ÷ outer bubble radius. */
const INNER_SCALE = 0.875;

/** Soap-film overlay on at mount (live toggle: Surface tab). */
const SOAP_FILM_ON_DEFAULT = true;

/** Upper bound of the Refract slider, pt (same as the other modes). */
const REFRACT_SLIDER_MAX = 40;

/** Size slider / pinch range, × the outer rest radius. TUNE */
const SIZE_MUL_MIN = 0.5;
const SIZE_MUL_MAX = 1.6;

/** Controls toggle distance from the top, pt: sits under the mode switcher. */
const TOGGLE_TOP = 60;

/** Tint hue, rgb 0..1 (same as LiquidBubbleLive). */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

// ============================================================================
// Types
// ============================================================================

export type StackedBubblesProps = {
  /** Outer bubble rest radius, pt. The inner one is × INNER_SCALE. */
  restRadius?: number;
};

type Size = { width: number; height: number };

type StackedSceneProps = {
  size: Size;
  restRadius: number;
};

/** `filmOverlayShader.ts` uniforms. */
export type FilmUniforms = {
  iParams: number[];
  iFilm: number;
  iFalloff: number;
  uReach: number;
  uFilmSize: [number, number];
  uFilmColor: number[];
};

export type FilmOverlayProps = {
  clipRect: DerivedValue<ReturnType<typeof rect>>;
  uniforms: DerivedValue<FilmUniforms>;
  flow: SoapFilmShaderProps["flow"];
  ramp: SkImage;
};

// ============================================================================
// Film overlay (one per bubble; same film, different iParams)
// ============================================================================

function FilmOverlay({ clipRect, uniforms, flow, ramp }: FilmOverlayProps) {
  return (
    <Rect rect={clipRect}>
      <Shader source={filmOverlayEffect} uniforms={uniforms}>
        <SoapFilmShader generator="curl" output="thickness" flow={flow} />
        <ImageShader
          image={ramp}
          tx="repeat"
          ty="clamp"
          fit="none"
          sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
        />
      </Shader>
    </Rect>
  );
}

// ============================================================================
// Scene (mounted once the layout is measured)
// ============================================================================

function StackedScene({ size, restRadius }: StackedSceneProps) {
  const { width, height } = size;
  const centerX = width / 2;
  const centerY = height / 2;

  // ==========================================================================
  // Levers (one set, both bubbles)
  // ==========================================================================

  const wobble = useSharedValue(WOBBLE_DEFAULT);
  const inertia = useSharedValue(INERTIA_DEFAULT);
  const strength = useSharedValue(STRENGTH_DEFAULT);
  const wobbleD = useDerivedValue(() => wobble.value);
  const inertiaD = useDerivedValue(() => inertia.value);
  const strengthD = useDerivedValue(() => strength.value);

  // ==========================================================================
  // Gestures: drag the pair, pinch to resize, spring back to center
  // ==========================================================================

  const { bubbleX, bubbleY, isActive, velocityX, velocityY, panGesture } =
    useBubblePanGesture({ centerX, centerY, inertia: inertiaD });
  const { scaledRadius, pinchGesture } = useBubblePinchGesture({
    restRadius,
    minRadius: restRadius * SIZE_MUL_MIN,
    maxRadius: restRadius * SIZE_MUL_MAX,
  });
  const compositeGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture],
  );

  // Release edge (1 → 0): carry the fling into a spring home. Replaces the
  // pan's follow spring, which would otherwise park the pair at the finger.
  useAnimatedReaction(
    () => isActive.value,
    (active, prev) => {
      if (prev === 1 && active === 0) {
        bubbleX.value = withSpring(centerX, {
          ...SPRING_BUBBLE_RECENTER,
          velocity: velocityX.value,
        });
        bubbleY.value = withSpring(centerY, {
          ...SPRING_BUBBLE_RECENTER,
          velocity: velocityY.value,
        });
      }
    },
    [centerX, centerY],
  );

  // ==========================================================================
  // Physics (ONE state → outer bubble; inner = same shape, R × INNER_SCALE)
  // ==========================================================================

  const { paramBuffer, bboxX, bboxY, bboxW, bboxH } = useBubbleShape({
    bubbleX,
    bubbleY,
    scaledRadius,
    isActive,
    velocityX,
    velocityY,
    wobble: wobbleD,
    inertia: inertiaD,
    strength: strengthD,
  });

  const { optics, defaults, uniforms } = useBubbleOptics({
    paramBuffer,
    tintColor: BUBBLE_TINT,
    refract: LIVE_REFRACT,
  });

  const time = useClock();

  // ==========================================================================
  // Soap film (shared motion + flow; one overlay pass per bubble)
  // ==========================================================================

  const [soapFilmOn, setSoapFilmOn] = useState(SOAP_FILM_ON_DEFAULT);
  const soapFilmOnValue = useSharedValue(SOAP_FILM_ON_DEFAULT ? 1 : 0);
  const toggleSoapFilm = () => {
    const next = !soapFilmOn;
    setSoapFilmOn(next);
    soapFilmOnValue.value = next ? 1 : 0;
  };

  const filmDrag = useSharedValue(FILM_DRAG_DEFAULT);
  const filmMotion = useBubbleFilmMotion({
    posX: bubbleX,
    posY: bubbleY,
    radius: scaledRadius,
    time,
    enabled: soapFilmOnValue,
    drag: filmDrag,
    inertia,
  });

  const filmSize = useSharedValue<[number, number]>(FILM_OVERLAY_SIZE);
  const film = useSoapFilmUniforms({
    time,
    size: filmSize,
    touch: filmMotion.filmTouch,
    touchAge: filmMotion.filmTouchAge,
  });
  const filmFlow = useMemo(
    () => ({
      ...film.flow,
      touchTau: filmMotion.touchTau,
      touchRadius: filmMotion.touchRadius,
    }),
    [film.flow, filmMotion.touchTau, filmMotion.touchRadius],
  );
  const filmRamp = useMemo(() => getSoapFilmRampImage(), []);

  // ==========================================================================
  // Uniforms
  // ==========================================================================

  const outerUniforms = useDerivedValue<BubbleUniforms>(() => ({
    ...uniforms.value,
    iFilm: soapFilmOnValue.value === 1 ? 0 : uniforms.value.iFilm,
  }));

  // Same modes (fractions of R), smaller R → the exact same shape, scaled.
  const innerUniforms = useDerivedValue<BubbleUniforms>(() => {
    const iParams = outerUniforms.value.iParams.slice();
    iParams[2] *= INNER_SCALE;
    return { ...outerUniforms.value, iParams };
  });

  // Everything but iParams is shared by both film passes. Built inline, not
  // via a 'worklet' helper: those resolve as undefined in Bundle Mode.
  const filmShared = useDerivedValue(() => ({
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
  const outerFilmUniforms = useDerivedValue<FilmUniforms>(() => ({
    ...filmShared.value,
    iParams: outerUniforms.value.iParams,
  }));
  const innerFilmUniforms = useDerivedValue<FilmUniforms>(() => ({
    ...filmShared.value,
    iParams: innerUniforms.value.iParams,
  }));

  const backgroundUniforms = useDerivedValue(() => ({
    iResolution: [width, height],
    iTime: time.value,
    iBand: [BG_SCROLL_RATE, BG_BAND_DIR_X, BG_BAND_DIR_Y, BG_GRID_DENSITY],
    iGrid: [BG_GRID_DRIFT, BG_GRID_WIDTH, BG_GRID_STRENGTH, 0],
  }));

  // ==========================================================================
  // Backdrop clips
  // ==========================================================================

  // Pad factor × R: every outward read + the halo draw (same reasoning as
  // LiquidBubbleLive's clipRect). Refract adds on top, in points.
  const padPerR = useDerivedValue(
    () =>
      Math.max(0, -optics.lens.value) +
      optics.dispersion.value +
      (optics.haloOpacity.value !== 0 ? optics.haloSpread.value : 0),
  );

  const outerClip = useDerivedValue(() => {
    const half = bboxW.value / 2;
    const pad =
      optics.refract.value + half * padPerR.value + CLIP_SLACK;
    return rect(
      bboxX.value - pad,
      bboxY.value - pad,
      bboxW.value + 2 * pad,
      bboxH.value + 2 * pad,
    );
  });

  // Inner bbox: the outer's shape part (half − BBOX_PAD) scaled, AA pad kept.
  const innerClip = useDerivedValue(() => {
    const outerHalf = bboxW.value / 2;
    const cx = bboxX.value + outerHalf;
    const cy = bboxY.value + outerHalf;
    const half = (outerHalf - BBOX_PAD) * INNER_SCALE + BBOX_PAD;
    const extent =
      half + optics.refract.value + half * padPerR.value + CLIP_SLACK;
    return rect(cx - extent, cy - extent, 2 * extent, 2 * extent);
  });

  // ==========================================================================
  // Controls toggle
  // ==========================================================================

  const [controlsOn, setControlsOn] = useState(false);

  return (
    <>
      <GestureDetector gesture={compositeGesture}>
        <Canvas style={StyleSheet.absoluteFill}>
          {/* ---- Backdrop: live background, drawn first ---- */}
          <Fill>
            <Shader source={backgroundEffect} uniforms={backgroundUniforms} />
          </Fill>

          {/* ---- Outer bubble ---- */}
          <BackdropFilter
            clip={outerClip}
            filter={
              <RuntimeShader source={liveBubbleEffect} uniforms={outerUniforms} />
            }
          />
          {soapFilmOn && (
            <FilmOverlay
              clipRect={outerClip}
              uniforms={outerFilmUniforms}
              flow={filmFlow}
              ramp={filmRamp}
            />
          )}

          {/* ---- Inner bubble: its backdrop includes the outer bubble ---- */}
          <BackdropFilter
            clip={innerClip}
            filter={
              <RuntimeShader source={liveBubbleEffect} uniforms={innerUniforms} />
            }
          />
          {soapFilmOn && (
            <FilmOverlay
              clipRect={innerClip}
              uniforms={innerFilmUniforms}
              flow={filmFlow}
              ramp={filmRamp}
            />
          )}
        </Canvas>
      </GestureDetector>

      {/* After the GestureDetector so the pan can't steal slider touches.
          Unmounted (not collapsed) while the toggle is off. */}
      {controlsOn && (
        <BubbleTuningPanel
          initialTab="shape"
          wobble={wobble}
          wobbleDefault={WOBBLE_DEFAULT}
          inertia={inertia}
          inertiaDefault={INERTIA_DEFAULT}
          strength={strength}
          strengthDefault={STRENGTH_DEFAULT}
          size={scaledRadius}
          sizeDefault={restRadius}
          sizeMin={restRadius * SIZE_MUL_MIN}
          sizeMax={restRadius * SIZE_MUL_MAX}
          optics={optics}
          defaults={defaults}
          refractMax={REFRACT_SLIDER_MAX}
          soapFilmOn={soapFilmOn}
          onSoapFilmToggle={toggleSoapFilm}
          filmDrag={filmDrag}
          filmDragDefault={FILM_DRAG_DEFAULT}
        />
      )}

      <PressableScale
        onPress={() => setControlsOn((on) => !on)}
        style={[styles.toggle, controlsOn && styles.toggleActive]}
      >
        <Text style={[styles.toggleText, controlsOn && styles.toggleTextActive]}>
          {controlsOn ? "Hide controls" : "Controls"}
        </Text>
      </PressableScale>
    </>
  );
}

// ============================================================================
// Component
// ============================================================================

export function StackedBubbles({ restRadius = 110 }: StackedBubblesProps) {
  // Measured, not the window: the screen has a header above it.
  const [size, setSize] = useState<Size | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {size !== null && (
        <StackedScene
          // A new size (rotation) remounts: the center is seeded once.
          key={`${size.width}x${size.height}`}
          size={size}
          restRadius={restRadius}
        />
      )}
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
    backgroundColor: "#1a1a1a",
  },
  toggle: {
    position: "absolute",
    top: TOGGLE_TOP,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#1a1a1a",
  },
  toggleActive: {
    backgroundColor: "#fff",
  },
  toggleText: {
    color: "#fff",
    fontWeight: "600",
  },
  toggleTextActive: {
    color: "#1a1a1a",
  },
});
