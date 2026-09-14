/**
 * Liquid Bubbles — harmonic mode constants (divergence phase 5B+)
 *
 * Pure data: the buffer shape shared between the physics step
 * (`hooks/bubbleModeMath.ts`, phase 6B) and the `iParams` uniform in
 * `shaders.ts`, plus the spring/idle tuning constants that
 * `stepBubbleModes` (phase 6B) will read. No React, no Skia, no Reanimated
 * imports here — safe to import from a worklet or from plain TS.
 *
 * See `temp/liquid-bubbles-divergence.md` → "Physics contract" for the
 * derivation of every constant below. Do not re-derive or re-tune these in
 * phase 5B; phase 9B is the only phase that retunes feel.
 */

// ============================================================================
// Buffer shape (must match iParams[3] in shaders.ts / SkSL)
// ============================================================================

/**
 * 12-float buffer layout, double-buffered exactly like `ballBuffer` was:
 *   [0] cx, cy, R, unused              (pt)
 *   [1] a2, phi2, a3, phi3             (amplitude unitless, phase radians)
 *   [2] a4, phi4, filmPhase, unused
 */
export const PARAM_FLOATS = 12;

/** Hard cap on every mode amplitude `a2/a3/a4`, in both directions (±). */
export const A_MAX = 0.15;

// ============================================================================
// Drive — motion → mode 2 (stretch along the drag direction)
// ============================================================================

/** Drag speed (pt/s) that saturates the mode-2 target amplitude. */
export const SPEED_REF = 1500;

/** Mode-2 target amplitude cap: `target2 = min(A2_MAX, speed / SPEED_REF)`. */
export const A2_MAX = 0.12;

/** Below this drag speed (pt/s), the phi2 target direction is not updated. */
export const PHI2_SPEED_THRESHOLD = 40;

/** Shortest-arc blend rate for phi2 → target, in 1/s. */
export const PHI_RATE = 12;

// ============================================================================
// Idle drive — modes 3/4 breathe gently even at rest
// ============================================================================

/** Mode-3 idle target amplitude: `A3_IDLE * sin(t * IDLE_FREQ_3)`. */
export const A3_IDLE = 0.025;

/** Mode-4 idle target amplitude: `A4_IDLE * sin(t * IDLE_FREQ_4 + IDLE_PHASE_4)`. */
export const A4_IDLE = 0.015;

/** Angular frequency of the mode-3 idle drive, rad/s. */
export const IDLE_FREQ_3 = 0.7;

/** Angular frequency of the mode-4 idle drive, rad/s. */
export const IDLE_FREQ_4 = 1.1;

/** Phase offset of the mode-4 idle drive, radians. */
export const IDLE_PHASE_4 = 1;

// ============================================================================
// Release kick — a pan release seeds modes 3/4 so they ring out
// ============================================================================

/** Kick magnitude applied to `v3`/`v4` on an isActive 1→0 edge, scaled by speed. */
export const KICK = 2e-5;

/** `v4`'s kick is scaled down relative to `v3`'s (and inverted in sign). */
export const KICK_V4_SCALE = 0.6;

// ============================================================================
// Per-mode critically-underdamped spring constants
// ============================================================================
//
// `v += (K_k * (target - a) - C_k * v) * dt; a += v * dt`
// Underdamped on purpose — the bubble should visibly ring out, not snap.

export const K2 = 140;
export const C2 = 14;

export const K3 = 180;
export const C3 = 10;

export const K4 = 220;
export const C4 = 9;

// ============================================================================
// Film drift
// ============================================================================

/** `filmPhase += dt * FILM_DRIFT`, drives the thin-film color cycle (phase 8B). */
export const FILM_DRIFT = 0.15;

// ============================================================================
// Frame timing
// ============================================================================

/** `dt` (ms) is clamped to this range before every physics step. */
export const DT_MIN_MS = 1;
export const DT_MAX_MS = 33;

// ============================================================================
// Bounding box
// ============================================================================

/** Extra AA/refraction padding added to the harmonic-field bounding box. */
export const BBOX_PAD = 2;
