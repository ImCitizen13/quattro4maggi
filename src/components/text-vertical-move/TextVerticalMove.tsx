/**
 * TextVerticalMove
 *
 * Experiment: text that animates vertically (e.g. scrolling lines, vertical marquee).
 *
 * KEY FEATURES:
 * - Placeholder for vertical text motion animation
 * - To be extended with Reanimated + optional Skia
 *
 * FLOW:
 * - (TBD) User interaction or auto-play drives vertical movement
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type TextVerticalMoveProps = {
  /** Placeholder for future props */
};

export default function TextVerticalMove(_props: TextVerticalMoveProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Text Vertical Move</Text>
      <Text style={styles.hint}>Experiment placeholder — add animation here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  placeholder: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
  },
  hint: {
    color: "#888",
    fontSize: 14,
  },
});
