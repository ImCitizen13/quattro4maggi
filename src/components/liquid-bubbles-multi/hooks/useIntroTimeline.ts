/**
 * useIntroTimeline — the greeting-to-bubbles intro, as one scrubbable
 * `progress` value. Design notes: README.md → "hooks/useIntroTimeline.ts".
 * The timeline, the curves, every timing constant and why each one is shaped
 * the way it is: ../animation_timeline.md — change the feel there, not here.
 *
 * FLOW:
 *   ONE master value, `progress: SharedValue<number>`, 0 → 1. Every animated
 *   quantity below is a pure function of it — `interpolate` a stage's window
 *   out of `progress`, then shape that 0..1 with an easing curve. There is no
 *   per-value spring or `withDelay` left: a spring has no inverse, so a
 *   scrub bar dragging `progress` backwards has nothing to seek a spring to.
 *
 *   rest (progress = 0, mount or after reset()):
 *     trigger at scale 1, its rest position, label fully visible; greeting
 *     fully opaque; the four bubbles at inflate/travel/label = 0 (nothing to
 *     see, born at the bloom point with radius 0)
 *   play() — tapping the trigger, or the scrub bar's Play:
 *     stage 1 "swell"    [0, TRIGGER_SWELL_MS]:
 *       trigger scale  1 → TRIGGER_SWELL_SCALE, ease-out
 *     stage 2 "collapse" [+TRIGGER_COLLAPSE_MS]:
 *       trigger scale  TRIGGER_SWELL_SCALE → 0
 *     spanning BOTH of the above [0, collapse end × TRIGGER_TRAVEL_FRACTION]:
 *       trigger centre rest position (under the paragraph) → the bloom point
 *         (where the four bubbles are born), ease-in-out — so it is drifting
 *         in the whole time it swells, and because the window stops short of
 *         the collapse it arrives EARLY and empties in place
 *     stage 3 "bloom", starting INTRO_BUBBLE_DELAY_MS after the collapse
 *     ends, per bubble i offset by i · INTRO_BUBBLE_STAGGER_MS:
 *       inflate[i]  0 → 1  gentle back-ease  → r  = baseRadius · radiusMul
 *       travel[i]   0 → 1  back-ease, overshoots 1 and settles → xy = the
 *         bloom point → its corner of a tilted quad
 *       label[i]    0 → 1  linear fade, once it is most of the way there
 *     throughout: x/y carry a sin drift, scaled by travel[i]
 *     the greeting fades over [swell end, +TEXT_FADE_MS]: it stays fully
 *       opaque for the whole swell and only gives way once the trigger is at
 *       FULL size, overlapping the collapse
 *     the TRIGGER'S OWN label fades off the swell factor instead — `1 -
 *       (swell − 1) / (TEXT_FADE_END_SCALE − 1)`, clamped — because it goes
 *       illegible as the bubble grows. It reads the swell factor alone, which
 *       only rises; the drawn scale falls back through 2× during the collapse
 *       and would fade the label back in.
 *   reset() — the Reset button (and the mount call): a short `withTiming`
 *     brings `progress` back to 0. Because every quantity above is a pure
 *     function of `progress`, running it back to 0 reproduces the rest state
 *     exactly — nothing else needs its own reset logic.
 *
 * KEY FEATURES:
 * - Springs are deliberately NOT used here even though the project prefers
 *   `withSpring` — see "Why shaped curves, not springs" below. This is the
 *   documented exception.
 * - The travel curve overshoots 1 and settles (a back-ease, not a spring):
 *   `stepBubbleModes` reads the resulting per-frame POSITION DELTA as motion,
 *   so the glass still wobbles on the way out with no extra shape work — the
 *   wobble survives the springs → curves rework because it was never the
 *   spring itself that mattered, only that travel overshoots then returns.
 * - Every bubble (the four intro bubbles AND the trigger) is one
 *   `PinnedBubble` — the physics hook drives the shape, this hook only says
 *   where and how big.
 * - The quad is rotated by `INTRO_TILT` and jittered per bubble, so it never
 *   reads as a plain grid.
 * - No autoplay: the screen arms the rest state once fonts are ready by
 *   calling `reset()`, and the trigger bubble (or the scrub bar) is the only
 *   way in.
 *
 * WHY SHAPED CURVES, NOT SPRINGS:
 * A progress bar needs a deterministic `t → state` mapping so it can seek to
 * any `t` — a spring has no such inverse (it's an ODE integrated forward from
 * wherever it currently is). So every stage's springiness is reproduced by
 * hand as overshoot in an easing curve (`Easing.back`) instead. The project
 * rule prefers `withSpring`; this file is the documented exception, made
 * possible because `withTiming` + `interpolate` + a shaped easing curve gives
 * the same visual result while staying a pure, invertible function of
 * `progress`.
 */

