/**
 * ParticleRenderer
 *
 * Fixed render path: one Skia `Atlas` draw call for every particle.
 *
 * FLOW:
 * 1. A soft dot sprite is drawn once to an offscreen surface
 * 2. `sprites` (useDerivedValue on `activeCount`) returns the rect view for the
 *    current count from the UI-runtime render pool (renderPool.ts)
 * 3. `transforms` (useDerivedValue on `frame`) converts the first `n` particles
 *    of `out` (x, y, rotation, scale) into pooled RSXforms in place and
 *    returns one of the view's two alternating arrays → `<Atlas>` redraws
 *
 * WHY NOT `useRSXformBuffer`:
 * Its mapper derives dependencies from the modifier's closure, and here it
 * only ran on React renders, never per frame (measured: 6 runs over 181
 * steps). The particles froze at whatever `out` held at mount. Owning the
 * pool and an explicit `frame` dependency makes the update path explicit.
 *
 * KEY FEATURES:
 * - No remount on count change: `activeCount` is a SharedValue, so switching
 *   tiers only picks another cached view; physics state is untouched
 * - No per-frame allocation, and no RSXform/Rect created on JS (the pool grows
 *   on the UI runtime and never shrinks)
 * - `n` is derived from `sprites.value.length`, so transforms and sprites
 *   always have equal length (native drawAtlas throws on a mismatch)
 * - Alternating arrays: Reanimated skips listeners when the value is
 *   identical to the previous one, so the in-place fill returns the other slice
 * - Sprites stay hidden (scale 0) until the driver has allocated the buffers
 * - Center disc is a placeholder for the black hole
 */

import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import {
  Atlas,
  Canvas,
  Circle,
  Skia,
} from "react-native-skia";
import type { SkRect, SkRSXform } from "react-native-skia";

import { OUT_STRIDE, SPRITE_SIZE } from "./constants";
import { getParticleBuffers } from "./particleBuffers";
import { ensureRenderPool, ensureView } from "./renderPool";

// ============================================================================
// Types
// ============================================================================

export type ParticleRendererProps = {
  /** Particles drawn (prefix of the buffer capacity); changing it never remounts */
  activeCount: SharedValue<number>;
  /** Registry key shared with the driver */
  bufferKey: string;
  /** Bumped by the driver every step */
  frame: SharedValue<number>;
  /** Black hole center, canvas coordinates (same SharedValues physics reads) */
  cx: SharedValue<number>;
  cy: SharedValue<number>;
};

// ============================================================================
// Constants
// ============================================================================

// useDerivedValue runs its updater once on the JS thread at mount, where the
// UI-runtime registry does not exist yet: return these instead of building
const EMPTY_RECTS: SkRect[] = [];
const EMPTY_XFS: SkRSXform[] = [];

// ============================================================================
// Component
// ============================================================================

export function ParticleRenderer({
  activeCount,
  bufferKey,
  frame,
  cx,
  cy,
}: ParticleRendererProps) {
  // Captured on JS and passed into the worklets: a value import of Skia inside
  // a worklet re-evaluates on the UI runtime and throws (TurboModule access)
  const skia = Skia;

  const sprite = useMemo(() => {
    // CPU raster surface: MakeOffscreen (GPU) can return null on first mount
    // before the GPU context exists, and useMemo would cache that null
    const surface = Skia.Surface.MakeRaster(SPRITE_SIZE, SPRITE_SIZE);
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

  // Both derived values must depend on `frame`. Their first UI run precedes the
  // driver's allocation, and activeCount alone would never re-run them. The
  // read has to be USED: the worklets plugin strips a bare `void frame.value;`
  // statement, which drops `frame` from the closure (→ never re-runs, frozen).
  // frame 0 = the driver has not stepped yet, so there is nothing to draw.

  // Static rects, one cached view per count tier. After the first allocation
  // it returns the same cached array (=== → no listener notification), so the
  // per-frame cost is one lookup.
  const sprites = useDerivedValue<SkRect[]>(() => {
    const n = activeCount.value;
    if (frame.value === 0 || !getParticleBuffers(bufferKey)) return EMPTY_RECTS;
    const pool = ensureRenderPool(bufferKey);
    return ensureView(pool, n, skia).rects;
  });

  const transforms = useDerivedValue<SkRSXform[]>(() => {
    const rects = sprites.value; // dependency + keeps both lengths equal
    const b = getParticleBuffers(bufferKey);
    if (frame.value === 0 || !b) return EMPTY_XFS;
    const pool = ensureRenderPool(bufferKey);
    const view = ensureView(pool, rects.length, skia);
    const xfs = pool.xfs;
    const out = b.out;
    const n = Math.min(rects.length, b.capacity);
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
    // Same content in both arrays; alternating makes each frame a new value
    pool.flip = pool.flip ? 0 : 1;
    return view.xfs[pool.flip];
  });

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
