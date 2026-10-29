/**
 * renderPool
 *
 * A growing pool of Skia RSXform/Rect host objects plus cached per-count views,
 * stored in a per-runtime registry on the UI runtime.
 *
 * WHY A POOL
 *   Atlas draws `array.length` sprites, so each count tier needs an array of
 *   exactly that length. Rebuilding host objects on JS and copying them to the
 *   UI runtime on every count change caused a stall and a blank frame. Here
 *   the objects are created once, on the UI runtime, and shared by all tiers.
 *
 * FLOW
 *   renderer (worklet) → ensureRenderPool(key) → pool for the pipeline
 *   renderer (worklet) → ensureView(pool, count, skia)
 *                        → grows the pool to `count` (push only, never shrinks)
 *                        → caches `views[count]` (slices = references to the
 *                          same host objects, so every view sees every write)
 *   renderer (worklet) → fills pool.xfs, returns views[count].xfs[flip]
 *
 * WHY TWO XFORM ARRAYS PER VIEW
 *   Reanimated skips listeners when a derived value returns the same array
 *   it returned last time. The fill mutates host objects in place, so the
 *   renderer alternates between two slices of identical content to make each
 *   frame a "new" value and notify Atlas.
 *
 * SKIA IS PASSED IN, NEVER IMPORTED
 *   A value import of react-native-skia inside a worklet re-evaluates on the
 *   UI runtime and throws "Accessing TurboModules is not allowed on Worklet
 *   Runtimes". The JS side captures `Skia` and hands it in as `skia`; only
 *   types are imported here.
 */

import type { Skia, SkRect, SkRSXform } from "react-native-skia";

import { SPRITE_SIZE } from "./constants";

// ============================================================================
// Types
// ============================================================================

/** The Skia factory object, captured on JS and passed to the worklets */
export type SkiaApi = typeof Skia;

/** Per-count slices of the pool (references, not copies of the objects) */
export type RenderView = {
  /** Two arrays with identical content, alternated per frame */
  xfs: [SkRSXform[], SkRSXform[]];
  rects: SkRect[];
};

export type RenderPool = {
  xfs: SkRSXform[];
  rects: SkRect[];
  views: Record<number, RenderView>;
  /** Which of `RenderView.xfs` was returned last */
  flip: 0 | 1;
};

type PoolRegistry = Record<string, RenderPool>;

type PoolGlobal = typeof globalThis & {
  __renderPools?: PoolRegistry;
};

// ============================================================================
// Registry (per runtime)
// ============================================================================

/** The pool for `key` on the calling runtime, created empty if missing. */
export function ensureRenderPool(key: string): RenderPool {
  "worklet";
  const g = globalThis as PoolGlobal;
  const registry = (g.__renderPools ??= {});
  return (registry[key] ??= { xfs: [], rects: [], views: {}, flip: 0 });
}

// ============================================================================
// Views
// ============================================================================

/** View of exactly `count` objects; grows the pool and caches on first use. */
export function ensureView(
  pool: RenderPool,
  count: number,
  skia: SkiaApi
): RenderView {
  "worklet";
  for (let i = pool.xfs.length; i < count; i++) {
    pool.xfs.push(skia.RSXform(0, 0, 0, 0));
    pool.rects.push(skia.XYWHRect(0, 0, SPRITE_SIZE, SPRITE_SIZE));
  }
  // Growing never invalidates cached views: they reference existing objects
  return (pool.views[count] ??= {
    xfs: [pool.xfs.slice(0, count), pool.xfs.slice(0, count)],
    rects: pool.rects.slice(0, count),
  });
}
