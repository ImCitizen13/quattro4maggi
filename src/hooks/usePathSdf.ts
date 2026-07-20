/**
 * usePathSdf — one shared SDF bake per path.
 *
 * Lifts the bake out of SdfLiquidMetalShader so a single PathSdf can feed
 * every consumer of the same shape (metal shader texture, particle targets,
 * bubble physics) instead of each one rasterizing the path privately.
 *
 * FLOW:
 * 1. Parse the source (SVG string or ready SkPath — path wins)
 * 2. Fit it into the canvas with a margin (so the outside field is visible)
 * 3. Bake at device pixel ratio (capped 3×) via bakePathSdf
 *
 * KEY FEATURES:
 * - Memoized per (source, size): one bake per path change
 * - Baking happens where the path changes (e.g. MorphingLiquidMetal), so the
 *   field is ready before the metal shader remounts after a transition
 * - `fitPathToCanvas` exported for consumers that need the same fitting
 *   without a bake
 */

import { bakePathSdf, type PathSdf } from "@/lib/shaders/pathSdf";
import { Skia, type SkPath } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { PixelRatio } from "react-native";

// ============================================================================
// TYPES
// ============================================================================

export type PathSource = {
  /** SVG path string (the "d" attribute) */
  svgPath?: string;
  /** Ready SkPath (e.g. from Skia.Path.MakeFromText). Takes precedence */
  path?: SkPath;
};

/** Fraction of the canvas kept clear around the fitted path */
export const FIT_MARGIN = 0.1;

// ============================================================================
// FITTING
// ============================================================================

/**
 * Fit the source path into a width×height canvas, keeping aspect ratio and
 * FIT_MARGIN around it. `scale` additionally multiplies into bake-pixel
 * space (pass the pixel ratio when the target is a supersampled bake).
 * The input path is copied, never mutated. Returns null for empty sources.
 */
export const fitPathToCanvas = (
  { svgPath, path }: PathSource,
  width: number,
  height: number,
  scale = 1
): SkPath | null => {
  const p = path
    ? path.copy()
    : svgPath
      ? Skia.Path.MakeFromSVGString(svgPath)
      : null;
  if (!p) return null;

  const bounds = p.getBounds();
  if (!bounds.width || !bounds.height) return null;

  const fitScale = Math.min(
    (width * (1 - 2 * FIT_MARGIN)) / bounds.width,
    (height * (1 - 2 * FIT_MARGIN)) / bounds.height
  );
  const offsetX = (width - bounds.width * fitScale) / 2;
  const offsetY = (height - bounds.height * fitScale) / 2;

  p.transform(
    Skia.Matrix()
      .translate(-bounds.x, -bounds.y)
      .scale(fitScale * scale, fitScale * scale)
      .translate(offsetX / fitScale, offsetY / fitScale)
  );
  return p;
};

// ============================================================================
// BAKE CACHE
// ============================================================================

// The bake's EDT runs ~1s at 750² in interpreted Hermes (profiled 2026-07-19:
// raster 10ms / seed 60ms / edt 950ms / pack 70ms), so repeat visits to the
// same shape — logo cycling, StrictMode double-render — must not re-bake.
// Keyed by SVG string + size; SkPath sources (typed text) are new objects per
// keystroke and skip the cache. Entries hold ~11MB (field + F32 texture),
// hence the small cap, evicting oldest-inserted first.
const bakeCache = new Map<string, PathSdf>();
const BAKE_CACHE_MAX = 6;

// ============================================================================
// HOOK
// ============================================================================

/**
 * Bake the source path's signed distance field, memoized per path and size.
 * Returns null while the source is empty/invalid.
 */
export function usePathSdf(
  source: PathSource,
  width: number,
  height: number
): PathSdf | null {
  const { svgPath, path } = source;

  return useMemo(() => {
    const key = svgPath && !path ? `${svgPath}|${width}x${height}` : null;
    if (key) {
      const hit = bakeCache.get(key);
      if (hit) return hit;
    }

    // Bake at device pixel ratio so the field matches the physical pixel
    // grid (capped — beyond 3× the F32 texture cost buys nothing)
    const t0 = performance.now();
    const pixelScale = Math.min(PixelRatio.get(), 3);
    const fitted = fitPathToCanvas({ svgPath, path }, width, height, pixelScale);
    if (!fitted) return null;
    const baked = bakePathSdf(
      fitted,
      width * pixelScale,
      height * pixelScale,
      pixelScale
    );
    console.log(
      `[usePathSdf] bake ${Math.round(width * pixelScale)}x${Math.round(height * pixelScale)}: ${(performance.now() - t0).toFixed(1)}ms`
    );

    if (key && baked) {
      if (bakeCache.size >= BAKE_CACHE_MAX) {
        const oldest = bakeCache.keys().next().value;
        if (oldest !== undefined) bakeCache.delete(oldest);
      }
      bakeCache.set(key, baked);
    }
    return baked;
  }, [svgPath, path, width, height]);
}
