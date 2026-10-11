/**
 * useChoreographyB — the alternate intro: the greeting shrinks up and away
 * while four bubbles float up from below the screen into the same quad
 * choreography A blooms. One scrubbable `progress`, driven by a button (via
 * `show`/`hide`) or by the user's vertical drag (`pan`).
 * The timeline and constants: ../animation_timeline.md → "Choreography B".
 *
 * FLOW:
 *   ONE master value, `progress: SharedValue<number>`, 0 → 1. Everything else
 *   is a pure function of it (`interpolate` a window, shape with an easing),
 *   so it plays and scrubs identically in both directions.
 *
 *   rest (progress = 0): greeting fully visible; all four bubbles at r = 0,
 *     parked below the screen bottom.
 *   0 → B_TEXT_WINDOW end: greeting rises B_TEXT_RISE pt, scales 1 → 0 and
 *     fades (ease-in — it lingers, then leaves).
 *   B_BUBBLE_START →: per bubble i, offset by i · B_BUBBLE_STAGGER, over
 *     B_BUBBLE_WINDOW:
 *       inflate[i]  0 → 1  ease-out cubic → r = radius · radiusMul
 *       travel[i]   0 → 1  ease-out back  → y = below screen → quad slot
 *       label[i]    fades in from B_LABEL_DELAY of the window
 *   1 → 0 reverses everything exactly.
 *   settled at 1: the same sin drift as choreography A, gated by arrival.
 *
 *   pan (vertical drag): progress = start − translationY / scrubDistance,
 *     clamped 0..1, where scrubDistance = height · B_SCRUB_FRACTION (half the
 *     screen). On release the POSITION decides (progress ≥ 0.5 → 1, else 0);
 *     only a very hard flick (|v| > B_FLICK_VELOCITY) overrides it (up → 1,
 *     down → 0). The release spring is seeded with the gesture's velocity in
 *     progress units, clamped to ±B_MAX_SETTLE_VELOCITY so even a hard flick
 *     settles at a controlled pace.
 *
 * KEY FEATURES:
 * - Same quad (`SPECS`) and drift constants as A — nothing duplicated.
 * - Deliberate exception to the project's prefer-`withSpring` rule: the
 *   button's `show`/`hide` are LINEAR timed runs (`B_SHOW_MS`, scaled by
 *   remaining distance). A spring front-loads its motion, and the per-stage
 *   easing windows already shape it, so a spring made the button run far too
 *   fast. The drag RELEASE still springs, because it carries finger velocity.
 * - The rise's back-ease overshoots the slot on arrival, so the glass wobbles
 *   for free (see animation_timeline.md, "the wobble is free").
 * - Radius and text scale are clamped ≥ 0 so spring overshoot past 0/1 is safe.
 * - `activeOffsetY([-12, 12])` keeps taps reaching a raced tap gesture.
 */

import { useMemo } from "react";
import { Gesture, type PanGesture } from "react-native-gesture-handler";
import {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useDerivedValue,
  ReduceMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  B_BUBBLE_STAGGER,
  B_BUBBLE_START,
  B_BUBBLE_WINDOW,
  B_FLICK_VELOCITY,
  B_LABEL_DELAY,
  B_MAX_SETTLE_VELOCITY,
  B_RISE_FROM,
  B_SCRUB_FRACTION,
  B_SHOW_MS,
  B_SPRING,
  B_TEXT_RISE,
  B_TEXT_WINDOW,
  INTRO_COUNT,
  INTRO_DRIFT_PERIOD,
  INTRO_DRIFT_X,
  INTRO_DRIFT_Y,
} from "../multiBubbleConfig";
import { SPECS, type IntroBubble } from "./useIntroTimeline";

// ============================================================================
// Types
// ============================================================================

