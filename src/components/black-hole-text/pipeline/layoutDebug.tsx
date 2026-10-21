/**
 * layoutDebug (TEMPORARY)
 *
 * Ordered, timestamped markers for the render / layout sequence of the
 * black-hole screen. Each mark is console.logged and kept in a list the
 * pipeline renders on screen. Remove once the center fix lands.
 */

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

let T0 = performance.now();

/** Reset the clock + list (call at route render so times are route-relative). */
export function resetLayoutLog() {
  if (LAYOUT_LOG.length > 40) LAYOUT_LOG.length = 0;
  T0 = performance.now();
}

export const LAYOUT_LOG: string[] = [];

export function markLayout(label: string) {
  const line = `${(performance.now() - T0).toFixed(1)}ms  ${label}`;
  LAYOUT_LOG.push(line);
  console.log(`[BH layout] ${line}`);
}

/** Re-renders every 250ms for 3s so late marks (onLayout) show up. */
export function LayoutLogOverlay() {
  // Snapshot into state: React Compiler memoizes reads of module globals
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => setLines(LAYOUT_LOG.slice(-14)), 250);
    const stop = setTimeout(() => clearInterval(id), 3000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, []);
  return (
    <View pointerEvents="none" style={styles.debug}>
      {lines.map((line, i) => (
        <Text key={i} style={styles.debugText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  debug: {
    position: "absolute",
    top: 110,
    left: 12,
    right: 12,
    gap: 2,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  debugText: {
    color: "#7CFC9A",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
});
