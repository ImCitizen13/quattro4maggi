/**
 * Liquid Bubbles Multi — demo constants.
 * Design notes: README.md.
 *
 * Everything a single bubble needs (mode springs, float forces, birth
 * ranges) is imported from `liquid-bubble-live/bubbleModes.ts`. This file
 * holds only what is new with several bubbles. No React, no Skia imports —
 * safe to read from a worklet.
 */

import type { BubbleOpticsValues } from "../liquid-bubble-live/hooks/useBubbleOptics";

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
export const TEXT_BASE_SIZE = 48;
export const TEXT_SIZE_DEFAULT = 48;
/** Vertical offset from the screen center, pt (+ = down). */
export const TEXT_Y_DEFAULT = -35;
/**
 * Highlighter swatch behind the name. The rect is the name line's own glyph
 * box (ascent above the baseline, descent below) grown by these pads — all in
 * pt at `TEXT_BASE_SIZE`, so the Size slider scales it with the text.
 */
export const NAME_HIGHLIGHT_COLOR = "#e8a519";
export const NAME_HIGHLIGHT_PAD_X = 12;
export const NAME_HIGHLIGHT_PAD_Y = 2;
export const NAME_HIGHLIGHT_RADIUS = 6;

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
  "Podcast",
  "Learn Portuguese",
  "Meeting @7",
  "Daily post",
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
export const INTRO_LABEL_SIZE = 18;
export const INTRO_LABEL_WIDTH_MUL = 1.45;

// ============================================================================
// Trigger bubble (rest state — tap it to run the intro)
// ============================================================================

/** What the trigger bubble says. */
export const TRIGGER_LABEL = "Go";

/** Trigger bubble's rest radius, pt (fixed — doesn't follow the Size slider). */
export const TRIGGER_RADIUS = 64;

/**
 * Vertical gap between the greeting paragraph's bottom edge and the trigger's
 * top rim, pt. The trigger sits centred UNDER the paragraph. It is NOT scaled
 * by the Text panel's Size slider, so the bubble keeps the same breathing room
 * whatever size the text is.
 */
export const TRIGGER_GAP = 28;

/** Trigger label type size, pt. */
export const TRIGGER_LABEL_SIZE = 22;

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

/**
 * How long the GREETING takes to fade out, ms, starting the instant the
 * trigger reaches full size (the end of the swell) — so the paragraph stays
 * fully readable for the whole swell and only gives way once the bubble has
 * arrived at `TRIGGER_SWELL_SCALE`.
 *
 * It rides on the collapse window rather than adding to the timeline, so keep
 * it ≤ `TRIGGER_COLLAPSE_MS` — longer and the fade would still be running
 * after the bubbles have started to bloom, and `INTRO_TOTAL_MS` would no
 * longer cover it.
 *
 * `TEXT_FADE_END_SCALE` above no longer drives the greeting: it now only
 * fades the TRIGGER'S OWN label, which goes illegible as the bubble swells.
 */
export const TEXT_FADE_MS = 300;

/**
 * How much of the swell + collapse window the trigger uses to drift from its
 * rest spot (under the paragraph) to the bloom point at the centre. 1 = it
 * lands exactly as it vanishes; < 1 = it gets there EARLY and finishes
 * collapsing in place, which reads as a faster, more deliberate move to the
 * centre while it is still scaling.
 */
export const TRIGGER_TRAVEL_FRACTION = 0.72;

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
// Scene ripple (fires just before the bubbles bloom)
// ============================================================================

/**
 * How far BEFORE the first bubble blooms the ripple goes off, ms. It lands
 * inside the trigger's collapse: the bubble is emptying into the centre, the
 * water snaps, and the four bubbles come out of the ring it leaves.
 *
 * Keep it below `TRIGGER_COLLAPSE_MS + INTRO_BUBBLE_DELAY_MS` or the ripple
 * would start before the trigger has even finished swelling.
 */
export const RIPPLE_LEAD_MS = 140;

/** When the first bubble starts blooming, ms into the intro. */
export const BLOOM_START_MS =
  TRIGGER_SWELL_MS + TRIGGER_COLLAPSE_MS + INTRO_BUBBLE_DELAY_MS;

/**
 * The `progress` the ripple fires at. DERIVED, like `INTRO_TOTAL_MS` — retime
 * any stage above and the ripple follows the bloom instead of drifting off it.
 */
export const RIPPLE_AT_PROGRESS =
  (BLOOM_START_MS - RIPPLE_LEAD_MS) / INTRO_TOTAL_MS;

/**
 * How far back below the threshold `progress` must fall before the ripple can
 * fire again. Only matters for the scrub bar: without it, a finger parked on
 * the trigger point would re-fire on alternate frames.
 */
export const RIPPLE_REARM_SLOP = 0.02;

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

// ============================================================================
// Birth optics (the intro bubbles' exaggerated glass while they inflate)
// ============================================================================

