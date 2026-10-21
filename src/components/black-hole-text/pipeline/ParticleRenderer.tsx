/**
 * ParticleRenderer
 *
 * Fixed render path: one Skia `Atlas` draw call for every particle.
 *
 * FLOW:
 * 1. A soft dot sprite is drawn once to an offscreen surface
 * 2. `useAnimatedReaction` on `frame` (UI thread) converts the first `count`
 *    particles of `out` (x, y, rotation, scale) into RSXforms in place
 * 3. `transforms.modify(…, true)` notifies Skia → `<Atlas>` redraws
 *
 * WHY NOT `useRSXformBuffer`:
 * Its mapper derives dependencies from the modifier's closure, and here it
 * only ran on React renders, never per frame (measured: 6 runs over 181
 * steps). The particles froze at whatever `out` held at mount. Owning the
 * buffer and an explicit `frame` reaction makes the update path explicit.
 *
 * KEY FEATURES:
 * - No per-frame allocation (RSXform/Rect host objects are reused)
 * - Reads the UI-runtime buffers by `bufferKey` (see particleBuffers.ts);
 *   sprites stay hidden (scale 0) until the driver has allocated them
 * - Remount (key) on count change only rebuilds the transform buffer;
 *   physics state lives in the registry and is untouched
 * - Center disc is a placeholder for the black hole
 */

import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { makeMutable, useAnimatedReaction } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import {
  Atlas,
  Canvas,
  Circle,
  Skia,
  useRectBuffer,
} from "react-native-skia";

import { OUT_STRIDE, SPRITE_SIZE } from "./constants";
import { getParticleBuffers } from "./particleBuffers";

// ============================================================================
// Types
// ============================================================================

export type ParticleRendererProps = {
  /** Particles drawn (prefix of the buffer capacity) */
  count: number;
  /** Registry key shared with the driver */
  bufferKey: string;
  /** Bumped by the driver every step */
  frame: SharedValue<number>;
  /** Black hole center, canvas coordinates (same SharedValues physics reads) */
  cx: SharedValue<number>;
  cy: SharedValue<number>;
};

// ============================================================================
// Component
// ============================================================================

export function ParticleRenderer({
  count,
  bufferKey,
  frame,
  cx,
  cy,
}: ParticleRendererProps) {
  const sprite = useMemo(() => {
    // CPU raster surface: MakeOffscreen (GPU) can return null on first mount
    // before the GPU context exists, and useMemo would cache that null
    const surface = Skia.Surface.Make(SPRITE_SIZE, SPRITE_SIZE);
    if (!surface) return null;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color("#ffe9c9"));
    const c = SPRITE_SIZE / 2;
    paint.setAlphaf(0.3); // halo
    surface.getCanvas().drawCircle(c, c, c - 1, paint);
    paint.setAlphaf(1); // core
    surface.getCanvas().drawCircle(c, c, c * 0.5, paint);
    // Raster snapshot: already CPU-backed, drawable in the on-screen context
    return surface.makeImageSnapshot();
  }, []);

  // Static: every sprite samples the whole dot, so one mapper run is enough
  const sprites = useRectBuffer(count, (r) => {
    "worklet";
    r.setXYWH(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  });

  // Hidden (scale 0) until the first reaction fills them
  const transforms = useMemo(
    () =>
      makeMutable(
        Array.from({ length: count }, () => Skia.RSXform(0, 0, 0, 0))
      ),
    [count]
  );

  useAnimatedReaction(
    () => frame.value,
    () => {
      const b = getParticleBuffers(bufferKey);
      if (!b) return;
      const xfs = transforms.value;
      const out = b.out;
      const n = Math.min(xfs.length, b.capacity);
      const h = SPRITE_SIZE / 2;
      for (let i = 0; i < n; i++) {
        const o = i * OUT_STRIDE;
        const rot = out[o + 2];
        const s = out[o + 3];
        const scos = s * Math.cos(rot);
        const ssin = s * Math.sin(rot);
        // Rotate/scale about the sprite center, then place it at (x, y)
        xfs[i].set(
          scos,
          ssin,
          out[o] - (scos * h - ssin * h),
          out[o + 1] - (ssin * h + scos * h)
        );
      }
      // Same array, mutated in place: force listeners so Atlas redraws
      transforms.modify((v) => {
        "worklet";
        return v;
      }, true);
    }
  );

  if (!sprite) return null;

  return (
    <Canvas style={styles.canvas}>
      <Circle cx={cx} cy={cy} r={18} color="#000" />
      <Circle cx={cx} cy={cy} r={18} color="#ffffff22" style="stroke" strokeWidth={1} />
      <Atlas image={sprite} sprites={sprites} transforms={transforms} />
    </Canvas>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
});
