// ============================================================================
// Pipeline constants
// ============================================================================

/** Floats per particle in the `out` render buffer: x, y, rotation, scale */
export const OUT_STRIDE = 4;

/** Selectable particle counts (HUD chips) */
export const PARTICLE_COUNTS = [1_000, 5_000, 10_000, 50_000, 100_000] as const;

export const DEFAULT_PARTICLE_COUNT = 5_000;

/**
 * Physics buffer capacity. Allocated + initialized once; the active count is
 * a prefix, so raising it adds particles and keeps the existing ones.
 */
export const MAX_PARTICLES = PARTICLE_COUNTS[PARTICLE_COUNTS.length - 1];

/** Sprite edge length in px (square, drawn once to an offscreen surface) */
export const SPRITE_SIZE = 16;

/** How often the HUD pulls mean step ms from the UI runtime */
export const HUD_REPORT_INTERVAL_MS = 500;

/** Default gravitational parameter; inner ring (~0.08 * min side) is ~1 rev/s */
export const DEFAULT_MASS = 1;