export type UseChoreographyBParams = {
  /** Quad centre — the same point A blooms from (screen centre + TEXT_Y_DEFAULT). */
  centerX: number;
  centerY: number;
  /** Screen height, pt — bubbles start below it. */
  height: number;
  /** Mean radius, pt; each bubble is × INTRO_RADIUS_MUL[i] (the Bubble panel's Size slider). */
  radius: SharedValue<number>;
  /** Live offset of the arrangement (Text panel's Bubble X / Y). */
  offsetX?: SharedValue<number>;
  offsetY?: SharedValue<number>;
  /** Seconds, for the resting drift (useClock). */
  time: SharedValue<number>;
};

export type UseChoreographyBReturn = {
  /** 0 = greeting shown, 1 = bubbles shown. */
  progress: SharedValue<number>;
  /** Multiplies the greeting's opacity. */
  textOpacity: DerivedValue<number>;
  /** The greeting's extra scale, 1 → 0. Multiplied onto the Text panel's size scale by the caller. */
  textScale: DerivedValue<number>;
  /** The greeting's extra Y offset, pt: 0 → −B_TEXT_RISE (up). */
  textTranslateY: DerivedValue<number>;
  /** One per INTRO_COUNT, in slot order, same quad as A. `inflate` = the bubble's 0→1 scale curve (drives birth optics). */
  bubbles: IntroBubble[];
  /** Linear timed run progress → 1 (B_SHOW_MS). A worklet: callable from the UI thread; the JS caller wraps it in scheduleOnUI. */
  show: () => void;
  /** Linear timed run progress → 0. Same threading as show. */
  hide: () => void;
  /** The vertical scrub/flick gesture described above. Built with useMemo; stable for the mount. */
  pan: PanGesture;
};

// ============================================================================
// Easing shapes
// ============================================================================

/** Greeting leaves: ease-in, so it lingers a beat and then goes. */
const textEase = Easing.in(Easing.cubic);

/** Rise: ease-out with a slight back overshoot — the arrival wobble drive. */
const riseEase = Easing.out(Easing.back(0.6));

/** Scale-up: plain ease-out, no overshoot, so the radius can never dip < 0. */
const inflateEase = Easing.out(Easing.cubic);

// ============================================================================
// Hook
// ============================================================================

