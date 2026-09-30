/**
 * ArcCarouselBubble — a wheel of rectangular image thumbnails along a
 * semicircle at the bottom of the screen, with a glass bubble at the arc's top
 * slot. The image in that slot is also the full-screen background, and the
 * bubble refracts both.
 *
 * FLOW:
 *   mount (JS)   → all `imageArray` images decoded ONCE (useCollectionLoading)
 *   drag (UI)    → horizontal pan: offset = start − dx / (arcR · STEP)
 *   release (UI) → offset = withSpring(round(offset + v · FLICK_PROJECTION),
 *                  velocity v) — a flick carries a few items, then snaps
 *   per item     → d = wrap(i − offset) · θ = d · STEP
 *                  x = cx + arcR·sinθ, y = cy − arcR·cosθ
 *                  height itemSize × (CENTER_SCALE at θ 0 → 1 at ±STEP),
 *                  width = height × the image's own aspect; fades out below
 *                  the arc's horizon (FADE_START..FADE_END)
 *   background   → layer i weight = max(0, 1 − |d|), drawn with blend "plus"
 *                  over black: an exact crossfade of the two nearest images,
 *                  independent of draw order (≤ 2 layers drawn per frame)
 *   draw         → black → backgrounds → thumbnails → BackdropFilter bubble
 *                  (shaders.ts) at the top slot, refracting all of it
 *                  → soap-film overlay (filmOverlayShader.ts)
 *   film motion  → a virtual bubble position cx + offset · stepPx: the wheel
 *                  sliding under the glass drags the film like the bubble
 *                  moving the other way (useBubbleFilmMotion)
 *
 * KEY FEATURES:
 * - One `offset` SharedValue drives everything; zero React renders per frame.
 * - The wheel wraps: N images sit on a full circle (STEP = 2π / N) and the
 *   lower half is hidden, so flicking never runs out of items.
 * - The bubble is sized so the centered rectangle's corners sit inside it
 *   (BUBBLE_FIT × the rectangle's half-diagonal); Shape → Size resizes it.
 * - The bubble is stationary; the release velocity kicks its wobble through
 *   the same `useBubbleShape` physics as the other modes.
 * - `BubbleTuningPanel` at the top (the arc owns the bottom), starting hidden.
 * - Geometry comes from the measured layout (onLayout), not the window, so
 *   the arc sits on the real bottom edge under the header.
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
  loadData,
  rect,
  Skia,
  useCollectionLoading,
  type SkImage,
} from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";
import { useSoapFilmUniforms } from "@/components/soap-film/hooks/useSoapFilmUniforms";
import { SoapFilmShader } from "@/components/soap-film/SoapFilmShader";
import { SPRING_ARC_SNAP } from "@/lib/animations/constants";
import { getSoapFilmRampImage } from "@/lib/shaders/soapFilm";

import { imageArray } from "../../../assets/liquid-glass-bubble/images.generated";
import {
  FILM_DRAG_DEFAULT,
  INERTIA_DEFAULT,
  STRENGTH_DEFAULT,
  WOBBLE_DEFAULT,
} from "./bubbleModes";
import { BubbleTuningPanel } from "./BubbleTuningPanel";
import { useBubbleFilmMotion } from "./hooks/useBubbleFilmMotion";
import { useBubbleOptics } from "./hooks/useBubbleOptics";
import { useBubbleShape } from "./hooks/useBubbleShape";
import { useClock } from "./hooks/useClock";
import { FILM_OVERLAY_SIZE, filmOverlayEffect } from "./filmOverlayShader";
import { CLIP_SLACK, LIVE_REFRACT } from "./liveConfig";
import { liveBubbleEffect } from "./shaders";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. */
const SHOW_FPS_OVERLAY = true;

/** Mount `BubbleTuningPanel` (shape + optics levers). */
const SHOW_TUNING_PANEL = true;

/** Soap-film overlay on at mount (live toggle: Surface tab). */
const SOAP_FILM_ON_DEFAULT = true;

/** Upper bound of the Refract slider, pt (same as the other modes). */
const REFRACT_SLIDER_MAX = 40;

/** Panel distance from the top, pt: clears the mode switcher. */
const PANEL_TOP = 60;

/** Images on the wheel, in order. */
const SOURCES: number[] = [...imageArray];

/** Number of images on the wheel. */
const COUNT = SOURCES.length;

/** Angle between neighbours, rad. N images fill a full circle, so it wraps. */
const STEP = (Math.PI * 2) / COUNT;

/** Scale of the thumbnail at the top slot (× itemSize). TUNE */
const CENTER_SCALE = 1.4;

