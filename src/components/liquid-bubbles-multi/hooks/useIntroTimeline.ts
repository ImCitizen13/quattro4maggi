/**
 * useIntroTimeline — the greeting-to-bubbles intro, as UI-thread values.
 * Design notes: README.md → "hooks/useIntroTimeline.ts".
 *
 * FLOW (one `play()`, everything after it runs on the UI thread):
 *   textScale   1 → INTRO_TEXT_PEAK → 0        (spring, then collapse)
 *   per bubble i, after INTRO_BUBBLE_DELAY + i · STAGGER:
 *     inflate[i]  0 → 1   bouncy   → r  = baseRadius · radiusMul
 *     travel[i]   0 → 1   springy  → xy = center → its corner (+ overshoot)
 *     label[i]    0 → 1   fade, once it is most of the way there
 *   forever after: x/y carry a sin drift, scaled by travel[i]
 *
 * KEY FEATURES:
 * - The travel spring is deliberately underdamped: `stepBubbleModes` reads
 *   the resulting velocity as motion, so the glass wobbles on the way out
 *   and settles at the corner without any extra shape work.
 * - Every bubble is one `PinnedBubble` — the physics hook drives the shape,
 *   this hook only says where and how big.
 * - The quad is rotated by `INTRO_TILT` and jittered per bubble, so it never
 *   reads as a plain grid.
 * - `play()` re-arms from zero, so it doubles as Replay.
 */

import { useMemo } from "react";
import {
  ReduceMotion,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
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
  INTRO_INFLATE_DAMPING,
  INTRO_INFLATE_MS,
  INTRO_LABEL_DELAY_MS,
  INTRO_LABEL_MS,
  INTRO_RADIUS_MUL,
  INTRO_SPREAD_X,
  INTRO_SPREAD_Y,
  INTRO_TEXT_COLLAPSE_MS,
  INTRO_TEXT_GROW_MS,
  INTRO_TEXT_PEAK,
  INTRO_TILT,
  INTRO_TRAVEL_DAMPING,
  INTRO_TRAVEL_MS,
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
  /** Where the text collapses to — the bubbles are born here. */
  centerX: number;
  centerY: number;
  /** Mean radius, pt; each bubble is `× INTRO_RADIUS_MUL[i]`. */
  radius: SharedValue<number>;
  /** Live offset of the whole arrangement (the Text panel's Bubble X / Y). */
  offsetX?: SharedValue<number>;
  offsetY?: SharedValue<number>;
  /** Seconds, for the resting drift (`useClock`). */
  time: SharedValue<number>;
};

export type UseIntroTimelineReturn = {
  /** Multiplies the greeting's own scale: 1 at rest, 0 once collapsed. */
  textScale: SharedValue<number>;
  /** One per `INTRO_COUNT`, in slot order. */
  bubbles: IntroBubble[];
  /** Run (or re-run) the whole intro from the start. */
  play: () => void;
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
// Springs
// ============================================================================

const SPRING_TEXT_GROW = {
  duration: INTRO_TEXT_GROW_MS,
  dampingRatio: 0.55,
  reduceMotion: ReduceMotion.System,
};

const SPRING_TEXT_COLLAPSE = {
  duration: INTRO_TEXT_COLLAPSE_MS,
  dampingRatio: 1,
  reduceMotion: ReduceMotion.System,
};

const SPRING_INFLATE = {
  duration: INTRO_INFLATE_MS,
  dampingRatio: INTRO_INFLATE_DAMPING,
  reduceMotion: ReduceMotion.System,
};

const SPRING_TRAVEL = {
  duration: INTRO_TRAVEL_MS,
  dampingRatio: INTRO_TRAVEL_DAMPING,
  reduceMotion: ReduceMotion.System,
};

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
}: UseIntroTimelineParams): UseIntroTimelineReturn {
  const textScale = useSharedValue(1);

  // INTRO_COUNT is a module constant, so the hook count below is fixed for
  // the life of the app — the loop is safe.
  const travel: SharedValue<number>[] = [];
  const inflate: SharedValue<number>[] = [];
  const label: SharedValue<number>[] = [];
  for (let i = 0; i < INTRO_COUNT; i++) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    travel.push(useSharedValue(0));
    // eslint-disable-next-line react-hooks/rules-of-hooks
    inflate.push(useSharedValue(0));
    // eslint-disable-next-line react-hooks/rules-of-hooks
    label.push(useSharedValue(0));
  }

  const bubbles: IntroBubble[] = [];
  for (let i = 0; i < INTRO_COUNT; i++) {
    const spec = SPECS[i];
    const t = travel[i];
    const inf = inflate[i];
    const lab = label[i];

    // Drift is scaled by travel, so a bubble still at the center is still.
    /* eslint-disable react-hooks/rules-of-hooks */
    const x = useDerivedValue(() => {
      const w = (2 * Math.PI) / INTRO_DRIFT_PERIOD;
      const drift =
        INTRO_DRIFT_X * Math.sin(time.value * w * spec.rate + spec.phase);
      const off = offsetX === undefined ? 0 : offsetX.value;
      return centerX + off + (spec.dx + drift) * t.value;
    });
    const y = useDerivedValue(() => {
      const w = (2 * Math.PI) / (INTRO_DRIFT_PERIOD * 1.27);
      const drift =
        INTRO_DRIFT_Y * Math.sin(time.value * w * spec.rate + spec.phase * 1.4);
      const off = offsetY === undefined ? 0 : offsetY.value;
      return centerY + off + (spec.dy + drift) * t.value;
    });
    const r = useDerivedValue(() => radius.value * spec.radiusMul * inf.value);
    const labelOpacity = useDerivedValue(() => lab.value);
    /* eslint-enable react-hooks/rules-of-hooks */

    bubbles.push({ x, y, r, labelOpacity, wobbleMul: spec.wobbleMul });
  }

  const play = useMemo(
    () => () => {
      textScale.value = 1;
      textScale.value = withSequence(
        withSpring(INTRO_TEXT_PEAK, SPRING_TEXT_GROW),
        withSpring(0, SPRING_TEXT_COLLAPSE),
      );
      for (let i = 0; i < INTRO_COUNT; i++) {
        const delay = INTRO_BUBBLE_DELAY_MS + i * INTRO_BUBBLE_STAGGER_MS;
        travel[i].value = 0;
        inflate[i].value = 0;
        label[i].value = 0;
        travel[i].value = withDelay(delay, withSpring(1, SPRING_TRAVEL));
        inflate[i].value = withDelay(delay, withSpring(1, SPRING_INFLATE));
        label[i].value = withDelay(
          delay + INTRO_LABEL_DELAY_MS,
          withTiming(1, { duration: INTRO_LABEL_MS }),
        );
      }
    },
    // The shared values are stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { textScale, bubbles, play };
}
