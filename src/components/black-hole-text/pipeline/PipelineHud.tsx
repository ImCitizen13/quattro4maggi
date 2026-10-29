/**
 * PipelineHud
 *
 * Bottom overlay: `<source> · <count> particles · step <ms> ms` plus chips to
 * change the particle count.
 *
 * The step time is pulled from the UI runtime on a throttled cadence
 * (HUD_REPORT_INTERVAL_MS), never per frame.
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAnimatedReaction } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { PressableScale } from "pressto";

import { PARTICLE_COUNTS } from "./constants";

// ============================================================================
// Types
// ============================================================================

export type PipelineHudProps = {
  sourceName: string;
  count: number;
  onCountChange: (count: number) => void;
  /** Mean step ms, published by the driver every report interval */
  stepMs?: SharedValue<number>;
};

const formatCount = (n: number) => (n >= 1000 ? `${n / 1000}K` : `${n}`);

// ============================================================================
// Component
// ============================================================================

export function PipelineHud({
  sourceName,
  count,
  onCountChange,
  stepMs,
}: PipelineHudProps) {
  const insets = useSafeAreaInsets();
  const [ms, setMs] = useState(0);

  // stepMs only changes once per report interval, so this fires ~2x/sec
  useAnimatedReaction(
    () => stepMs?.value ?? 0,
    (v) => {
      scheduleOnRN(setMs, v);
    }
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: insets.bottom + 12 }]}
    >
      <Text style={styles.readout}>
        {sourceName} · {count.toLocaleString()} particles · step {ms.toFixed(2)} ms
      </Text>
      <View style={styles.chips}>
        {PARTICLE_COUNTS.map((n) => (
          <PressableScale
            key={n}
            onPress={() => onCountChange(n)}
            style={[styles.chip, n === count && styles.chipActive]}
          >
            <Text style={[styles.chipText, n === count && styles.chipTextActive]}>
              {formatCount(n)}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  readout: {
    color: "#fff",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  chips: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  chipActive: {
    backgroundColor: "#fff",
  },
  chipText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#1a1a1a",
  },
});