/**
 * Bubble radius ÷ the centered rectangle's half-diagonal. > 1 keeps the
 * corners off the rim, where the refraction bends hardest. TUNE
 */
const BUBBLE_FIT = 1.35;

/** Size slider range, × the fitted radius. TUNE */
const SIZE_MUL_MIN = 0.6;
const SIZE_MUL_MAX = 1.6;

/** Gap between the arc's side items and the screen edge, pt. TUNE */
const ARC_SIDE_INSET = 12;

/** Gap between the arc's center (its horizon) and the bottom edge, pt. TUNE */
const ARC_BOTTOM_INSET = 24;

/** Thumbnails start fading at this angle from the top, rad (90°). TUNE */
const FADE_START = Math.PI / 2;

/** …and are gone (not drawn) past this one, rad (~115°). TUNE */
const FADE_END = Math.PI * 0.64;

/** Seconds of release velocity a flick is projected forward before snapping. TUNE */
const FLICK_PROJECTION = 0.25;

/** Most items one flick can travel. TUNE */
const FLICK_MAX_ITEMS = 4;

/** Finger speed → bubble wobble kick on release (0 = no wobble). TUNE */
const BUBBLE_KICK = 0.5;

/** Thumbnail border stroke. */
const BORDER_WIDTH = 1.5;
const BORDER_COLOR = "rgba(255,255,255,0.7)";

/** Tint hue, rgb 0..1 (same as LiquidBubbleLive). */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

/** Mipmapped sampling: thumbnails are big photos drawn small. */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear };

// ============================================================================
// Types
// ============================================================================

export type ArcCarouselBubbleProps = {
  /** Thumbnail height away from the top slot, pt. Width follows each image's aspect. */
  itemSize?: number;
  /** Bubble radius, pt. Default fits the centered rectangle (BUBBLE_FIT). */
  bubbleRadius?: number;
};

type Size = { width: number; height: number };

/** Arc placement, pt. Plain numbers: fixed once the layout is measured. */
export type ArcGeometry = {
  cx: number;
  cy: number;
  radius: number;
};

type ArcBackgroundProps = {
  image: SkImage;
  index: number;
  offset: SharedValue<number>;
  size: Size;
};

type ArcThumbProps = {
  image: SkImage;
  /** Image width ÷ height. */
  aspect: number;
  index: number;
  offset: SharedValue<number>;
  arc: ArcGeometry;
  itemSize: number;
};

type ArcSceneProps = {
  images: SkImage[];
  size: Size;
  itemSize: number;
  bubbleRadius?: number;
};

// ============================================================================
// Image loading (JS, once)
// ============================================================================

const imageFactory = (
  data: Parameters<typeof Skia.Image.MakeImageFromEncoded>[0],
) => Skia.Image.MakeImageFromEncoded(data);

const loadAllImages = () =>
  Promise.all(SOURCES.map((source) => loadData(source, imageFactory)));

// ============================================================================
// Background layer (one per image; drawn only while it's one of the two nearest)
// ============================================================================

function ArcBackground({ image, index, offset, size }: ArcBackgroundProps) {
  // Weight of this image in the crossfade. Wrap inlined: a 'worklet' helper
  // captured by another worklet resolves as undefined in Bundle Mode.
  const weight = useDerivedValue(() => {
    let d = index - offset.value;
    d -= COUNT * Math.round(d / COUNT);
    return Math.max(0, 1 - Math.abs(d));
  });
  // Zero height = nothing drawn, so hidden layers cost no fill.
  const height = useDerivedValue(() => (weight.value > 0 ? size.height : 0));
  return (
    <Image
      image={image}
      fit="cover"
      x={0}
      y={0}
      width={size.width}
      height={height}
      opacity={weight}
      blendMode="plus"
    />
  );
}

// ============================================================================
// Thumbnail (one per image, placed on the arc)
// ============================================================================

