/**
 * BouncingImagesBubble — one big glass bubble in the middle of the screen,
 * with the wabi-and-more pictures bouncing around inside it.
 *
 * FLOW:
 *   mount (JS)   → IMAGE_COUNT distinct random sources from `imageArray`,
 *                  non-overlapping start spots inside the disk, random headings
 *   every frame  → useFrameCallback (UI): bubble accel → opposite kick on every
 *                  image (slosh) · move · bounce off the round wall · bounce off
 *                  each other · relax speed back to IMAGE_SPEED
 *   draw         → background → images → BackdropFilter (bubble shader), so the
 *                  glass refracts the images near its rim → soap-film overlay
 *                  (filmOverlayShader.ts, toggle in the Surface tab)
 *   drag         → pan moves the bubble by the finger's translation; release
 *                  springs it back to the center
 *
 * KEY FEATURES:
 * - Radius starts at `width / 2` (spans the screen) and is adjustable (Shape →
 *   Size slider, or pinch). Image size, cruise speed and the wall all scale
 *   with it; a resize rescales positions/velocities in place.
 * - Each image has a random size (IMAGE_SIZE_MUL_MIN..MAX) and mass ∝ area.
 * - Image positions are LOCAL to the bubble center, so they ride with it.
 * - Zero React renders per frame: one `SharedValue<number[]>` mutated with
 *   `modify`, each image derives its own x/y.
 * - Same shape physics + optics as `LiquidBubbleLive` (useBubbleShape,
 *   useBubbleOptics, shaders.ts).
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
} from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";
import { useSoapFilmUniforms } from "@/components/soap-film/hooks/useSoapFilmUniforms";
import { SoapFilmShader } from "@/components/soap-film/SoapFilmShader";
import {
  FILM_TOUCH_AGE_INACTIVE,
  FILM_TOUCH_SLOTS,
} from "@/components/soap-film/soapFilmConfig";
import { SPRING_BUBBLE_INFLATE } from "@/lib/animations/constants";
import { getSoapFilmRampImage } from "@/lib/shaders/soapFilm";

import { imageArray } from "../../../assets/Bubbles/128/images.generated";
import {
  INERTIA_DEFAULT,
  STRENGTH_DEFAULT,
  WOBBLE_DEFAULT,
} from "./bubbleModes";
import { BubbleTuningPanel } from "./BubbleTuningPanel";
import { useBubblePinchGesture } from "./hooks/useBubbleGestures";
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

/** Upper bound of the Refract slider, pt (same as LiquidBubbleLive). */
const REFRACT_SLIDER_MAX = 40;

/** Soap-film overlay on at mount (live toggle: Surface tab). */
const SOAP_FILM_ON_DEFAULT = true;

/** Full-screen background the bubble refracts (fit: cover). */
const BACKGROUND_SOURCE = require("../../../assets/liquid-glass-bubble/stars_bg.jpg");

/** Tint hue, rgb 0..1 (same as LiquidBubbleLive). */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

/** Floats per image in the bodies buffer: x, y, vx, vy (local to center). */
const STRIDE = 4;

/** Wall sits this far inside the rim, pt, so images reach the refracting band. */
const WALL_INSET = 4;

/** Energy kept on a wall / image hit (1 = perfectly elastic). */
const RESTITUTION = 0.65;

/** Time constant pulling each image's speed back to its cruise speed, s. */
const SPEED_RELAX_TAU = 1.2;

/** How much of the bubble's acceleration the images feel (slosh), 0..1+. */
const SLOSH = 0.2;

/** dt clamp, s — a stalled frame can't tunnel an image through the wall. */
const DT_MAX = 1 / 30;

/** Per-image size multiplier range (× the scaled base size). */
const IMAGE_SIZE_MUL_MIN = 0.6;
const IMAGE_SIZE_MUL_MAX = 1.5;

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

