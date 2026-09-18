/**
 * Liquid Bubble Live — elapsed-seconds clock for the background.
 * Design notes: README.md → "hooks/useClock.ts".
 */

import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { DT_MAX_MS, DT_MIN_MS } from '../bubbleModes';

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
