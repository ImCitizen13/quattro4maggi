/**
 * Metaball site placement — where the balls live inside a baked path field.
 *
 * The first real consumer of PathSdf's JS-side `sample` API. Given a field, it
 * chooses N ball centers that sit *inside* the silhouette (so the rest union is
 * a no-op) and are spread out by a greedy Poisson pick ranked on depth, then
 * sizes each ball to the local wall clearance and precomputes a per-ball
 * dispersion vector for the tap burst.
 *
 * All coordinates are in FIELD PIXELS (texel space) — the same space the
 * shader unions in, so sites feed `iBalls` after adding the live dispersion
 * offset. Divide by `sdf.scale` only if you need logical points.
 *
 * FLOW:
 * 1. Stride-scan the field for inside candidates (depth = distance to wall)
 * 2. Greedy Poisson: repeatedly take the deepest candidate that is at least
 *    `separation` from every already-picked site
 * 3. radius = min(rMax, wall clearance) so balls never poke out at rest
 * 4. dispersion dir = outward from the field centroid; mag scales with the
 *    shape's reach so balls clearly emerge on tap
 */

import { type PathSdf } from "@/lib/shaders/pathSdf";

// ============================================================================
// TYPES
// ============================================================================

/** One metaball at rest, in field-pixel coordinates */
export type MetaballSite = {
  /** Rest center X (field px) */
  cx: number;
  /** Rest center Y (field px) */
  cy: number;
  /** Radius (field px) — the local wall clearance, capped at rMax */
  r: number;
  /** Outward unit dispersion direction X */
  dirX: number;
  /** Outward unit dispersion direction Y */
  dirY: number;
  /** Dispersion travel at full burst (field px) */
  mag: number;
};

export type MetaballSitesOptions = {
  /** How many balls to place @default 16 */
  count?: number;
  /** Hard cap on ball radius as a fraction of the deepest inside distance @default 0.7 */
  radiusCap?: number;
  /** Min center separation as a fraction of the deepest inside distance @default 0.9 */
  separationScale?: number;
  /** Full-burst travel as a multiple of the deepest inside distance @default 1.2 */
  dispersionScale?: number;
  /** Grid stride for candidate scanning, in field px @default 4 */
  stride?: number;
};

// ============================================================================
// PLACEMENT
// ============================================================================

/**
 * Pick up to `count` metaball sites inside the field. Returns fewer if the
 * shape is too small/thin to fit them at the requested separation. Empty for
 * a null field.
 */
export function computeMetaballSites(
  sdf: PathSdf | null,
  options: MetaballSitesOptions = {}
): MetaballSite[] {
  if (!sdf) return [];

  const {
    count = 16,
    radiusCap = 0.7,
    separationScale = 0.9,
    dispersionScale = 1.2,
    stride = 4,
  } = options;

  const { field, width, height, maxInside } = sdf;

  // --- Centroid of the inside region (dispersion radiates from here) ---------
  let sumX = 0;
  let sumY = 0;
  let insideCount = 0;
  for (let y = 0; y < height; y += stride) {
    const row = y * width;
    for (let x = 0; x < width; x += stride) {
      if (field[row + x] > 0) {
        sumX += x;
        sumY += y;
        insideCount++;
      }
    }
  }
  if (insideCount === 0) return [];
  const centroidX = sumX / insideCount;
  const centroidY = sumY / insideCount;

  // --- Candidate list: every inside grid point, ranked by depth --------------
  const candidates: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < height; y += stride) {
    const row = y * width;
    for (let x = 0; x < width; x += stride) {
      const d = field[row + x];
      if (d > 1) candidates.push({ x, y, d });
    }
  }
  candidates.sort((a, b) => b.d - a.d);

  // --- Greedy Poisson pick by depth ------------------------------------------
  const separation = Math.max(2, maxInside * separationScale);
  const sepSq = separation * separation;
  const rMax = maxInside * radiusCap;
  const mag = maxInside * dispersionScale;

  const picked: MetaballSite[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    let ok = true;
    for (const p of picked) {
      const dx = c.x - p.cx;
      const dy = c.y - p.cy;
      if (dx * dx + dy * dy < sepSq) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // Outward from centroid; a site sitting exactly on it disperses upward
    let dirX = c.x - centroidX;
    let dirY = c.y - centroidY;
    const len = Math.hypot(dirX, dirY);
    if (len < 1e-3) {
      dirX = 0;
      dirY = -1;
    } else {
      dirX /= len;
      dirY /= len;
    }

    picked.push({
      cx: c.x,
      cy: c.y,
      r: Math.min(rMax, c.d),
      dirX,
      dirY,
      mag,
    });
  }

  return picked;
}

// ============================================================================
// UNIFORM PACKING
// ============================================================================

/** Fixed uniform array length — must match `iBalls[16]` in the shader */
export const MAX_BALLS = 16;

/**
 * Pack sites into the flat `float4[16]` the shader expects, applying a live
 * dispersion `t` (0 = rest, 1 = full burst) and a `spread` multiplier on the
 * travel distance. Runs on the UI thread inside the uniforms worklet, so it
 * stays allocation-light and branch-free.
 *
 * `spread` is the lever for "sticky" bursts: smaller = balls stay closer, so
 * the shader's smooth-max can still bridge the gaps into necks; larger = they
 * fly far apart and detach. It scales linearly with the precomputed `mag`.
 *
 * `ballScale` multiplies every ball's radius (size). Rest is unaffected — the
 * ball loop is off at rest — so oversizing never breaks the resting silhouette.
 *
 * Each ball = [cx, cy, radius, active]. Inactive slots are zeroed with
 * active = 0, which the shader forces fully negative in the union.
 */
export function packBalls(
  sites: MetaballSite[],
  dispersion: number,
  spread = 1,
  ballScale = 1
): number[] {
  "worklet";
  const out: number[] = [];
  for (let i = 0; i < MAX_BALLS; i++) {
    const s = sites[i];
    if (s) {
      const travel = dispersion * s.mag * spread;
      out.push(s.cx + s.dirX * travel, s.cy + s.dirY * travel, s.r * ballScale, 1);
    } else {
      out.push(0, 0, 0, 0);
    }
  }
  return out;
}
