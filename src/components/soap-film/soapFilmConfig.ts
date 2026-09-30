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
export type FilmColorMode = "ramp" | "physical" | "bubble";

/** `uMode` value in `SOAP_COLOR` for each color mode. */
export const FILM_MODE_UNIFORM: Record<FilmColorMode, 0 | 1 | 2> = {
  ramp: 0,
  physical: 1,
  bubble: 2,
};

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

/**
 * Gravity stratification: blends the noise film toward horizontal thickness
 * bands (thin top, thick bottom) whose edges the flow bends into plumes.
 * TUNE: 0 pure noise film · 0.6 banded with turbulent edges · 1 pure bands.
 */
export const FILM_DRAINAGE_DEFAULT = 0.6;
export const FILM_DRAINAGE_MIN = 0;
export const FILM_DRAINAGE_MAX = 1;

/** Band geometry: 0 horizontal stripes, 1 rings around the apex (bubble top). */
export const FILM_BAND_SHAPE_DEFAULT = 1;

/**
 * Base pattern frequency — the size of the marbling itself (eddy size is the
 * layer frequencies). TUNE: 3 broad blobs · 8 photo-like · 15 fine speckle.
 */
export const FILM_GRAIN_DEFAULT = 6;
export const FILM_GRAIN_MIN = 1;
export const FILM_GRAIN_MAX = 15;

// ============================================================================
// Flow — vortices (curl generator only)
// ============================================================================

/** `(count, spin, radius, cycle)` — same tuple shape as `FilmLayer`. */
export type FilmVortex = FilmLayer;

/**
 * Drifting vortices that wind the film into spiral arms over one `cycle`,
 * crossfaded between two half-cycle-offset copies so winding never runs away.
 * count 0..3 · spin rad/s at the core · radius normalized (gaussian) · cycle s.
 * TUNE: peak twist at the core is `spin * cycle` rad — 1.2 * 6 ≈ 1.1 turns.
 * Longer cycle = deeper spirals but more visible ghosting at the crossfade.
 */
export const FILM_VORTEX_DEFAULT: FilmVortex = [2, 1.2, 0.25, 6];

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

/**
 * "bubble" = the cosine film palette from liquid-bubble-live's shaders.ts,
 * so this film matches that bubble once composited into it.
 */
export const FILM_MODE_DEFAULT: FilmColorMode = "bubble";
export const FILM_GENERATOR_DEFAULT: FilmGenerator = "curl";

/**
 * Maps thickness [0,1] to nm (physical mode) or palette wraps (ramp and
 * bubble modes).
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

/** Film alpha — lets whatever is underneath show through. TUNE: 0.3 tint · 1 opaque. */
export const FILM_OPACITY_DEFAULT = 1.0;

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
