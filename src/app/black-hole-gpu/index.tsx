import { BlackHoleGpu } from "@/components/black-hole-gpu/BlackHoleGpu";
import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView: ThemeView centers children, which collapses a
// flex-only WebGPU canvas to 0×0. The canvas only mounts while the tab is
// focused, so a hidden tab runs no GPU work.
export default function Index() {
  const focused = useIsFocused();
  return <View style={styles.container}>{focused && <BlackHoleGpu />}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
});
