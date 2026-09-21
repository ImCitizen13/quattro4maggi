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
 * - Radius is `width / 2`: the bubble spans the screen width.
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

import { imageArray } from "../../../assets/Bubbles/256/images.generated";
import {
  INERTIA_DEFAULT,
  STRENGTH_DEFAULT,
  WOBBLE_DEFAULT,
} from "./bubbleModes";
import { BubbleTuningPanel } from "./BubbleTuningPanel";
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

/** Tint hue, rgb 0..1 (same as LiquidBubbleLive). */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

/** Floats per image in the bodies buffer: x, y, vx, vy (local to center). */
const STRIDE = 4;

/** Wall sits this far inside the rim, pt, so images reach the refracting band. */
const WALL_INSET = 4;

/** Energy kept on a wall / image hit (1 = perfectly elastic). */
const RESTITUTION = 0.95;

/** Time constant pulling each image's speed back to its cruise speed, s. */
const SPEED_RELAX_TAU = 1.2;

/** How much of the bubble's acceleration the images feel (slosh), 0..1+. */
const SLOSH = 1;

/** dt clamp, s — a stalled frame can't tunnel an image through the wall. */
const DT_MAX = 1 / 30;

// ============================================================================
// Types
// ============================================================================

export type BouncingImagesBubbleProps = {
  /** Number of images inside the bubble (≤ imageArray length). */
  imageCount?: number;
  /** Image side, pt. */
  imageSize?: number;
  /** Cruise speed each image relaxes back to, pt/s. */
  imageSpeed?: number;
};

type BouncingImageProps = {
  source: number;
  index: number;
  size: number;
  bodies: SharedValue<number[]>;
  centerX: SharedValue<number>;
  centerY: SharedValue<number>;
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

/** Non-overlapping start positions in a disk, random headings at `speed`. */
function seedBodies(
  count: number,
  wallRadius: number,
  imageRadius: number,
  speed: number,
): number[] {
  const out = new Array<number>(count * STRIDE).fill(0);
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    // Rejection sample; give up after a few tries rather than loop forever
    // (the collision pass separates any leftover overlap on frame one).
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = wallRadius * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      x = r * Math.cos(a);
      y = r * Math.sin(a);
      let clear = true;
      for (let j = 0; j < i; j++) {
        const dx = x - out[j * STRIDE];
        const dy = y - out[j * STRIDE + 1];
        if (dx * dx + dy * dy < 4 * imageRadius * imageRadius) {
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
  size,
  bodies,
  centerX,
  centerY,
}: BouncingImageProps) {
  const image = useImage(source);
  const half = size / 2;
  const x = useDerivedValue(
    () => centerX.value + bodies.value[index * STRIDE] - half,
  );
  const y = useDerivedValue(
    () => centerY.value + bodies.value[index * STRIDE + 1] - half,
  );
  if (!image) return null;
  return (
    <Image image={image} fit="contain" x={x} y={y} width={size} height={size} />
  );
}

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
  const radius = width / 2;
  const imageRadius = imageSize / 2;
  const wallRadius = Math.max(0, radius - WALL_INSET - imageRadius);

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

  const scaledRadius = useSharedValue(radius);
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

  const [sources] = useState(() => pickSources(imageCount));
  const count = sources.length;
  const bodies = useSharedValue<number[]>(
    seedBodies(count, wallRadius, imageRadius, imageSpeed),
  );

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
    const minDist = 2 * imageRadius;

    bodies.modify((b) => {
      "worklet";
      // Integrate + wall.
      for (let i = 0; i < count; i++) {
        const o = i * STRIDE;
        let vx = b[o + 2] - dvx;
        let vy = b[o + 3] - dvy;

        // Relax speed back to cruise (keeps them moving forever, damps slosh).
        const s = Math.sqrt(vx * vx + vy * vy);
        if (s > 1e-3) {
          const k = (s + (imageSpeed - s) * relax) / s;
          vx *= k;
          vy *= k;
        }

        let x = b[o] + vx * dt;
        let y = b[o + 1] + vy * dt;

        const d = Math.sqrt(x * x + y * y);
        if (d > wallRadius && d > 1e-6) {
          const nx = x / d;
          const ny = y / d;
          x = nx * wallRadius;
          y = ny * wallRadius;
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

      // Image–image: equal-mass elastic along the contact normal + separation.
      for (let i = 0; i < count; i++) {
        const oi = i * STRIDE;
        for (let j = i + 1; j < count; j++) {
          const oj = j * STRIDE;
          const dx = b[oj] - b[oi];
          const dy = b[oj + 1] - b[oi + 1];
          const d2 = dx * dx + dy * dy;
          if (d2 >= minDist * minDist || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const push = (minDist - d) / 2;
          b[oi] -= nx * push;
          b[oi + 1] -= ny * push;
          b[oj] += nx * push;
          b[oj + 1] += ny * push;
          const rel = (b[oj + 2] - b[oi + 2]) * nx + (b[oj + 3] - b[oi + 3]) * ny;
          if (rel < 0) {
            const imp = ((1 + RESTITUTION) / 2) * rel;
            b[oi + 2] += imp * nx;
            b[oi + 3] += imp * ny;
            b[oj + 2] -= imp * nx;
            b[oj + 3] -= imp * ny;
          }
        }
      }
      return b;
    });
  });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Canvas style={[styles.canvas, { width, height }]}>
          {/* ---- Backdrop (what the bubble refracts), drawn first ---- */}
          <Fill color="#ffffff" />

          {sources.map((source, i) => (
            <BouncingImage
              key={i}
              source={source}
              index={i}
              size={imageSize}
              bodies={bodies}
              centerX={bubbleX}
              centerY={bubbleY}
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
    backgroundColor: "#ffffff",
  },
  canvas: {
    backgroundColor: "#ffffff",
  },
});
