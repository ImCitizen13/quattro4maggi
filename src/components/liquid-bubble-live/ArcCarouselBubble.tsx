/**
 * ArcCarouselBubble — a wheel of round image thumbnails along a semicircle at
 * the bottom of the screen, with a glass bubble at the arc's top slot. The
 * image in that slot is also the full-screen background, and the bubble
 * refracts both.
 *
 * FLOW:
 *   mount (JS)   → all `imageArray` images decoded ONCE (useCollectionLoading)
 *   drag (UI)    → horizontal pan: offset = start − dx / (arcR · STEP)
 *   release (UI) → offset = withSpring(round(offset + v · FLICK_PROJECTION),
 *                  velocity v) — a flick carries a few items, then snaps
 *   per item     → d = wrap(i − offset) · θ = d · STEP
 *                  x = cx + arcR·sinθ, y = cy − arcR·cosθ
 *                  size ITEM_SIZE × (CENTER_SCALE at θ 0 → 1 at ±STEP),
 *                  fades out below the arc's horizon (FADE_START..FADE_END)
 *   background   → layer i weight = max(0, 1 − |d|), drawn with blend "plus"
 *                  over black: an exact crossfade of the two nearest images,
 *                  independent of draw order (≤ 2 layers drawn per frame)
 *   draw         → black → backgrounds → thumbnails → BackdropFilter bubble
 *                  (shaders.ts) at the top slot, refracting all of it
 *
 * KEY FEATURES:
 * - One `offset` SharedValue drives everything; zero React renders per frame.
 * - The wheel wraps: N images sit on a full circle (STEP = 2π / N) and the
 *   lower half is hidden, so flicking never runs out of items.
 * - The bubble is stationary; the release velocity kicks its wobble through
 *   the same `useBubbleShape` physics as the other modes.
 * - Geometry comes from the measured layout (onLayout), not the window, so
 *   the arc sits on the real bottom edge under the header.
 */

import {
  BackdropFilter,
  Canvas,
  Circle,
  Fill,
  FilterMode,
  Group,
  Image,
  MipmapMode,
  RuntimeShader,
  loadData,
  rect,
  rrect,
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
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";
import { SPRING_ARC_SNAP } from "@/lib/animations/constants";

import { imageArray } from "../../../assets/liquid-glass-bubble/images.generated";
import { INERTIA_DEFAULT, STRENGTH_DEFAULT, WOBBLE_DEFAULT } from "./bubbleModes";
import { useBubbleOptics } from "./hooks/useBubbleOptics";
import { useBubbleShape } from "./hooks/useBubbleShape";
import { CLIP_SLACK, LIVE_REFRACT } from "./liveConfig";
import { liveBubbleEffect } from "./shaders";

// ============================================================================
// Config
// ============================================================================

/** Mount the on-screen FPS readout. */
const SHOW_FPS_OVERLAY = true;

/** Images on the wheel, in order. */
const SOURCES: number[] = [...imageArray];

/** Number of images on the wheel. */
const COUNT = SOURCES.length;

/** Angle between neighbours, rad. N images fill a full circle, so it wraps. */
const STEP = (Math.PI * 2) / COUNT;

/** Scale of the thumbnail at the top slot (× itemSize). TUNE */
const CENTER_SCALE = 1.4;

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

/** Thumbnail ring stroke. */
const RING_WIDTH = 1.5;
const RING_COLOR = "rgba(255,255,255,0.7)";

/** Tint hue, rgb 0..1 (same as LiquidBubbleLive). */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

/** Mipmapped sampling: thumbnails are big photos drawn small. */
const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear };

// ============================================================================
// Types
// ============================================================================

export type ArcCarouselBubbleProps = {
  /** Thumbnail diameter away from the top slot, pt. */
  itemSize?: number;
  /** Bubble radius, pt. Default fits the centered thumbnail at ¾ of its width. */
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
  index: number;
  offset: SharedValue<number>;
  arc: ArcGeometry;
  itemSize: number;
};

type ArcSceneProps = {
  images: SkImage[];
  size: Size;
  itemSize: number;
  bubbleRadius: number;
};

// ============================================================================
// Image loading (JS, once)
// ============================================================================

const imageFactory = (data: Parameters<typeof Skia.Image.MakeImageFromEncoded>[0]) =>
  Skia.Image.MakeImageFromEncoded(data);

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

function ArcThumb({ image, index, offset, arc, itemSize }: ArcThumbProps) {
  const theta = useDerivedValue(() => {
    let d = index - offset.value;
    d -= COUNT * Math.round(d / COUNT);
    return d * STEP;
  });
  const side = useDerivedValue(() => {
    const a = Math.abs(theta.value);
    if (a >= FADE_END) return 0;
    return (
      itemSize *
      interpolate(a, [0, STEP], [CENTER_SCALE, 1], Extrapolation.CLAMP)
    );
  });
  const opacity = useDerivedValue(() =>
    interpolate(
      Math.abs(theta.value),
      [FADE_START, FADE_END],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  );
  const centerX = useDerivedValue(
    () => arc.cx + arc.radius * Math.sin(theta.value),
  );
  const centerY = useDerivedValue(
    () => arc.cy - arc.radius * Math.cos(theta.value),
  );
  const x = useDerivedValue(() => centerX.value - side.value / 2);
  const y = useDerivedValue(() => centerY.value - side.value / 2);
  const ringR = useDerivedValue(() => side.value / 2);
  const clip = useDerivedValue(() => {
    const s = side.value;
    return rrect(rect(x.value, y.value, s, s), s / 2, s / 2);
  });

  return (
    <Group opacity={opacity}>
      <Group clip={clip}>
        <Image
          image={image}
          fit="cover"
          x={x}
          y={y}
          width={side}
          height={side}
          sampling={SAMPLING}
        />
      </Group>
      <Circle
        cx={centerX}
        cy={centerY}
        r={ringR}
        style="stroke"
        strokeWidth={RING_WIDTH}
        color={RING_COLOR}
      />
    </Group>
  );
}

// ============================================================================
// Scene (mounted once the images and the layout are ready)
// ============================================================================

function ArcScene({ images, size, itemSize, bubbleRadius }: ArcSceneProps) {
  const { width, height } = size;

  // Arc: centered, its horizon ARC_BOTTOM_INSET above the bottom edge, side
  // items (θ = ±90°) ARC_SIDE_INSET in from the screen edges.
  const arc = useMemo<ArcGeometry>(
    () => ({
      cx: width / 2,
      cy: height - ARC_BOTTOM_INSET - itemSize / 2,
      radius: width / 2 - itemSize / 2 - ARC_SIDE_INSET,
    }),
    [width, height, itemSize],
  );
  // Finger travel that moves the wheel by one item: the arc length of STEP.
  const stepPx = arc.radius * STEP;

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
  const scaledRadius = useSharedValue(bubbleRadius);
  const wobble = useDerivedValue(() => WOBBLE_DEFAULT);
  const inertia = useDerivedValue(() => INERTIA_DEFAULT);
  const strength = useDerivedValue(() => STRENGTH_DEFAULT);

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

  const { optics, uniforms } = useBubbleOptics({
    paramBuffer,
    tintColor: BUBBLE_TINT,
    refract: LIVE_REFRACT,
  });

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
            <RuntimeShader source={liveBubbleEffect} uniforms={uniforms} />
          }
        />
      </Canvas>
    </GestureDetector>
  );
}

// ============================================================================
// Component
// ============================================================================

export function ArcCarouselBubble({
  itemSize = 60,
  bubbleRadius = (itemSize * CENTER_SCALE) / 1.5,
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
});
