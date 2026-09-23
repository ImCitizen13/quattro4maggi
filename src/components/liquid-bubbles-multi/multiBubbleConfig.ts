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
// Greeting text + its bubble (defaults for the Text panel)
// ============================================================================

/** Size the font is loaded at, pt. The Size slider scales from this. */
export const TEXT_BASE_SIZE = 32;
export const TEXT_SIZE_DEFAULT = 32;
/** Vertical offset from the screen center, pt (+ = down). */
export const TEXT_Y_DEFAULT = 0;
/** Squiggle under the name: stroke thickness and gap below the baseline, pt. */
export const UNDERLINE_WIDTH_DEFAULT = 5;
export const UNDERLINE_GAP_DEFAULT = 6;
/**
 * The pinned bubble ABOVE the text: radius, pt, and offset from where it
 * rests (a `TEXT_BUBBLE_GAP` gap over the paragraph's top edge), pt.
 */
export const TEXT_BUBBLE_SIZE_DEFAULT = 90;

/** Gap between the bubble's rim and the paragraph's top edge, pt. */
export const TEXT_BUBBLE_GAP = 16;
export const TEXT_BUBBLE_X_DEFAULT = 0;
export const TEXT_BUBBLE_Y_DEFAULT = 0;

// ============================================================================
// Intro animation (greeting collapse → four labelled bubbles)
// ============================================================================

/** Bubbles the intro brings in. Each one is a pinned slot, not a floater. */
export const INTRO_COUNT = 4;

/** What each bubble says. One per `INTRO_COUNT`. */
export const INTRO_LABELS: readonly string[] = [
  "Exercise",
  "Learn Portuguese",
  "Meeting @7",
  "Read 20 min",
];

/** Mean bubble radius, pt. The Bubble panel's Size slider drives it. */
export const INTRO_BASE_RADIUS = 72;

/** Per-bubble radius multipliers — "slightly different sizes". */
export const INTRO_RADIUS_MUL: readonly number[] = [1, 0.86, 0.96, 0.8];

/** Half-diagonal of the arrangement around the center, pt (x, y). */
export const INTRO_SPREAD_X = 80;
export const INTRO_SPREAD_Y = 94;

/** The whole quad is rotated by this, so it never reads as a plain grid. */
export const INTRO_TILT = 0.21; // rad, ~12°

/** Resting drift: amplitude (pt) and period (s) of the in-place float. */
export const INTRO_DRIFT_X = 7;
export const INTRO_DRIFT_Y = 10;
export const INTRO_DRIFT_PERIOD = 3.4;

/**
 * Gap after the trigger's collapse finishes and before the first bubble
 * starts blooming, ms. Before the scrubbable rework this was an absolute
 * delay measured from `play()`; now every stage is a window of the single
 * `progress` value, so it's just the gap after `TRIGGER_SWELL_MS +
 * TRIGGER_COLLAPSE_MS`.
 */
export const INTRO_BUBBLE_DELAY_MS = 60;
export const INTRO_BUBBLE_STAGGER_MS = 90;

/** Inflate: gentle overshoot, so the bubble arrives alive. */
export const INTRO_INFLATE_MS = 900;
export const INTRO_INFLATE_DAMPING = 0.6;

/**
 * Travel to the corner. Shaped with a back-ease that overshoots 1 and settles
 * — see `INTRO_TRAVEL_OVERSHOOT` — which reproduces the old underdamped
 * spring's overshoot: `stepBubbleModes` reads that as motion, so the glass
 * wobbles on the way out without any extra shape work.
 */
export const INTRO_TRAVEL_MS = 1100;
export const INTRO_TRAVEL_DAMPING = 0.52;

/**
 * Back-ease amplitude for the bubbles' travel-out (`Easing.back`'s `s`
 * parameter). This IS the wobble drive — see `INTRO_TRAVEL_MS` above — so it
 * isn't just a stylistic choice: too small and the glass barely deforms, too
 * large and the bubble visibly backs up before settling.
 */
export const INTRO_TRAVEL_OVERSHOOT = 0.28;

/** Label fade, after the bubble is most of the way to its corner. */
export const INTRO_LABEL_DELAY_MS = 700;
export const INTRO_LABEL_MS = 420;

/** Label type: size at `INTRO_BASE_RADIUS`, and the wrap width as a ×R. */
export const INTRO_LABEL_SIZE = 15;
export const INTRO_LABEL_WIDTH_MUL = 1.45;

// ============================================================================
// Trigger bubble (rest state — tap it to run the intro)
// ============================================================================

/** What the trigger bubble says. */
export const TRIGGER_LABEL = "Explore thoughts";

/** Trigger bubble's rest radius, pt (fixed — doesn't follow the Size slider). */
export const TRIGGER_RADIUS = 46;

/** Gap between the greeting paragraph's bottom edge and the trigger's top rim, pt. */
export const TRIGGER_GAP = 28;

/** Trigger label type size, pt. */
export const TRIGGER_LABEL_SIZE = 11;

/** Trigger label wrap width, as a × of `TRIGGER_RADIUS`. */
export const TRIGGER_LABEL_WIDTH_MUL = 1.6;

/**
 * How long the trigger takes to swell before it collapses, ms — stage 1 of
 * the intro (see `useIntroTimeline.ts`).
 */
export const TRIGGER_SWELL_MS = 620;

/** How large the trigger grows, ×, before it collapses. */
export const TRIGGER_SWELL_SCALE = 3;

/**
 * How long the trigger takes to collapse from `TRIGGER_SWELL_SCALE` to
 * nothing, ms — stage 2, right after the swell. Its centre lerps from its
 * rest position to the bloom point (the four bubbles' birth point) over the
 * same window.
 */
export const TRIGGER_COLLAPSE_MS = 420;

/**
 * The trigger's scale at which the greeting is fully faded out. The
 * greeting's opacity is `1 - (swell - 1) / (TEXT_FADE_END_SCALE - 1)`,
 * clamped — a function of how far the trigger has SWOLLEN, not of time, so
 * it's automatically correct at any scrub position. It reads the swell
 * factor, not the drawn scale: the drawn scale comes back down through 2×
 * during the collapse, which would fade the greeting back in.
 */
export const TEXT_FADE_END_SCALE = 2;

/** How long `reset()` takes to bring `progress` back to 0, ms. */
export const INTRO_RESET_MS = 420;

/**
 * Total intro duration, ms — the span `progress` (0 → 1) maps onto. DERIVED
 * from the stage constants above: never hand-set it, because the scrub bar's
 * tick marks and its progress ↔ ms mapping both depend on this being exactly
 * right. If you change any stage's duration, this recomputes and the whole
 * timeline restretches to match — that's the point of a single progress
 * value.
 */
export const INTRO_TOTAL_MS =
  TRIGGER_SWELL_MS +
  TRIGGER_COLLAPSE_MS +
  INTRO_BUBBLE_DELAY_MS +
  (INTRO_COUNT - 1) * INTRO_BUBBLE_STAGGER_MS +
  Math.max(
    INTRO_INFLATE_MS,
    INTRO_TRAVEL_MS,
    INTRO_LABEL_DELAY_MS + INTRO_LABEL_MS,
  );

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