import { useMemo } from "react";
import {
  Easing,
  Extrapolation,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  INTRO_BUBBLE_DELAY_MS,
  INTRO_BUBBLE_STAGGER_MS,
  INTRO_COUNT,
  INTRO_DRIFT_PERIOD,
  INTRO_DRIFT_X,
  INTRO_DRIFT_Y,
  INTRO_INFLATE_MS,
  INTRO_LABEL_DELAY_MS,
  INTRO_LABEL_MS,
  INTRO_RADIUS_MUL,
  INTRO_RESET_MS,
  INTRO_SPREAD_X,
  INTRO_SPREAD_Y,
  INTRO_TILT,
  INTRO_TOTAL_MS,
  INTRO_TRAVEL_MS,
  INTRO_TRAVEL_OVERSHOOT,
  TEXT_FADE_END_SCALE,
  TEXT_FADE_MS,
  TRIGGER_COLLAPSE_MS,
  TRIGGER_SWELL_MS,
  TRIGGER_SWELL_SCALE,
  TRIGGER_TRAVEL_FRACTION,
} from "../multiBubbleConfig";
import type { PinnedBubble } from "./useMultiBubblePhysics";

// ============================================================================
// Types
// ============================================================================

export type IntroBubble = PinnedBubble & {
  /** 0 → 1 once the bubble has nearly arrived: fades its label in. */
  labelOpacity: DerivedValue<number>;
};

export type UseIntroTimelineParams = {
  /** Where the trigger collapses to — the bubbles are born here. */
  centerX: number;
  centerY: number;
  /** Mean radius, pt; each bubble is `× INTRO_RADIUS_MUL[i]`. */
  radius: SharedValue<number>;
  /** Live offset of the whole arrangement (the Text panel's Bubble X / Y). */
  offsetX?: SharedValue<number>;
  offsetY?: SharedValue<number>;
  /** Seconds, for the resting drift (`useClock`). */
  time: SharedValue<number>;
  /** The trigger bubble's REST centre — screen centre, below the paragraph. */
  triggerX: SharedValue<number> | DerivedValue<number>;
  triggerY: SharedValue<number> | DerivedValue<number>;
  /** The trigger bubble's rest radius, pt (`TRIGGER_RADIUS`). */
  triggerRadius: number;
};

export type UseIntroTimelineReturn = {
  /** The one master value driving every stage below. 0 = rest, 1 = done. */
  progress: SharedValue<number>;
  /** Multiplies the greeting's own opacity: 1 at rest and for the whole swell, 0 `TEXT_FADE_MS` after the trigger reaches full size. */
  textOpacity: DerivedValue<number>;
  /** One per `INTRO_COUNT`, in slot order. */
  bubbles: IntroBubble[];
  /** The rest-state bubble: tap it to run the intro. */
  trigger: IntroBubble;
  /** Run the intro forward from wherever `progress` currently is. */
  play: () => void;
  /** Bring `progress` back to 0 — the rest state, for free. */
  reset: () => void;
};

/** A bubble's fixed personality, built once at module load. */
type IntroSpec = {
  /** Resting offset from the center, pt (already tilted + jittered). */
  dx: number;
  dy: number;
  radiusMul: number;
  wobbleMul: number;
  /** Drift phase and rate, so no two bubbles breathe together. */
  phase: number;
  rate: number;
};

/** One bubble's stage windows, normalized to `progress` (0..1). */
type BubbleWindow = {
  inflateStartT: number;
  inflateEndT: number;
  travelStartT: number;
  travelEndT: number;
  labelStartT: number;
  labelEndT: number;
};

// ============================================================================
// Layout: four corners of a tilted, slightly irregular quad
// ============================================================================