export function useChoreographyB({
  centerX,
  centerY,
  height,
  radius,
  offsetX,
  offsetY,
  time,
}: UseChoreographyBParams): UseChoreographyBReturn {
  const progress = useSharedValue(0);
  /** `progress` at the moment a drag began. */
  const startProgress = useSharedValue(0);

  // ==========================================================================
  // Greeting: rises, shrinks to nothing, fades
  // ==========================================================================

  const textT = useDerivedValue(() =>
    textEase(
      interpolate(
        progress.value,
        [B_TEXT_WINDOW[0], B_TEXT_WINDOW[1]],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    ),
  );
  const textScale = useDerivedValue(() => Math.max(0, 1 - textT.value));
  const textTranslateY = useDerivedValue(() => -B_TEXT_RISE * textT.value);
  const textOpacity = useDerivedValue(() =>
    Math.min(Math.max(1 - textT.value * 1.25, 0), 1),
  );

  // ==========================================================================
  // The four bubbles: float up from below, scaling as they rise
  // ==========================================================================

  const bubbles: IntroBubble[] = [];
  for (let i = 0; i < INTRO_COUNT; i++) {
    const spec = SPECS[i];
    const startT = B_BUBBLE_START + i * B_BUBBLE_STAGGER;
    const endT = startT + B_BUBBLE_WINDOW;

    /* eslint-disable react-hooks/rules-of-hooks */
    // Raw 0..1 position in this bubble's window, before any easing.
    const windowT = useDerivedValue(() =>
      interpolate(
        progress.value,
        [startT, endT],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    );
    const inflateT = useDerivedValue(() => inflateEase(windowT.value));
    const riseT = useDerivedValue(() => riseEase(windowT.value));
    const labelOpacity = useDerivedValue(() =>
      interpolate(
        windowT.value,
        [B_LABEL_DELAY, 1],
        [0, 1],
        Extrapolation.CLAMP,
      ),
    );

    // Drift is gated by arrival (windowT reaches 1 exactly at the end).
    const x = useDerivedValue(() => {
      const wr = (2 * Math.PI) / INTRO_DRIFT_PERIOD;
      const drift =
        INTRO_DRIFT_X * Math.sin(time.value * wr * spec.rate + spec.phase);
      const off = offsetX === undefined ? 0 : offsetX.value;
      return centerX + off + spec.dx + drift * windowT.value;
    });
    const y = useDerivedValue(() => {
      const wr = (2 * Math.PI) / (INTRO_DRIFT_PERIOD * 1.27);
      const drift =
        INTRO_DRIFT_Y *
        Math.sin(time.value * wr * spec.rate + spec.phase * 1.4);
      const off = offsetY === undefined ? 0 : offsetY.value;
      const restY = centerY + off + spec.dy;
      const fromY = height + radius.value * spec.radiusMul + B_RISE_FROM;
      // riseT overshoots 1 on arrival, carrying the bubble a touch past its slot.
      return restY + (fromY - restY) * (1 - riseT.value) + drift * windowT.value;
    });
    const r = useDerivedValue(
      () => radius.value * spec.radiusMul * Math.max(0, inflateT.value),
    );
    /* eslint-enable react-hooks/rules-of-hooks */

    bubbles.push({
      x,
      y,
      r,
      labelOpacity,
      inflate: inflateT,
      wobbleMul: spec.wobbleMul,
    });
  }

  // ==========================================================================
  // Controls
  // ==========================================================================

  const show = useMemo(
    () => () => {
      "worklet";
      cancelAnimation(progress);
      const p = Math.min(Math.max(progress.value, 0), 1);
      progress.value = withTiming(1, {
        duration: B_SHOW_MS * (1 - p),
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      });
    },
    // `progress` is stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const hide = useMemo(
    () => () => {
      "worklet";
      cancelAnimation(progress);
      const p = Math.min(Math.max(progress.value, 0), 1);
      progress.value = withTiming(0, {
        duration: B_SHOW_MS * p,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ==========================================================================
  // Gesture: vertical scrub + flick
  // ==========================================================================

  const pan = useMemo(() => {
    /** Drag distance, pt, for the full 0 → 1. */
    const scrubDistance = height * B_SCRUB_FRACTION;

    /** Spring to `target`, seeded with the release velocity (progress/s). */
    const settle = (target: number, velocity: number) => {
      "worklet";
      progress.value = withSpring(target, { ...B_SPRING, velocity });
    };

    return Gesture.Pan()
      .activeOffsetY([-12, 12])
      .onBegin(() => {
        cancelAnimation(progress);
        startProgress.value = progress.value;
      })
      .onUpdate((e) => {
        progress.value = Math.min(
          Math.max(startProgress.value - e.translationY / scrubDistance, 0),
          1,
        );
      })
      .onEnd((e) => {
        const v = Math.min(
          Math.max(-e.velocityY / scrubDistance, -B_MAX_SETTLE_VELOCITY),
          B_MAX_SETTLE_VELOCITY,
        );
        // Position decides; only a very hard flick overrides it.
        let target = progress.value >= 0.5 ? 1 : 0;
        if (e.velocityY < -B_FLICK_VELOCITY) target = 1;
        else if (e.velocityY > B_FLICK_VELOCITY) target = 0;
        settle(target, v);
      })
      .onFinalize((_e, success) => {
        // Cancelled by the system: never leave `progress` stranded mid-way.
        if (!success && progress.value > 0 && progress.value < 1) {
          settle(progress.value >= 0.5 ? 1 : 0, 0);
        }
      });
    // Shared values are stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    progress,
    textOpacity,
    textScale,
    textTranslateY,
    bubbles,
    show,
    hide,
    pan,
  };
}