function ArcThumb({
  image,
  aspect,
  index,
  offset,
  arc,
  itemSize,
}: ArcThumbProps) {
  const theta = useDerivedValue(() => {
    let d = index - offset.value;
    d -= COUNT * Math.round(d / COUNT);
    return d * STEP;
  });
  const h = useDerivedValue(() => {
    const a = Math.abs(theta.value);
    if (a >= FADE_END) return 0;
    return (
      itemSize *
      interpolate(a, [0, STEP], [CENTER_SCALE, 1], Extrapolation.CLAMP)
    );
  });
  const w = useDerivedValue(() => h.value * aspect);
  const opacity = useDerivedValue(() =>
    interpolate(
      Math.abs(theta.value),
      [FADE_START, FADE_END],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  );
  const x = useDerivedValue(
    () => arc.cx + arc.radius * Math.sin(theta.value) - w.value / 2,
  );
  const y = useDerivedValue(
    () => arc.cy - arc.radius * Math.cos(theta.value) - h.value / 2,
  );

  // The rect has the image's own aspect, so "fill" draws it undistorted.
  return (
    <Group opacity={opacity}>
      <Image
        image={image}
        fit="fill"
        x={x}
        y={y}
        width={w}
        height={h}
        sampling={SAMPLING}
      />
      <Rect
        x={x}
        y={y}
        width={w}
        height={h}
        style="stroke"
        strokeWidth={BORDER_WIDTH}
        color={BORDER_COLOR}
      />
    </Group>
  );
}

// ============================================================================
// Scene (mounted once the images and the layout are ready)
// ============================================================================

function ArcScene({ images, size, itemSize, bubbleRadius }: ArcSceneProps) {
  const { width, height } = size;

  const aspects = useMemo(
    () => images.map((image) => image.width() / image.height()),
    [images],
  );
  const maxAspect = Math.max(...aspects);

  // Arc: centered, its horizon ARC_BOTTOM_INSET above the bottom edge, side
  // items (θ = ±90°) ARC_SIDE_INSET in from the screen edges.
  const arc = useMemo<ArcGeometry>(
    () => ({
      cx: width / 2,
      cy: height - ARC_BOTTOM_INSET - itemSize / 2,
      radius: width / 2 - (itemSize * maxAspect) / 2 - ARC_SIDE_INSET,
    }),
    [width, height, itemSize, maxAspect],
  );
  // Finger travel that moves the wheel by one item: the arc length of STEP.
  const stepPx = arc.radius * STEP;

  // Radius that holds the widest centered rectangle, corners included.
  const centerH = itemSize * CENTER_SCALE;
  const fitRadius =
    bubbleRadius ??
    BUBBLE_FIT * (centerH / 2) * Math.sqrt(1 + maxAspect * maxAspect);

  // ==========================================================================
  // Carousel gesture
  // ==========================================================================

  const offset = useSharedValue(0);
  const startOffset = useSharedValue(0);
  const isActive = useSharedValue(0);
  const velocityX = useSharedValue(0);
  const velocityY = useSharedValue(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Horizontal only: vertical drags fail so they never move the wheel.
        .activeOffsetX([-10, 10])
        .failOffsetY([-20, 20])
        .onStart(() => {
          "worklet";
          cancelAnimation(offset);
          startOffset.value = offset.value;
          isActive.value = 1;
        })
        .onUpdate((e) => {
          "worklet";
          // Drag right → the item on the left comes to the top.
          offset.value = startOffset.value - e.translationX / stepPx;
          velocityX.value = e.velocityX * BUBBLE_KICK;
          velocityY.value = e.velocityY * BUBBLE_KICK;
        })
        .onEnd((e) => {
          "worklet";
          const v = -e.velocityX / stepPx; // items / s
          const travel = Math.max(
            -FLICK_MAX_ITEMS,
            Math.min(FLICK_MAX_ITEMS, v * FLICK_PROJECTION),
          );
          const target = Math.round(offset.value + travel);
          offset.value = withSpring(target, { ...SPRING_ARC_SNAP, velocity: v });
          velocityX.value = e.velocityX * BUBBLE_KICK;
          velocityY.value = e.velocityY * BUBBLE_KICK;
        })
        .onFinalize(() => {
          "worklet";
          // 1 → 0 fires the bubble's release kick from velocityX/Y.
          isActive.value = 0;
        }),
    [offset, startOffset, isActive, velocityX, velocityY, stepPx],
  );

  // ==========================================================================
  // Bubble (fixed at the arc's top slot; same physics + optics as the others)
  // ==========================================================================

  const bubbleX = useSharedValue(arc.cx);
  const bubbleY = useSharedValue(arc.cy - arc.radius);
  // Written by the Size slider.
  const scaledRadius = useSharedValue(fitRadius);

  // Panel levers; the physics takes derived values.
  const wobble = useSharedValue(WOBBLE_DEFAULT);
  const inertia = useSharedValue(INERTIA_DEFAULT);
  const strength = useSharedValue(STRENGTH_DEFAULT);
  const wobbleD = useDerivedValue(() => wobble.value);
  const inertiaD = useDerivedValue(() => inertia.value);
  const strengthD = useDerivedValue(() => strength.value);

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

  // ==========================================================================
  // Soap film overlay (second pass — see filmOverlayShader.ts)
  // ==========================================================================

  const time = useClock();

  // React state mounts/unmounts the pass; the SharedValue mirror zeroes the
  // bubble's built-in film on the UI thread.
  const [soapFilmOn, setSoapFilmOn] = useState(SOAP_FILM_ON_DEFAULT);
  const soapFilmOnValue = useSharedValue(SOAP_FILM_ON_DEFAULT ? 1 : 0);
  const toggleSoapFilm = () => {
    const next = !soapFilmOn;
    setSoapFilmOn(next);
    soapFilmOnValue.value = next ? 1 : 0;
  };

  // The bubble never moves, so the film lags the WHEEL instead: content
  // sliding right under the glass reads as the bubble moving left.
  const filmPosX = useSharedValue(arc.cx);
  const filmPosY = useSharedValue(arc.cy - arc.radius);
  useAnimatedReaction(
    () => offset.value,
    (o) => {
      filmPosX.value = arc.cx + o * stepPx;
    },
    [arc.cx, stepPx],
  );

  const filmDrag = useSharedValue(FILM_DRAG_DEFAULT);
  const filmMotion = useBubbleFilmMotion({
    posX: filmPosX,
    posY: filmPosY,
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
  // Impulse decay/reach from the hook, not the soap-film finger-poke defaults.
  const filmFlow = useMemo(
    () => ({
      ...film.flow,
      touchTau: filmMotion.touchTau,
      touchRadius: filmMotion.touchRadius,
    }),
    [film.flow, filmMotion.touchTau, filmMotion.touchRadius],
  );
  const filmRamp = useMemo(() => getSoapFilmRampImage(), []);

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

  // Same padding reasoning as LiquidBubbleLive's clipRect.
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

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <Canvas style={StyleSheet.absoluteFill}>
          {/* ---- Backdrop (what the bubble refracts), drawn first ---- */}
          {/* Black base: the "plus" crossfade adds the two layers onto it. */}
          <Fill color="#000000" />
          {images.map((image, i) => (
            <ArcBackground
              key={`bg-${i}`}
              image={image}
              index={i}
              offset={offset}
              size={size}
            />
          ))}
          {images.map((image, i) => (
            <ArcThumb
              key={`thumb-${i}`}
              image={image}
              aspect={aspects[i]}
              index={i}
              offset={offset}
              arc={arc}
              itemSize={itemSize}
            />
          ))}

          {/* ---- Bubble: refracts everything above within clipRect ---- */}
          <BackdropFilter
            clip={clipRect}
            filter={
              <RuntimeShader
                source={liveBubbleEffect}
                uniforms={bubbleUniforms}
              />
            }
          />

          {/* ---- Soap-film overlay, same shape, composited on top ---- */}
          {soapFilmOn && (
            <Rect rect={clipRect}>
              <Shader source={filmOverlayEffect} uniforms={filmOverlayUniforms}>
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
          )}
        </Canvas>
      </GestureDetector>

      {/* After the GestureDetector so the wheel's pan can't steal slider
          touches. At the top: the arc owns the bottom. No Float / Buoyancy:
          this bubble doesn't float. */}
      {SHOW_TUNING_PANEL && (
        <BubbleTuningPanel
          style={styles.panel}
          initialTab="hide"
          wobble={wobble}
          wobbleDefault={WOBBLE_DEFAULT}
          inertia={inertia}
          inertiaDefault={INERTIA_DEFAULT}
          strength={strength}
          strengthDefault={STRENGTH_DEFAULT}
          size={scaledRadius}
          sizeDefault={fitRadius}
          sizeMin={fitRadius * SIZE_MUL_MIN}
          sizeMax={fitRadius * SIZE_MUL_MAX}
          optics={optics}
          defaults={defaults}
          refractMax={REFRACT_SLIDER_MAX}
          soapFilmOn={soapFilmOn}
          onSoapFilmToggle={toggleSoapFilm}
          filmDrag={filmDrag}
          filmDragDefault={FILM_DRAG_DEFAULT}
        />
      )}
    </>
  );
}

// ============================================================================
// Component
// ============================================================================

export function ArcCarouselBubble({
  itemSize = 72,
  bubbleRadius,
}: ArcCarouselBubbleProps) {
  // Decoded once; SOURCES is a module constant, so the loader never re-runs.
  const images = useCollectionLoading<SkImage>(SOURCES, loadAllImages);
  // Measured, not the window: the screen has a header above it.
  const [size, setSize] = useState<Size | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const ready = images !== null && images.length === COUNT && size !== null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {ready && (
        <ArcScene
          // A new size (rotation) remounts: the bubble's SharedValues are
          // seeded from the geometry once.
          key={`${size.width}x${size.height}`}
          images={images}
          size={size}
          itemSize={itemSize}
          bubbleRadius={bubbleRadius}
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
    backgroundColor: "#000000",
  },
  panel: {
    top: PANEL_TOP,
    bottom: undefined,
  },
});
