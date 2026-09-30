/**
 * IslandFps
 *
 * FPS-only pill pinned just below the Dynamic Island. The minimal sibling of
 * `FpsOverlay` — same UI-thread measurement as its `ui` row, but only the
 * frame-rate number, no jank / max / work columns.
 *
 * FLOW
 *   useFrameCallback (UI thread) accumulates frames + elapsed time
 *     → every `intervalMs`, scheduleOnRN one setState with the mean fps
 *     → re-renders ~2×/sec, NOT per frame.
 *   Position: rendered through a Portal (screen coordinates, so a navigation
 *   header can't push it down), `FPS_GAP + offset` below the Dynamic
 *   Island's bottom edge — the same island geometry ibtasim's
 *   `useGetDynamicIslandDimensions` uses. No island → safe-area top inset.
 *
 * USAGE
 *   Anywhere under the root PortalProvider (it's `pointerEvents:none`):
 *     {SHOW_FPS_OVERLAY && <IslandFps />}
 *
 * CAVEATS
 *   - Same as FpsOverlay: simulators cap at 60Hz; ProMotion drops the display
 *     link on static content, so low fps there is not jank.
 *   - The island size is hard-coded (Apple doesn't expose it), not measured.
 */

import { Portal } from "@gorhom/portal";
import React, { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

// ============================================================================
// Config
// ============================================================================

/** Gap between the island's bottom edge and the pill, pt. */
const FPS_GAP = 8;

/** Dynamic Island height, pt. */
const ISLAND_HEIGHT = 36.5;

/** Island's distance from the screen top, pt: Max/Plus-size vs base models. */
const ISLAND_TOP_MAX = 25;
const ISLAND_TOP_NORMAL = 14;

/** Screen height (pt) from which a phone counts as Max/Plus-size. */
const MAX_SCREEN_HEIGHT = 932;

/** Top inset (pt) from which a phone is assumed to have a Dynamic Island. */
const ISLAND_MIN_INSET = 51;

// ============================================================================
// Types
// ============================================================================

export type IslandFpsProps = {
  /** Reporting cadence in ms (how often the number updates). Default 500. */
  intervalMs?: number;
  /** Extra gap on top of `FPS_GAP`, pt. Default 0. */
  offset?: number;
};

// ============================================================================
// Component
// ============================================================================

export function IslandFps({ intervalMs = 500, offset = 0 }: IslandFpsProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [fps, setFps] = useState(0);

  const hasIsland = insets.top >= ISLAND_MIN_INSET;
  const islandTop =
    screenHeight >= MAX_SCREEN_HEIGHT ? ISLAND_TOP_MAX : ISLAND_TOP_NORMAL;
  const islandBottomY = hasIsland ? islandTop + ISLAND_HEIGHT : insets.top;

  const frames = useSharedValue(0);
  const elapsed = useSharedValue(0);

  useFrameCallback((info) => {
    "worklet";
    const dt = info.timeSincePreviousFrame ?? 0;
    if (dt <= 0) return;

    frames.value += 1;
    elapsed.value += dt;

    if (elapsed.value >= intervalMs) {
      scheduleOnRN(setFps, Math.round(1000 / (elapsed.value / frames.value)));
      frames.value = 0;
      elapsed.value = 0;
    }
  });

  return (
    <Portal>
      <View
        pointerEvents="none"
        style={[styles.pill, { top: islandBottomY + FPS_GAP + offset }]}
      >
        <Text style={styles.text}>{fps} fps</Text>
      </View>
    </Portal>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(127,127,127,0.70)",
  },
  text: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
