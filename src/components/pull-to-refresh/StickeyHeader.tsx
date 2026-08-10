import { useState } from "react";
import { useRefreshLifecycle } from "./RefreshLifecycleContext";
import Animated, { useAnimatedReaction, useAnimatedStyle } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { View, Text, StyleSheet } from "react-native";
import { RefreshPhase } from "./hooks/useCustomRefreshConrol";

const STATUS_LABEL: Record<RefreshPhase, string> = {
  idle: "Latest",
  pulling: "Pull to refresh",
  refreshing: "Refreshing…",
  settling: "Updated",
};



const NEUTRAL_COLOR = "#fff";
const SUCCESS_COLOR = "#4ade80";
const ERROR_COLOR = "#f87171";

/**
 * A sticky section header that reflects the refresh lifecycle.
 *
 * Takes **no props** on purpose. `ListHeaderComponent` re-mounts whenever its
 * identity changes, and a re-mounting sticky header visibly flickers as it loses
 * its pinned position for a frame. Reading from context keeps this a stable
 * module-level reference.
 *
 * Its height is fixed. A sticky header whose height animates would move the
 * list's sticky offset every frame — which is exactly why the `inset`
 * indicator, whose height *is* the animation, can never be the sticky one.
 */
export function StickyStatusHeader() {
  const { progress, phase, spin, outcome } = useRefreshLifecycle();

  // The label is JS state, so it lags the UI thread by a frame — fine for text,
  // never for motion. Anything that has to track the finger stays in a worklet.
  const [label, setLabel] = useState(STATUS_LABEL.idle);

  useAnimatedReaction(
    () => phase.value,
    (current, previous) => {
      if (current === previous) return;
      scheduleOnRN(setLabel, STATUS_LABEL[current]);
    },
  );

  const barStyle = useAnimatedStyle(() => ({
    // A hairline that fills as you pull, then rides the spin loop while working.
    width:
      phase.value === "refreshing" || phase.value === "settling"
        ? `${50 + Math.sin(spin.value * Math.PI * 2) * 50}%`
        : `${progress.value * 100}%`,
    backgroundColor:
      outcome.value === "error"
        ? ERROR_COLOR
        : outcome.value === "success"
          ? SUCCESS_COLOR
          : NEUTRAL_COLOR,
  }));

  return (
    <View style={styles.stickyHeader}>
      <Text style={styles.stickyHeaderText}>{label}</Text>
      <Animated.View style={[styles.stickyHeaderBar, barStyle]} />
    </View>
  );
}
const styles =
  StyleSheet.create({
    stickyHeader: {
      width: "100%",
      // Opaque on purpose: a sticky header has rows scrolling underneath it, and
      // a transparent one would show them through.
      backgroundColor: "#1a1a1a",
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 8,
      marginBottom: 10.
    },
    stickyHeaderText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    stickyHeaderBar: {
      height: 2,
      borderRadius: 2,
    },
  })