type BouncingImageProps = {
  source: number;
  index: number;
  /** This image's size multiplier (IMAGE_SIZE_MUL_MIN..MAX). */
  sizeMul: number;
  /** Base image side for the current bubble size, pt. */
  baseSize: DerivedValue<number>;
  bodies: SharedValue<number[]>;
  /**
   * `useBubbleShape`'s `iParams` buffer; `[0..1]` = the center the glass draws
   * this frame. Reading `bubbleX/Y` instead can put the images a frame off
   * the glass (see README → "hooks/useImageBubble.ts").
   */
  paramBuffer: SharedValue<number[]>;
};

// ============================================================================
// Setup helpers (JS, mount only)
// ============================================================================

/** Distinct random picks from `imageArray` (partial Fisher–Yates). */
function pickSources(count: number): number[] {
  const all = imageArray.slice();
  const n = Math.min(count, all.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (all.length - i));
    const swap = all[i];
    all[i] = all[j];
    all[j] = swap;
  }
  return all.slice(0, n);
}

/** Random per-image size multipliers. */
function pickSizeMuls(count: number): number[] {
  return Array.from(
    { length: count },
    () =>
      IMAGE_SIZE_MUL_MIN +
      Math.random() * (IMAGE_SIZE_MUL_MAX - IMAGE_SIZE_MUL_MIN),
  );
}

/**
 * Non-overlapping start positions in a disk, random headings at `speed`.
 * `radii[i]` is image i's collision radius, pt.
 */
function seedBodies(
  bubbleRadius: number,
  radii: number[],
  speed: number,
): number[] {
  const count = radii.length;
  const out = new Array<number>(count * STRIDE).fill(0);
  for (let i = 0; i < count; i++) {
    const wall = Math.max(0, bubbleRadius - WALL_INSET - radii[i]);
    let x = 0;
    let y = 0;
    // Rejection sample; give up after a few tries rather than loop forever
    // (the collision pass separates any leftover overlap on frame one).
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = wall * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      x = r * Math.cos(a);
      y = r * Math.sin(a);
      let clear = true;
      for (let j = 0; j < i; j++) {
        const dx = x - out[j * STRIDE];
        const dy = y - out[j * STRIDE + 1];
        const minD = radii[i] + radii[j];
        if (dx * dx + dy * dy < minD * minD) {
          clear = false;
          break;
        }
      }
      if (clear) break;
    }
    const heading = Math.random() * Math.PI * 2;
    out[i * STRIDE] = x;
    out[i * STRIDE + 1] = y;
    out[i * STRIDE + 2] = speed * Math.cos(heading);
    out[i * STRIDE + 3] = speed * Math.sin(heading);
  }
  return out;
}

// ============================================================================
// Image (one per body — own hooks, so the count isn't a hook-order problem)
// ============================================================================

function BouncingImage({
  source,
  index,
  sizeMul,
  baseSize,
  bodies,
  paramBuffer,
}: BouncingImageProps) {
  const image = useImage(source);
  // Empty until useBubbleShape's first frame → size 0 (nothing drawn).
  const size = useDerivedValue(() =>
    paramBuffer.value.length < 3 ? 0 : baseSize.value * sizeMul,
  );
  const x = useDerivedValue(() => {
    const p = paramBuffer.value;
    return p.length < 3
      ? 0
      : p[0] + bodies.value[index * STRIDE] - size.value / 2;
  });
  const y = useDerivedValue(() => {
    const p = paramBuffer.value;
    return p.length < 3
      ? 0
      : p[1] + bodies.value[index * STRIDE + 1] - size.value / 2;
  });
  if (!image) return null;
  return (
    <Image
      image={image}
      fit="contain"
      x={x}
      y={y}
      width={size}
      height={size}
      sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
    />
  );
}

// ============================================================================
// Component
// ============================================================================

