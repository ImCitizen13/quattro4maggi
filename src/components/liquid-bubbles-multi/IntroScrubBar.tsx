/**
 * IntroScrubBar — drags `useIntroTimeline`'s `progress` by hand, to
 * choreograph the intro instead of just watching it play. Design notes:
 * README.md → "IntroScrubBar.tsx".
 *
 * FLOW:
 *   Gesture.Pan (onBegin/onChange) → cancelAnimation(progress) once, then
 *     writes `progress.value` straight from the touch x — same shape as
 *     `TuningSlider`'s own pan gesture, all on the UI thread
 *   Play/Pause → intro.play() (resumes from wherever progress is) /
 *     cancelAnimation(progress)
 *   readout → the animated-TextInput trick, same as `TuningSlider`'s
 *   tick marks → the same normalized stage windows `useIntroTimeline`
 *     derives its curves from (swell end, collapse end, each bubble's start)
 *
 * KEY FEATURES:
 * - Dragging never re-renders React: the Pan gesture's callbacks write
 *   `progress` directly, same discipline as every other slider in this demo.
 * - `TuningSlider` (`@/components/liquid-metal/TuningSlider`) was NOT reused
 *   directly — it always drives its own uncontrolled 0..1 gesture and has no
 *   hook to run `cancelAnimation` before the first write, which is required
 *   here (a running `play()` timing would otherwise fight the finger). Its
 *   track/fill/thumb visual structure and the animated-TextInput readout
 *   trick ARE reused, so the bar matches the tuning panels' house style.
 */

import React, { useMemo } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { PressableScale } from "pressto";

import {
  INTRO_BUBBLE_DELAY_MS,
  INTRO_BUBBLE_STAGGER_MS,
  INTRO_COUNT,
  INTRO_TOTAL_MS,
  TRIGGER_COLLAPSE_MS,
  TRIGGER_SWELL_MS,
} from "./multiBubbleConfig";

// ============================================================================
// Types
// ============================================================================

export type IntroScrubBarProps = {
  /** The intro's master value — dragged directly, written directly. */
  progress: SharedValue<number>;
  /** Runs the intro forward from wherever `progress` currently is. */
  play: () => void;
};

// ============================================================================
// Tick marks — the same normalized windows useIntroTimeline shapes its
// curves from: swell end, collapse end, each bubble's bloom start.
// ============================================================================

const SWELL_END_T = TRIGGER_SWELL_MS / INTRO_TOTAL_MS;
const COLLAPSE_END_T = (TRIGGER_SWELL_MS + TRIGGER_COLLAPSE_MS) / INTRO_TOTAL_MS;
const BLOOM_START_MS = TRIGGER_SWELL_MS + TRIGGER_COLLAPSE_MS + INTRO_BUBBLE_DELAY_MS;
const BUBBLE_START_TS: readonly number[] = Array.from(
  { length: INTRO_COUNT },
  (_, i) => (BLOOM_START_MS + i * INTRO_BUBBLE_STAGGER_MS) / INTRO_TOTAL_MS,
);

const TICKS: readonly number[] = [SWELL_END_T, COLLAPSE_END_T, ...BUBBLE_START_TS];

// ============================================================================
// Component
// ============================================================================

const THUMB = 22;
const TRACK_H = 6;

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export function IntroScrubBar({ progress, play }: IntroScrubBarProps) {
  const trackWidth = useSharedValue(0);

  const setFromX = (x: number) => {
    "worklet";
    const usable = Math.max(trackWidth.value - THUMB, 1);
    const t = Math.min(Math.max((x - THUMB / 2) / usable, 0), 1);
    progress.value = t;
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          // Stop the running timing first, so it can't fight the finger.
          cancelAnimation(progress);
          setFromX(e.x);
        })
        .onChange((e) => setFromX(e.x)),
    // `progress` and `trackWidth` are stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Runs on the JS thread, same as `intro.reset`'s own onPress elsewhere in
  // this demo — `cancelAnimation` works from either thread.
  const pause = () => {
    cancelAnimation(progress);
  };

  const thumbStyle = useAnimatedStyle(() => {
    const usable = Math.max(trackWidth.value - THUMB, 1);
    return { transform: [{ translateX: progress.value * usable }] };
  });

  const fillStyle = useAnimatedStyle(() => {
    const usable = Math.max(trackWidth.value - THUMB, 1);
    return { width: progress.value * usable + THUMB / 2 };
  });

  const readoutProps = useAnimatedProps(() => {
    const text = progress.value.toFixed(2);
    return { text, defaultValue: text } as { text: string; defaultValue: string };
  });

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <PressableScale style={styles.playButton} onPress={play}>
          <Text style={styles.playButtonText}>Play</Text>
        </PressableScale>
        <PressableScale style={styles.playButton} onPress={pause}>
          <Text style={styles.playButtonText}>Pause</Text>
        </PressableScale>
        <AnimatedTextInput
          style={styles.readout}
          editable={false}
          animatedProps={readoutProps}
        />
      </View>

      <GestureDetector gesture={pan}>
        <View
          style={styles.track}
          hitSlop={16}
          onLayout={(e) => {
            trackWidth.value = e.nativeEvent.layout.width;
          }}
        >
          <View style={styles.trackBase} />
          {TICKS.map((t, i) => (
            <View key={i} style={[styles.tick, { left: `${t * 100}%` }]} />
          ))}
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    padding: 16,
    gap: 12,
    borderRadius: 12,
    backgroundColor: "rgba(26, 26, 26, 0.92)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#2E2E2E",
  },
  playButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  readout: {
    marginLeft: "auto",
    color: "#8a8a8a",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    padding: 0,
    minWidth: 44,
    textAlign: "right",
  },
  track: {
    height: THUMB,
    justifyContent: "center",
  },
  trackBase: {
    position: "absolute",
    left: 0,
    right: 0,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: "#2E2E2E",
  },
  tick: {
    position: "absolute",
    top: (THUMB - TRACK_H) / 2 - 2,
    width: 2,
    height: TRACK_H + 4,
    backgroundColor: "#555",
  },
  fill: {
    position: "absolute",
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: "#6a6a6a",
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#fff",
  },
});
