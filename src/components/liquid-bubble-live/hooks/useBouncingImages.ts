/**
 * useBouncingImages — the pictures bouncing inside the bubble.
 *
 * FLOW:
 *   mount (JS)   → distinct random sources, random sizes, non-overlapping
 *                  seeded bodies (bouncingImagesMath.ts)
 *   every frame  → useFrameCallback (UI): bubble accel → slosh · resize →
 *                  rescale · `stepBodies` mutates the bodies buffer in place
 *
 * KEY FEATURES:
 * - Zero React renders per frame: one `SharedValue<number[]>` mutated with
 *   `modify`, each image derives its own x/y.
 * - Everything inside scales with the bubble: s = scaledRadius / radius.
 */

import { useState } from "react";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { imageArray } from "../../../../assets/Bubbles/256/images.generated";
import {
  DT_MAX,
  SLOSH,
  pickSizeMuls,
  pickSources,
  seedBodies,
  stepBodies,
} from "./bouncingImagesMath";

// ============================================================================
// Types
// ============================================================================

export type UseBouncingImagesParams = {
  /** Number of images inside the bubble (≤ imageArray length). */
  imageCount: number;
  /** Base image side at the default bubble size, pt. */
  imageSize: number;
  /** Cruise speed at the default bubble size, pt/s. */
  imageSpeed: number;
  /** Default bubble radius, pt (the scale reference). */
  radius: number;
  /** Rest position of the bubble center, pt (seeds the slosh history). */
  restX: number;
  restY: number;
  /** Live bubble center, pt — its acceleration sloshes the images. */
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  /** Live bubble radius, pt. */
  scaledRadius: SharedValue<number>;
};

export type UseBouncingImagesReturn = {
  sources: number[];
  sizeMuls: number[];
  /** Flat x, y, vx, vy per image, local to the bubble center. */
  bodies: SharedValue<number[]>;
  /** Base image side for the current bubble size, pt. */
  baseSize: DerivedValue<number>;
};

// ============================================================================
// Hook
// ============================================================================

export function useBouncingImages({
  imageCount,
  imageSize,
  imageSpeed,
  radius,
  restX,
  restY,
  bubbleX,
  bubbleY,
  scaledRadius,
}: UseBouncingImagesParams): UseBouncingImagesReturn {
  const [sources] = useState(() => pickSources(imageArray, imageCount));
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
      stepBodies(b, { count, sizeMuls, dt, dvx, dvy, R, halfBase, cruise, rescale });
      return b;
    });
  });

  return { sources, sizeMuls, bodies, baseSize };
}