/**
 * The glass an intro bubble wears while it inflates, before it crosses over
 * to the screen's live optics. Same look for every bubble. Any lever not
 * named here is at its live value the whole time.
 */
export const BIRTH_OPTICS: Partial<BubbleOpticsValues> = {
  refract: 31,
  falloff: 1.83,
  lens: 0.7,
  dispersion: 0.6,
  edgeWidth: 0.43,
};

/**
 * Where on the bubble's INFLATE curve the crossover to the live optics FIRES.
 * Once `inflate` reaches this, the crossover runs on its OWN clock
 * (`BIRTH_SWAP_MS`) rather than finishing with the rest of the inflate curve
 * — so this is a trigger point, not the start of a range.
 *
 * Because of that, this is the one stage of this intro that does NOT seek
 * with the scrub bar: dragging `progress` backwards past the trigger re-arms
 * the birth look, and dragging forward past it replays the crossover from the
 * top, rather than scrubbing smoothly through it like every other stage.
 */
export const BIRTH_SWAP_START = 0.8;

/**
 * How long the crossover from `BIRTH_OPTICS` to the live optics takes once it
 * has been triggered, ms. It runs on its OWN clock rather than finishing with
 * the inflate curve, so the dial reads at a steady pace regardless of how
 * long the remaining inflate takes.
 */
export const BIRTH_SWAP_MS = 1800;

// ============================================================================
// This demo's own lever defaults (shape + optics)
// ============================================================================

/**
 * This demo's own shape levers, overriding the shared `bubbleModes` defaults.
 * Kept here rather than in `bubbleModes.ts` because those constants are shared
 * with the single-bubble demos, which are tuned differently.
 */
export const MULTI_WOBBLE = 2.7;
export const MULTI_INERTIA = 1.88;
export const MULTI_STRENGTH = 2.0;

/** This demo's own optics, same reasoning — fed to `useBubbleOptics`'s `overrides`. */
export const MULTI_OPTICS: Partial<BubbleOpticsValues> = {
  refract: 33.2,
  falloff: 1.18,
  lens: 0.03,
  dispersion: 0.67,
  film: 0.64,
  filmScale: 3.9,
  tint: 0.55,
};

/**
 * Soap film over the labeled bubbles (the four intro bubbles, the trigger,
 * the solo bubble) — liquid-bubble-live's overlay pass, replacing the glass's
 * built-in cosine film. Off = the built-in film, and no overlay passes.
 */
export const BUBBLE_SOAP_FILM = true;

// ============================================================================
// Select: press an intro bubble → it and its card centre on screen
// ============================================================================

/** The chosen bubble grows to this × its size (its label scales with it). */
export const SELECT_SCALE = 1.2;

/** Gap between the chosen bubble's bottom rim and the card's top edge, pt. */
export const SELECT_CARD_GAP = 20;

/**
 * How far each of the OTHER bubbles scrolls up, × screen height. Slightly
 * different per bubble so they leave as a parallax scroll, not one block.
 * All ≥ 1, so every one clears the top whatever its start height.
 */
export const SELECT_SCROLL_MUL: readonly number[] = [1.05, 1.18, 1.1, 1.26];

/**
 * Card width, × screen width. Its height follows the content: the points'
 * measured height + `SELECT_CARD_PAD` above and below.
 */
export const SELECT_CARD_WIDTH = 0.8;

/** Card corner size, pt, and superellipse exponent (higher = squarer). */
export const SELECT_CARD_CORNER = 44;
export const SELECT_CARD_CORNER_EXP = 4;

/** Backdrop blur sigma, pt, and the white wash drawn over it. */
export const SELECT_CARD_BLUR = 60;
export const SELECT_CARD_FILL = "rgba(255, 255, 255, 0.35)";
export const SELECT_CARD_RIM = "rgba(255, 255, 255, 0.7)";

/** Card text inset, pt, and the points' type size. */
export const SELECT_CARD_PAD = 24;
export const SELECT_POINT_SIZE = 17;

/** Placeholder points for each intro bubble's card, in `INTRO_LABELS` order. */
export const SELECT_DESCRIPTIONS: readonly (readonly string[])[] = [
  [
    "Episode 42 — Designing for motion",
    "38 min left, resume at 12:05",
    "New episodes every Friday",
    "3 unplayed in your queue",
  ],
  [
    "Lesson 7 — Ordering at a café",
    "12-day streak, keep it going",
    "20 flashcards due for review",
    "Today's verb: ter (to have)",
  ],
  [
    "Weekly sync with the design team",
    "7:00 PM, video link in the invite",
    "Agenda: Q4 roadmap and demos",
    "Bring the prototype notes",
  ],
  [
    "Draft: morning light series",
    "Best time to post: 9:00 AM",
    "3 comments waiting for a reply",
    "Tags: #daily #film #light",
  ],
];
