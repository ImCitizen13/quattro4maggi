/**
 * ProgressBar — run progress (fraction of tiles swallowed) that doubles as a scrubber.
 *
 * FLOW:
 *   render worklet ─► writes `progress` every frame ─► fill + percent readout (UI thread)
 *   touch down / drag ─► `seekTarget` = x / width ─► the scene seeks the run to that
 *     fraction while held; the fill follows the finger, not `progress`
 *   release ─► `seekTarget` = -1, `paused` = false (scrubbing resumes a paused run)
 *     ─► onScrubEnd on the JS thread so the screen state machine can follow
 *
 * KEY FEATURES:
 * - Pan with minDistance 0: a plain tap seeks too
 * - Everything on the UI thread: no React re-render per frame or per drag tick
 * - Percent readout via the animated-TextInput trick (same as TuningSlider)
 * - 6 px track, 32 px touch area; dimmed and inert while `enabled` is false
 */
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// ============================================================================
// Types
// ============================================================================

export type ProgressBarProps = {
  /** 0..1 fraction of tiles swallowed, written every frame by the scene. */
  progress: SharedValue<number>;
  /** -1 = none; 0..1 = the scene seeks the run to this fraction while held. */
  seekTarget: SharedValue<number>;
  /** Cleared on release: scrubbing resumes a paused run. */
  paused: SharedValue<boolean>;
  /** Scrubbing allowed (a run exists); dims the bar otherwise. */
  enabled: boolean;
  /** Track width, px. */
  width: number;
  /** Called on the JS thread when a scrub ends. */
  onScrubEnd?: () => void;
};

// ============================================================================
// Constants
// ============================================================================

const TRACK_H = 6;
const TOUCH_H = 32;
const DISABLED_OPACITY = 0.4;

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// ============================================================================
// Component
// ============================================================================

export const ProgressBar = ({
  progress,
  seekTarget,
  paused,
  enabled,
  width,
  onScrubEnd,
}: ProgressBarProps) => {
  // What the bar shows: the scrub target while held, else the live progress.
  const shown = () => {
    "worklet";
    const t = seekTarget.value >= 0 ? seekTarget.value : progress.value;
    return Math.min(Math.max(t, 0), 1);
  };

  const seekFromX = (x: number) => {
    "worklet";
    seekTarget.value = Math.min(Math.max(x / width, 0), 1);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(enabled)
    .onBegin((e) => seekFromX(e.x))
    .onUpdate((e) => seekFromX(e.x))
    .onFinalize(() => {
      seekTarget.value = -1;
      paused.value = false;
      if (onScrubEnd) scheduleOnRN(onScrubEnd);
    });

  const fillStyle = useAnimatedStyle(() => ({ width: shown() * width }));

  const readoutProps = useAnimatedProps(() => {
    const text = `${Math.round(shown() * 100)}%`;
    // `text` drives the native input; typing is disabled so it acts as a label
    return { text, defaultValue: text } as { text: string; defaultValue: string };
  });

  return (
    <View style={[styles.root, !enabled && styles.disabled]}>
      <View style={styles.header}>
        <Text style={styles.label}>Progress</Text>
        <AnimatedTextInput
          style={styles.readout}
          editable={false}
          animatedProps={readoutProps}
        />
      </View>
      <GestureDetector gesture={pan}>
        <View style={[styles.touch, { width }]}>
          <View style={[styles.trackBase, { width }]} />
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  root: { gap: 2 },
  disabled: { opacity: DISABLED_OPACITY },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { color: "#fff", fontSize: 14, fontWeight: "600" },
  readout: {
    color: "#8a8a8a",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    padding: 0,
    minWidth: 44,
    textAlign: "right",
  },
  touch: { height: TOUCH_H, justifyContent: "center" },
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
    backgroundColor: "#4a3a8a",
  },
});