export function BouncingImagesBubble({
  imageCount = 20,
  imageSize = 64,
  imageSpeed = 140,
}: BouncingImagesBubbleProps) {
  const { width, height } = useWindowDimensions();
  const restX = width / 2;
  const restY = height / 2;
  // Default radius; the live one is `scaledRadius` (Size slider / pinch).
  const radius = width / 2;

  // ==========================================================================
  // Bubble drag (translation, not jump-to-finger) + spring home on release
  // ==========================================================================

  const bubbleX = useSharedValue(restX);
  const bubbleY = useSharedValue(restY);
  const startX = useSharedValue(restX);
  const startY = useSharedValue(restY);
  const isActive = useSharedValue(0);
  const velocityX = useSharedValue(0);
  const velocityY = useSharedValue(0);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          "worklet";
          isActive.value = 1;
          startX.value = bubbleX.value;
          startY.value = bubbleY.value;
        })
        .onUpdate((e) => {
          "worklet";
          bubbleX.value = startX.value + e.translationX;
          bubbleY.value = startY.value + e.translationY;
          velocityX.value = e.velocityX;
          velocityY.value = e.velocityY;
        })
        .onFinalize((e) => {
          "worklet";
          isActive.value = 0;
          velocityX.value = e.velocityX;
          velocityY.value = e.velocityY;
        }),
    [bubbleX, bubbleY, startX, startY, isActive, velocityX, velocityY],
  );

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

  useAnimatedReaction(
    () => isActive.value,
    (active, prev) => {
      if (active === 0 && prev === 1) {
        bubbleX.value = withSpring(restX, SPRING_BUBBLE_INFLATE);
        bubbleY.value = withSpring(restY, SPRING_BUBBLE_INFLATE);
      }
    },
    [restX, restY],
  );

  // ==========================================================================
  // Shape physics + optics (shared with LiquidBubbleLive)
  // ==========================================================================

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
  const filmSize = useSharedValue<[number, number]>(FILM_OVERLAY_SIZE);
  // No film touches — every slot inactive.
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

  // React state mounts/unmounts the pass; the SharedValue mirror zeroes the
  // bubble's built-in film on the UI thread.
  const [soapFilmOn, setSoapFilmOn] = useState(SOAP_FILM_ON_DEFAULT);
  const soapFilmOnValue = useSharedValue(SOAP_FILM_ON_DEFAULT ? 1 : 0);
  const toggleSoapFilm = () => {
    const next = !soapFilmOn;
    setSoapFilmOn(next);
    soapFilmOnValue.value = next ? 1 : 0;
  };

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

  // ==========================================================================
  // Bouncing images
  // ==========================================================================

  // Full-screen backdrop; drawn first so the glass refracts it too.
  const background = useImage(BACKGROUND_SOURCE);

  const [sources] = useState(() => pickSources(imageCount));
  const count = sources.length;
  const [sizeMuls] = useState(() => pickSizeMuls(count));
  const [bodies0] = useState(() =>
    seedBodies(
      radius,
      sizeMuls.map((m) => (imageSize * m) / 2),
      imageSpeed,
    ),
  );
  const bodies = useSharedValue<number[]>(bodies0);

  // Everything inside scales with the bubble: s = R / default R.
  const baseSize = useDerivedValue(
    () => imageSize * (scaledRadius.value / radius),
  );
  // Radius the bodies were last laid out for; a change rescales them.
  const lastR = useSharedValue(radius);

  // Bubble velocity last frame, to turn its acceleration into slosh.
  const lastX = useSharedValue(restX);
  const lastY = useSharedValue(restY);
  const lastVx = useSharedValue(0);
  const lastVy = useSharedValue(0);

  useFrameCallback((frameInfo) => {
    "worklet";
    const dt = Math.min(
      (frameInfo.timeSincePreviousFrame ?? 16.7) / 1000,
      DT_MAX,
    );
    if (dt <= 0) return;

    // Bubble velocity/acceleration from its center's motion.
    const cx = bubbleX.value;
    const cy = bubbleY.value;
    const bvx = (cx - lastX.value) / dt;
    const bvy = (cy - lastY.value) / dt;
    // In the bubble's frame, a push on the wall is felt as the opposite push.
    const dvx = (bvx - lastVx.value) * SLOSH;
    const dvy = (bvy - lastVy.value) * SLOSH;
    lastX.value = cx;
    lastY.value = cy;
    lastVx.value = bvx;
    lastVy.value = bvy;

    const relax = 1 - Math.exp(-dt / SPEED_RELAX_TAU);
    const R = scaledRadius.value;
    const scale = R / radius;
    const cruise = imageSpeed * scale;
    const halfBase = (imageSize * scale) / 2;
    // Bubble resized since last frame → rescale the whole layout with it, so
    // images grow/shrink in place instead of piling against the wall.
    const rescale = lastR.value > 0 ? R / lastR.value : 1;
    lastR.value = R;

    bodies.modify((b) => {
      "worklet";
      // Integrate + wall.
      for (let i = 0; i < count; i++) {
        const o = i * STRIDE;
        const ri = halfBase * sizeMuls[i];
        const wall = Math.max(0, R - WALL_INSET - ri);
        if (rescale !== 1) {
          b[o] *= rescale;
          b[o + 1] *= rescale;
          b[o + 2] *= rescale;
          b[o + 3] *= rescale;
        }
        let vx = b[o + 2] - dvx;
        let vy = b[o + 3] - dvy;

        // Relax speed back to cruise (keeps them moving forever, damps slosh).
        const s = Math.sqrt(vx * vx + vy * vy);
        if (s > 1e-3) {
          const k = (s + (cruise - s) * relax) / s;
          vx *= k;
          vy *= k;
        }

        let x = b[o] + vx * dt;
        let y = b[o + 1] + vy * dt;

        const d = Math.sqrt(x * x + y * y);
        if (d > wall && d > 1e-6) {
          const nx = x / d;
          const ny = y / d;
          x = nx * wall;
          y = ny * wall;
          const vn = vx * nx + vy * ny;
          if (vn > 0) {
            vx -= (1 + RESTITUTION) * vn * nx;
            vy -= (1 + RESTITUTION) * vn * ny;
          }
        }

        b[o] = x;
        b[o + 1] = y;
        b[o + 2] = vx;
        b[o + 3] = vy;
      }

      // Image–image: elastic along the contact normal + separation. Mass ∝
      // area (sizeMul²), so a big image shoves a small one, not the reverse.
      for (let i = 0; i < count; i++) {
        const oi = i * STRIDE;
        const mi = sizeMuls[i] * sizeMuls[i];
        for (let j = i + 1; j < count; j++) {
          const oj = j * STRIDE;
          const minDist = halfBase * (sizeMuls[i] + sizeMuls[j]);
          const dx = b[oj] - b[oi];
          const dy = b[oj + 1] - b[oi + 1];
          const d2 = dx * dx + dy * dy;
          if (d2 >= minDist * minDist || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const mj = sizeMuls[j] * sizeMuls[j];
          // Share of the correction each side takes: the lighter moves more.
          const wi = mj / (mi + mj);
          const wj = mi / (mi + mj);
          const overlap = minDist - d;
          b[oi] -= nx * overlap * wi;
          b[oi + 1] -= ny * overlap * wi;
          b[oj] += nx * overlap * wj;
          b[oj + 1] += ny * overlap * wj;
          const rel = (b[oj + 2] - b[oi + 2]) * nx + (b[oj + 3] - b[oi + 3]) * ny;
          if (rel < 0) {
            const imp = (1 + RESTITUTION) * rel;
            b[oi + 2] += imp * wi * nx;
            b[oi + 3] += imp * wi * ny;
            b[oj + 2] -= imp * wj * nx;
            b[oj + 3] -= imp * wj * ny;
          }
        }
      }
      return b;
    });
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          {/* ---- Backdrop (what the bubble refracts), drawn first ---- */}
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
        </Canvas>
      </GestureDetector>

      {SHOW_FPS_OVERLAY && <FpsOverlay dark />}

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