/** Corner directions, before the tilt: TL, TR, BR, BL. */
const CORNERS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/** Per-corner reach jitter — the "slightly off" in the arrangement. */
const REACH_JITTER: readonly number[] = [1, 1.08, 0.94, 1.03];

/** Per-bubble wobble multipliers: a couple of them jiggle more. */
const WOBBLE_MUL: readonly number[] = [1.15, 0.9, 1.3, 1];

const SPECS: readonly IntroSpec[] = CORNERS.slice(0, INTRO_COUNT).map(
  ([sx, sy], i) => {
    const k = REACH_JITTER[i % REACH_JITTER.length];
    const ux = sx * INTRO_SPREAD_X * k;
    const uy = sy * INTRO_SPREAD_Y * k;
    const c = Math.cos(INTRO_TILT);
    const s = Math.sin(INTRO_TILT);
    return {
      dx: ux * c - uy * s,
      dy: ux * s + uy * c,
      radiusMul: INTRO_RADIUS_MUL[i % INTRO_RADIUS_MUL.length],
      wobbleMul: WOBBLE_MUL[i % WOBBLE_MUL.length],
      phase: i * 1.7,
      rate: 1 + i * 0.09,
    };
  },
);

// ============================================================================
// Stage windows — derived once from the ms constants, so a duration change
// restretches everything and the scrub bar's mapping stays correct.
// ============================================================================

const SWELL_END_MS = TRIGGER_SWELL_MS;
const COLLAPSE_END_MS = SWELL_END_MS + TRIGGER_COLLAPSE_MS;
const BLOOM_START_MS = COLLAPSE_END_MS + INTRO_BUBBLE_DELAY_MS;

/** Normalized [0, x] window for the swell stage. */
const SWELL_END_T = SWELL_END_MS / INTRO_TOTAL_MS;
/** Normalized window for the collapse stage — starts where swell ends. */
const COLLAPSE_START_T = SWELL_END_T;
const COLLAPSE_END_T = COLLAPSE_END_MS / INTRO_TOTAL_MS;

/**
 * Greeting fade: opens the instant the trigger is at full size (the swell's
 * end) and runs for `TEXT_FADE_MS`, overlapping the collapse.
 */
const TEXT_FADE_START_T = SWELL_END_T;
const TEXT_FADE_END_T = (SWELL_END_MS + TEXT_FADE_MS) / INTRO_TOTAL_MS;

/**
 * The trigger's drift to the bloom point ends here — a FRACTION of the
 * collapse's end, so it arrives at the centre before it has finished
 * emptying. See `TRIGGER_TRAVEL_FRACTION`.
 */
const TRIGGER_TRAVEL_END_T = COLLAPSE_END_T * TRIGGER_TRAVEL_FRACTION;

/** Per-bubble windows, indexed like `SPECS`. */
const BUBBLE_WINDOWS: readonly BubbleWindow[] = Array.from(
  { length: INTRO_COUNT },
  (_, i): BubbleWindow => {
    const startMs = BLOOM_START_MS + i * INTRO_BUBBLE_STAGGER_MS;
    return {
      inflateStartT: startMs / INTRO_TOTAL_MS,
      inflateEndT: (startMs + INTRO_INFLATE_MS) / INTRO_TOTAL_MS,
      travelStartT: startMs / INTRO_TOTAL_MS,
      travelEndT: (startMs + INTRO_TRAVEL_MS) / INTRO_TOTAL_MS,
      labelStartT: (startMs + INTRO_LABEL_DELAY_MS) / INTRO_TOTAL_MS,
      labelEndT:
        (startMs + INTRO_LABEL_DELAY_MS + INTRO_LABEL_MS) / INTRO_TOTAL_MS,
    };
  },
);

// ============================================================================
// Easing shapes
// ============================================================================

/** Trigger swell: ease-out, so it decelerates into its peak size. */
const swellEase = Easing.out(Easing.quad);

/** Trigger collapse: ease-in, so it accelerates into the vanishing point. */
const collapseEase = Easing.in(Easing.cubic);

/**
 * The trigger's drift from its rest position up to the bloom point. Spans the
 * swell AND the collapse, so it is moving the whole time it is growing.
 * Ease-in-out: it leaves softly and arrives softly, exactly as it vanishes.
 */
