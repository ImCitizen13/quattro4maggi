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

/**
 * Mode-2 rest floor: `target2 = max(A2_REST, min(A2_MAX, speed / SPEED_REF))`.
 * The bubble never returns to a perfect circle — this is its "memory".
 */
export const A2_REST = 0.04;

/** Below this drag speed (pt/s), the phi2 target direction is not updated. */
export const PHI2_SPEED_THRESHOLD = 40;

/**
 * Shortest-arc blend rate for phi2 → target, in 1/s.
 *
 * UNUSED since mode 2 became a sprung VECTOR rather than an angle lerp (see
 * `ModeState` in `hooks/bubbleModeMath.ts`): the axis is now carried by
 * (`c2`, `s2`) under the K2/C2 spring, so there is no separate phase-blend
 * rate. Kept because the "Physics contract" in
 * `temp/liquid-bubbles-divergence.md` still lists it — that doc needs the
 * same correction. Delete both together.
 */
export const PHI_RATE = 12;

/** At rest (speed ≤ threshold), phi2 keeps drifting slowly, in rad/s. */
export const PHI_DRIFT = 0.08;

// ============================================================================
// Idle drive — modes 3/4 breathe gently even at rest
// ============================================================================

/** Mode-3 rest floor amplitude: `target3 = A3_REST + A3_IDLE * sin(t * IDLE_FREQ_3)`. */
export const A3_REST = 0.02;

/** Mode-3 idle target amplitude: `A3_IDLE * sin(t * IDLE_FREQ_3)`. */
export const A3_IDLE = 0.02;

/** Mode-4 rest floor amplitude: `target4 = A4_REST + A4_IDLE * sin(t * IDLE_FREQ_4 + IDLE_PHASE_4)`. */
export const A4_REST = 0.012;

/** Mode-4 idle target amplitude: `A4_IDLE * sin(t * IDLE_FREQ_4 + IDLE_PHASE_4)`. */
export const A4_IDLE = 0.012;

/** Mode-3 phase, fixed (never sprung) so the rest pose is an irregular blob. */
export const PHI3_REST = 1.1;

/** Mode-4 phase, fixed (never sprung) so the rest pose is an irregular blob. */
export const PHI4_REST = 2.6;

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
