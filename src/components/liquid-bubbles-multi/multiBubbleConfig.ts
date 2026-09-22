/**
 * Liquid Bubbles Multi — demo constants.
 * Design notes: README.md.
 *
 * Everything a single bubble needs (mode springs, float forces, birth
 * ranges) is imported from `liquid-bubble-live/bubbleModes.ts`. This file
 * holds only what is new with several bubbles. No React, no Skia imports —
 * safe to read from a worklet.
 */

import { BIRTH_TIME, PARAM_FLOATS } from "../liquid-bubble-live/bubbleModes";

// ============================================================================
// Count + buffer
// ============================================================================

/** Bubbles on screen. */
export const BUBBLE_COUNT = 5;

/**
 * Fixed upper bound: the multi shader's loop needs a constant count, and the
 * buffer is always this size so its uniform size never changes.
 */
export const MAX_BUBBLES = 8;

/** Flat buffer: `PARAM_FLOATS` (12) per bubble, `MAX_BUBBLES` slots. */
export const MULTI_PARAM_FLOATS = MAX_BUBBLES * PARAM_FLOATS;

// ============================================================================
// Spawn
// ============================================================================

/**
 * Seconds between the first spawns, so the bubbles leave the box one by one
 * instead of all inflating on top of each other at mount.
 */
export const SPAWN_STAGGER = 1.2;

/** Each spawn lands up to ± this many points left/right of the box center. */
export const SPAWN_SPREAD = 40;

// ============================================================================
// Inflate spring
// ============================================================================

/**
 * The single bubble inflates with Reanimated's `withSpring`
 * (`SPRING_BUBBLE_INFLATE`: dampingRatio 0.6, duration = BIRTH_TIME). The
 * multi physics is one pure step, so the same spring is integrated by hand:
 * same damping ratio, and ω picked so the envelope `e^(−ζωt)` has decayed to
 * ~2% (4 time constants) at BIRTH_TIME.
 */
export const INFLATE_ZETA = 0.6;
export const INFLATE_OMEGA = 4 / (INFLATE_ZETA * BIRTH_TIME);
