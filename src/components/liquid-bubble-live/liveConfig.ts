/**
 * Liquid Bubble Live — demo-local constants (backdrop clip, background look).
 * Design notes: README.md → "liveConfig.ts".
 */

// ============================================================================
// Optics
// ============================================================================

/**
 * Starting `iRefract`: max refraction sample offset at the rim, points. The
 * backdrop is the whole canvas, so unlike the still-image demo it isn't capped
 * at 9; the only hard bound is the clip, padded by this value.
 *
 * TUNE: 8 flat glass · 30 fairground mirror. Clip area grows ~`(R + this + CLIP_SLACK)²`.
 */
export const LIVE_REFRACT = 18;

// ============================================================================
// Backdrop clip
// ============================================================================

/**
 * Extra points on the shape bbox for the `BackdropFilter` clip. The clip bounds
 * which pixels are READABLE and the rim samples outward, so
 * clip half-extent = bbox half-extent + refract + this slack (covers physics vs
 * render frame rounding). Under-padding bites a transparent notch at the rim.
 */
export const CLIP_SLACK = 2;

// ============================================================================
// Live background
// ============================================================================

/** Scroll rate of the diagonal colour bands, band-widths per second (kept slow on purpose). */
export const BG_SCROLL_RATE = 0.09;

/** Diagonal direction of the bands, as a `(x, y)` gradient in screen heights. */
export const BG_BAND_DIR_X = 1.6;
export const BG_BAND_DIR_Y = 1.1;

/** Grid cells per screen height, and how fast the grid drifts (cells/second). */
export const BG_GRID_DENSITY = 6;
export const BG_GRID_DRIFT = 0.05;

/** Grid line weight, in grid-cell fractions, and its blend strength. */
export const BG_GRID_WIDTH = 0.02;
export const BG_GRID_STRENGTH = 0.18;
