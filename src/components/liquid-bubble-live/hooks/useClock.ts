/**
 * Liquid Bubble Live — elapsed-seconds clock (phase 12B, Skia route)
 *
 * The background needs a wall clock and the bubble physics does not expose
 * one: `stepBubbleModes` advances `filmPhase`, but that is a tuned drift rate
 * for the thin-film colour cycle, not a time base to hang a second animation
 * off. A dedicated `useFrameCallback` is a handful of instructions per frame
 * on a thread that is already ticking, and keeps the background's speed
 * independent of `FILM_DRIFT`.
 *
 * `dt` is clamped to the same `[DT_MIN_MS, DT_MAX_MS]` window the mode physics
 * uses, so a stalled frame cannot jump the bands across the screen.
 */

import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { DT_MAX_MS, DT_MIN_MS } from '../../liquid-glass-bubble/bubbleModes';

/** Seconds elapsed since mount, advanced once per frame on the UI runtime. */
export function useClock(): SharedValue<number> {
  const time = useSharedValue<number>(0);

  useFrameCallback((frameInfo) => {
    'worklet';
    const dtMs = Math.min(
      Math.max(frameInfo.timeSincePreviousFrame ?? 16.7, DT_MIN_MS),
      DT_MAX_MS,
    );
    time.value += dtMs / 1000;
  }, true);

  return time;
}
