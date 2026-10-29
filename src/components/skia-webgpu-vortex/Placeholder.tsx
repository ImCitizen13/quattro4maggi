import React from "react";
import { StyleSheet, Text, View } from "react-native";

// ============================================================================
// Types
// ============================================================================

export type PlaceholderProps = {
  /** Tab name. */
  title: string;
  /** What will go on this tab. */
  description: string;
};

// ============================================================================
// Component
// ============================================================================

/** Centered "coming later" card naming what a tab will hold. */
export function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    gap: 8,
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  description: { color: "#fff", opacity: 0.7, fontSize: 15, lineHeight: 21 },
});