const travelToCenterEase = Easing.inOut(Easing.cubic);

/**
 * Travel-out back-ease: overshoots 1 then returns to exactly 1 at the window
 * end (`Easing.out(Easing.back(s))(1) === 1` always — only the approach to 1
 * overshoots). See `INTRO_TRAVEL_OVERSHOOT`'s doc for why the amplitude
 * matters: this curve IS the wobble drive.
 */
const travelEase = Easing.out(Easing.back(INTRO_TRAVEL_OVERSHOOT));

/**
 * Greeting fade-out: ease-in, so it holds a moment at full opacity after the
 * trigger hits full size and then drops away, rather than starting to dim the
 * instant the window opens.
 */
const textFadeEase = Easing.in(Easing.quad);

/** Inflate back-ease: a gentler overshoot than travel, so it still feels alive. */
const INFLATE_OVERSHOOT = 0.15;
const inflateEase = Easing.out(Easing.back(INFLATE_OVERSHOOT));

// ============================================================================
// Helpers
// ============================================================================

/**
 * The trigger label's opacity, as a function of how far the trigger has
 * SWOLLEN — not of time or progress directly. At scale 1 (rest) this is 1; by
 * `TEXT_FADE_END_SCALE` it's 0. No separate timing constant: it rides on the
 * swell curve already computed. The GREETING no longer uses this — it fades
 * on its own window once the swell is complete (see `textOpacity`).
 *
 * Callers must pass the trigger's monotone SWELL factor, never its drawn
 * scale: the drawn scale falls back through 2× and 1× during the collapse,
 * which would fade the label back IN just before the bubbles bloom.
 */
function fadeFromScale(scale: number): number {
  "worklet";
  const raw = 1 - (scale - 1) / (TEXT_FADE_END_SCALE - 1);
  return Math.min(Math.max(raw, 0), 1);
}

// ============================================================================
// Hook
// ============================================================================

