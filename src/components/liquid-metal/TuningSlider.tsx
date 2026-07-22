/**
 * TuningSlider — a minimal, dependency-free slider that writes to a shared
 * value so a shader uniform can be tuned live on the UI thread (no React
 * re-render per drag tick). Built on Reanimated + a Pan gesture.
 *
 * The numeric readout uses the animated-TextInput trick (useAnimatedProps
 * setting `text`) so the label stays on the UI thread too.
 *
 * @example
 * const smooth = useSharedValue(14);
 * <TuningSlider label="Stickiness" value={smooth} min={2} max={40} />
 */

import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

export type TuningSliderProps = {
  /** Caption shown to the left of the value */
  label: string;
  /** Shared value the slider reads and writes */
  value: SharedValue<number>;
  /** Lower bound */
  min: number;
  /** Upper bound */
  max: number;
  /** Track width in px @default 260 */
  width?: number;
  /** Decimal places in the readout @default 0 */
  decimals?: number;
};

const THUMB = 22;
const TRACK_H = 6;

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// ============================================================================
// COMPONENT
// ============================================================================

export function TuningSlider({
  label,
  value,
  min,
  max,
  width = 260,
  decimals = 0,
}: TuningSliderProps) {
  const usable = width - THUMB;

  const setFromX = (x: number) => {
    "worklet";
    const t = Math.min(Math.max((x - THUMB / 2) / usable, 0), 1);
    value.value = min + t * (max - min);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => setFromX(e.x))
    .onChange((e) => setFromX(e.x));

  const thumbStyle = useAnimatedStyle(() => {
    const t = (value.value - min) / (max - min);
    return { transform: [{ translateX: t * usable }] };
  });

  const fillStyle = useAnimatedStyle(() => {
    const t = (value.value - min) / (max - min);
    return { width: t * usable + THUMB / 2 };
  });

  const readoutProps = useAnimatedProps(() => {
    const text = value.value.toFixed(decimals);
    // `text` drives the native input; typing is disabled so it acts as a label
    return { text, defaultValue: text } as { text: string; defaultValue: string };
  });

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <AnimatedTextInput
          style={styles.readout}
          editable={false}
          animatedProps={readoutProps}
        />
      </View>

      <GestureDetector gesture={pan}>
        <View style={[styles.track, { width }]} hitSlop={16}>
          <View style={[styles.trackBase, { width }]} />
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  row: {
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  readout: {
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
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: "#2E2E2E",
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
