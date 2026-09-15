/**
 * Liquid Bubble Live — demo-local constants (phase 12B, Skia route)
 *
 * Everything the harmonic bubble itself needs — mode springs, amplitudes,
 * `REFRACT`, `FILM`, `BBOX_PAD` — is imported from
 * `../liquid-glass-bubble/bubbleModes.ts` and deliberately NOT duplicated
 * here: the physics is renderer-independent and the still-image demo owns its
 * tuning. This file holds only what is specific to refracting LIVE content:
 * the backdrop clip padding and the background scene's own look/speed.
 *
 * No React, no Skia imports — safe to read from a worklet.
 */

// ============================================================================
// Optics
// ============================================================================

/**
 * `iRefract` for this demo: maximum refraction sample offset at the rim, in
 * points. Overrides the still-image demo's `REFRACT` (9) rather than importing
 * it, because the constraint that produced that number does not exist here.
 *
 * Phase 10B lowered `REFRACT` from 14 to 9 for a reason specific to the
 * `<ImageShader>`: its rect is only `2·R·IMAGE_RECT_SCALE` across, so at the
 * rest radius a 14 pt offset sampled past the photo's edge and `tx="clamp"`
 * returned repeated edge pixels — a smeared dark ring around a squeezed face.
 * The backdrop here is the entire live canvas, so the rim can reach a long way
 * outward and still land on real content; the only hard bound is the clip,
 * which is padded by exactly this value.
 *
 * 18 pt is 30% of the rest radius (60) and 11% of the max (160) — a bend
 * that is legible while the bubble is small, which is where it spends most of
 * its time and where the point of this demo (the background visibly moving
 * THROUGH the lens) has to read.
 *
 * TUNE: refraction. 8 flat glass · 30 fairground mirror. Every point costs
 * backdrop clip area — the clip pads by this, and the pad is on the radius, so
 * the snapshot area grows roughly as `(R + this + CLIP_SLACK)²`.
 */
export const LIVE_REFRACT = 18;

// ============================================================================
// Backdrop clip
// ============================================================================

/**
 * Extra points added to the shape bbox when building the `BackdropFilter`'s
 * `clip` rect — SEPARATE from `BBOX_PAD`, and for the opposite reason.
 *
 * `BBOX_PAD` (2 pt, AA feather) answers "where can alpha be non-zero?". It was
 * deliberately shrunk in the 8B follow-up because
 * `alpha = smoothstep(-0.75, 0.75, r - dist)` depends on `r` and `dist` only,
 * so nothing is ever DRAWN past `r + 0.75`.
 *
 * A backdrop clip answers a different question: "which pixels are READABLE?".
 * The shader samples at `uv = p + n * iRefract * om`, which reaches up to
 * `LIVE_REFRACT` points OUTWARD from a rim pixel, and Skia's backdrop snapshot
 * is bounded by exactly this clip. Sampling past it returns TRANSPARENT —
 * there is no `tx="clamp"` guardrail here, because the `<ImageShader>` that
 * carried those props in the still-image demo is gone. Under-pad and a
 * transparent bite appears around the rim, worst exactly where refraction is
 * strongest.
 *
 * So: clip half-extent = bbox half-extent + `LIVE_REFRACT` + this slack. The
 * slack only covers rounding between the physics frame and the render frame.
 */
export const CLIP_SLACK = 2;

// ============================================================================
// Live background
// ============================================================================

/**
 * Scroll rate of the diagonal colour bands, in band-widths per second.
 *
 * Low on purpose. The background exists to prove the refraction is sampling
 * LIVE content rather than a disguised still, and a slow, steady drift does
 * that as well as a fast one while staying readable in a screenshot pair. It
 * is also what keeps the background from becoming the thing being measured.
 */
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