export function useIntroTimeline({
  centerX,
  centerY,
  radius,
  time,
  offsetX,
  offsetY,
  triggerX,
  triggerY,
  triggerRadius,
}: UseIntroTimelineParams): UseIntroTimelineReturn {
  const progress = useSharedValue(0);

  // ==========================================================================
  // Trigger: swell → collapse into the bloom point
  // ==========================================================================

  // The swell factor ALONE: 1 at rest, rising to TRIGGER_SWELL_SCALE, and
  // staying there. Kept separate from the collapse below because the text
  // fade reads it: it only ever rises, so the fade can't run backwards.
  const triggerSwell = useDerivedValue(() => {
    const swellT = interpolate(
      progress.value,
      [0, SWELL_END_T],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return 1 + (TRIGGER_SWELL_SCALE - 1) * swellEase(swellT);
  });

  // What the bubble is actually drawn at: the swell, emptied by the collapse
  // window (and 0 after it). Non-monotonic by design — it comes back DOWN
  // through 2× and 1×, which is exactly why the fade must not read this.
  const triggerScale = useDerivedValue(() => {
    const collapseT = interpolate(
      progress.value,
      [COLLAPSE_START_T, COLLAPSE_END_T],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return triggerSwell.value * (1 - collapseEase(collapseT));
  });

  const triggerR = useDerivedValue(
    () => triggerRadius * triggerScale.value,
  );

  // How far the trigger has lerped from its rest position (centred under the
  // paragraph) to the bloom point. Spans the swell AND part of the collapse, so it
  // is travelling the whole time it is scaling rather than sitting still and
  // then darting. `TRIGGER_TRAVEL_FRACTION` cuts the window short of the
  // collapse's end, which makes the move to the centre visibly quicker than
  // the emptying — it lands, then finishes collapsing in place. Ease-in-out,
  // so the departure and the arrival are both soft.
  const triggerCenterT = useDerivedValue(() =>
    travelToCenterEase(
      interpolate(
        progress.value,
        [0, TRIGGER_TRAVEL_END_T],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    ),
  );

  const triggerXDerived = useDerivedValue(() => {
    const restX = triggerX.value;
    return restX + (centerX - restX) * triggerCenterT.value;
  });
  const triggerYDerived = useDerivedValue(() => {
    const restY = triggerY.value;
    return restY + (centerY - restY) * triggerCenterT.value;
  });

  // The trigger's own label fades the same way the greeting does, off the
  // same monotone swell factor — it's illegible past TEXT_FADE_END_SCALE.
  const triggerLabelOpacity = useDerivedValue(() =>
    fadeFromScale(triggerSwell.value),
  );

  const trigger: IntroBubble = {
    x: triggerXDerived,
    y: triggerYDerived,
    r: triggerR,
    labelOpacity: triggerLabelOpacity,
    wobbleMul: 1,
  };

  // The greeting's opacity. Unlike the trigger's own label (which fades off
  // the swell factor, above), this opens only once the trigger has reached
  // FULL size: the paragraph stays solid for the whole swell, then gives way
  // over `TEXT_FADE_MS` while the bubble collapses and heads for the centre.
  // Still a pure function of `progress`, so the scrub bar seeks it correctly.
  const textOpacity = useDerivedValue(
    () =>
      1 -
      textFadeEase(
        interpolate(
          progress.value,
          [TEXT_FADE_START_T, TEXT_FADE_END_T],
          [0, 1],
          Extrapolation.CLAMP,
        ),
      ),
  );

  // ==========================================================================
  // The four bubbles: bloom out of the trigger's collapse point
  // ==========================================================================

  const bubbles: IntroBubble[] = [];
  for (let i = 0; i < INTRO_COUNT; i++) {
    const spec = SPECS[i];
    const w = BUBBLE_WINDOWS[i];

    /* eslint-disable react-hooks/rules-of-hooks */
    const inflateT = useDerivedValue(() =>
      inflateEase(
        interpolate(
          progress.value,
          [w.inflateStartT, w.inflateEndT],
          [0, 1],
          Extrapolation.CLAMP,
        ),
      ),
    );
    const travelT = useDerivedValue(() =>
      travelEase(
        interpolate(
          progress.value,
          [w.travelStartT, w.travelEndT],
          [0, 1],
          Extrapolation.CLAMP,
        ),
      ),
    );
    const labelT = useDerivedValue(() =>
      interpolate(
        progress.value,
        [w.labelStartT, w.labelEndT],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    );

    // Drift is scaled by travel, so a bubble still at the bloom point is still.
    const x = useDerivedValue(() => {
      const wr = (2 * Math.PI) / INTRO_DRIFT_PERIOD;
      const drift =
        INTRO_DRIFT_X * Math.sin(time.value * wr * spec.rate + spec.phase);
      const off = offsetX === undefined ? 0 : offsetX.value;
      return centerX + off + (spec.dx + drift) * travelT.value;
    });
    const y = useDerivedValue(() => {
      const wr = (2 * Math.PI) / (INTRO_DRIFT_PERIOD * 1.27);
      const drift =
        INTRO_DRIFT_Y *
        Math.sin(time.value * wr * spec.rate + spec.phase * 1.4);
      const off = offsetY === undefined ? 0 : offsetY.value;
      return centerY + off + (spec.dy + drift) * travelT.value;
    });
    const r = useDerivedValue(
      () => radius.value * spec.radiusMul * inflateT.value,
    );
    const labelOpacity = useDerivedValue(() => labelT.value);
    /* eslint-enable react-hooks/rules-of-hooks */

    bubbles.push({ x, y, r, labelOpacity, wobbleMul: spec.wobbleMul });
  }

  // ==========================================================================
  // Controls
  // ==========================================================================

  // Runs forward from wherever `progress` currently is — not necessarily 0,
  // so the scrub bar's Play resumes rather than restarting. The remaining
  // duration is scaled by the remaining distance so playback speed stays
  // constant regardless of where it starts.
  const play = useMemo(
    () => () => {
      cancelAnimation(progress);
      const remaining = 1 - progress.value;
      progress.value = withTiming(1, {
        duration: INTRO_TOTAL_MS * remaining,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      });
    },
    // `progress` is stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Brings progress back to 0 — the rest state comes for free since every
  // value above is a pure function of it.
  const reset = useMemo(
    () => () => {
      cancelAnimation(progress);
      progress.value = withTiming(0, {
        duration: INTRO_RESET_MS,
        reduceMotion: ReduceMotion.System,
      });
    },
    // `progress` is stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { progress, textOpacity, bubbles, trigger, play, reset };
}
