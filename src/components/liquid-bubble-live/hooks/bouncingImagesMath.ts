/**
 * BouncingImagesBubble — physics + setup math for the images inside the bubble.
 * No React: mount-time picks/seeding (JS) and the per-frame `stepBodies`
 * worklet (UI thread).
 *
 * The bodies buffer is a flat `number[]`, STRIDE floats per image:
 * x, y, vx, vy (local to the bubble center).
 */

// ============================================================================
// Constants
// ============================================================================

/** Floats per image in the bodies buffer: x, y, vx, vy (local to center). */
export const STRIDE = 4;

/** Wall sits this far inside the rim, pt, so images reach the refracting band. */
export const WALL_INSET = 4;

/** Energy kept on a wall / image hit (1 = perfectly elastic). */
export const RESTITUTION = 0.65;

/** Time constant pulling each image's speed back to its cruise speed, s. */
export const SPEED_RELAX_TAU = 1.2;

/** How much of the bubble's acceleration the images feel (slosh), 0..1+. */
export const SLOSH = 0.2;

/** dt clamp, s — a stalled frame can't tunnel an image through the wall. */
export const DT_MAX = 1 / 30;

/** Per-image size multiplier range (× the scaled base size). */
export const IMAGE_SIZE_MUL_MIN = 0.6;
export const IMAGE_SIZE_MUL_MAX = 2;

// ============================================================================
// Types
// ============================================================================

export type StepBodiesParams = {
  /** Number of bodies in the buffer. */
  count: number;
  /** Per-image size multipliers (mass ∝ sizeMul²). */
  sizeMuls: readonly number[];
  /** Frame time, s (already clamped). */
  dt: number;
  /** Slosh: the bubble's acceleration × SLOSH, subtracted from every velocity. */
  dvx: number;
  dvy: number;
  /** Current bubble radius, pt. */
  R: number;
  /** Half the base image side at the current bubble size, pt. */
  halfBase: number;
  /** Cruise speed at the current bubble size, pt/s. */
  cruise: number;
  /** Bubble resize factor since last frame (1 = unchanged). */
  rescale: number;
};

// ============================================================================
// Setup helpers (JS, mount only)
// ============================================================================

/** Distinct random picks from `pool` (partial Fisher–Yates). Pool is not mutated. */
export function pickSources<T>(pool: readonly T[], count: number): T[] {
  const all = pool.slice();
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
export function pickSizeMuls(count: number): number[] {
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
export function seedBodies(
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
// Per-frame step
// ============================================================================

/**
 * Advance every body by one frame, mutating `b` in place: rescale · slosh ·
 * speed relax · move · round-wall bounce, then image–image collisions.
 */
export function stepBodies(b: number[], p: StepBodiesParams): void {
  "worklet";
  const { count, sizeMuls, dt, dvx, dvy, R, halfBase, cruise, rescale } = p;
  const relax = 1 - Math.exp(-dt / SPEED_RELAX_TAU);

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
}
