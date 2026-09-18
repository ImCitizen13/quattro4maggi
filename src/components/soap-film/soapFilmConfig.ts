/**
 * Soap Film — demo-local constants (flow layers, color, shape, touch).
 * Design notes: README.md → "soapFilmConfig.ts".
 *
 * No React, no Skia, no Reanimated imports here — safe to read from a
 * worklet or from plain TS, same convention as `liquid-bubble-live/liveConfig.ts`.
 */

// ============================================================================
// Types
// ============================================================================

/** One curl-noise flow layer: (frequency, speed, rotationAngle, weight). */
export type FilmLayer = [
  frequency: number,
  speed: number,
  rotationAngle: number,
  weight: number,
];

export type FilmGenerator = "curl" | "sine";
export type FilmColorMode = "ramp" | "physical";

// ============================================================================
// Flow — curl-noise layers
// ============================================================================

/**
 * Three flow layers, each `(frequency, speed, rotationAngle, weight)`.
 * Layer 0 is low-frequency and slow (the big lazy swirls); layers 1-2 are
 * higher frequency, faster, and rotated to different angles so the field
 * never reads as one tiled pattern.
 *
 * TUNE: raise `weight` on layer 2 for busier, more turbulent film; raise
 * layer 0's `speed` for a faster overall drift.
 */
export const FILM_LAYER_0_DEFAULT: FilmLayer = [1.2, 0.05, 0.0, 1.0];
export const FILM_LAYER_1_DEFAULT: FilmLayer = [2.6, 0.12, 1.1, 0.6];
export const FILM_LAYER_2_DEFAULT: FilmLayer = [5.0, 0.22, -0.7, 0.35];

/** Global multiplier on the whole velocity field. TUNE: 0 freezes the film. */
export const FILM_SWIRL_DEFAULT = 1.0;
export const FILM_SWIRL_MIN = 0;
export const FILM_SWIRL_MAX = 3;

/** Domain offset so re-mounts don't all look identical. TUNE: any float. */
export const FILM_SEED_DEFAULT = 3.7;

/** Gravity: thins the film near the top. TUNE: 0 flat, 0.5 heavy drainage. */
export const FILM_DRAINAGE_DEFAULT = 0.12;
export const FILM_DRAINAGE_MIN = 0;
export const FILM_DRAINAGE_MAX = 0.5;

// ============================================================================
// Flow — sine-warp generator (alternative to curl)
// ============================================================================

export const FILM_SINE_FREQ_DEFAULT = 2.2;
export const FILM_SINE_SPEED_A_DEFAULT = 0.35;
export const FILM_SINE_SPEED_B_DEFAULT = 0.28;

// ============================================================================
// Touch disturbance
// ============================================================================

/** Ring buffer size — must match `uTouch[8]` / `uTouchAge[8]` in soapFilm.ts. */
export const FILM_TOUCH_SLOTS = 8;

/** Decay time constant for a touch impulse, seconds. TUNE: 0.2 snappy · 4 lingering. */
export const FILM_TOUCH_TAU_DEFAULT = 1.4;
export const FILM_TOUCH_TAU_MIN = 0.2;
export const FILM_TOUCH_TAU_MAX = 4;

/** Gaussian falloff radius around a touch impulse, normalized units. */
export const FILM_TOUCH_RADIUS_DEFAULT = 0.18;

/** Age (seconds) beyond which a slot is treated as inactive; keeps `exp()` bounded. */
export const FILM_TOUCH_AGE_INACTIVE = 30;

/** Clamp applied to raw gesture velocity before it reaches the shader, pt/s. */
export const FILM_TOUCH_VELOCITY_CLAMP = 2400;

// ============================================================================
// Color
// ============================================================================

export const FILM_MODE_DEFAULT: FilmColorMode = "ramp";
export const FILM_GENERATOR_DEFAULT: FilmGenerator = "curl";

/**
 * Maps thickness [0,1] to nm (physical mode) or ramp wraps (ramp mode).
 * TUNE: ramp mode reads well around 2-6 (a few full wraps across the shape);
 * physical mode reads well around 300-1200 (nm), where interference bands
 * become visible.
 */
export const FILM_THICKNESS_SCALE_DEFAULT = 3.0;
export const FILM_THICKNESS_SCALE_MIN = 0.5;
export const FILM_THICKNESS_SCALE_MAX = 12;

/** View-angle cosine; 1 = looking straight on (flat screen default). */
export const FILM_COS_THETA_DEFAULT = 1.0;
export const FILM_COS_THETA_MIN = 0.2;
export const FILM_COS_THETA_MAX = 1;

export const FILM_INTENSITY_DEFAULT = 1.0;
export const FILM_INTENSITY_MIN = 0.2;
export const FILM_INTENSITY_MAX = 2;

// ============================================================================
// Shape — squircle
// ============================================================================

/** Squircle half-size at scale 1, in points. */
export const SQUIRCLE_BASE_SIZE = 160;

export const SQUIRCLE_SCALE_DEFAULT = 1.0;
export const SQUIRCLE_SCALE_MIN = 1.0;
export const SQUIRCLE_SCALE_MAX = 2.5;

/** Superellipse exponent `n` in `|x|^n + |y|^n = 1`. Higher = squarer corners. */
export const SQUIRCLE_EXPONENT_DEFAULT = 4.5;
export const SQUIRCLE_EXPONENT_MIN = 2;
export const SQUIRCLE_EXPONENT_MAX = 8;

/** Vertex count sampled around the superellipse — enough to look smooth at max scale. */
export const SQUIRCLE_PATH_SEGMENTS = 128;
