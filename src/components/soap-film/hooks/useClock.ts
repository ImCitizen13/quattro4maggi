/**
 * Soap Film — elapsed-seconds clock, advanced on the UI runtime.
 * Design notes: README.md → "hooks/useClock.ts". Mirrors
 * `liquid-bubble-live/hooks/useClock.ts` — kept demo-local (not imported
 * across demo folders) per the "each demo is self-contained" convention.
 */

import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

/** Clamp window for a single frame's delta-time, ms — guards a stalled frame. */
const DT_MIN_MS = 1;
const DT_MAX_MS = 48;

/** Seconds elapsed since mount, advanced once per frame on the UI runtime. */
export function useClock(): SharedValue<number> {
  const time = useSharedValue<number>(0);

  useFrameCallback((frameInfo) => {
    "worklet";
    const dtMs = Math.min(
      Math.max(frameInfo.timeSincePreviousFrame ?? 16.7, DT_MIN_MS),
      DT_MAX_MS,
    );
    time.value += dtMs / 1000;
  }, true);

  return time;
}
