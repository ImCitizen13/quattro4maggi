import { LiveCanvasCard } from "@/components/skia-webgpu-vortex/LiveCanvasCard";
import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView (it would collapse a flex-only GPU canvas). The
// card only mounts while the tab is focused, so a hidden tab holds no GPU work.
export default function WebGpu() {
  const focused = useIsFocused();
  return (
    <View style={styles.container}>{focused && <LiveCanvasCard />}</View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
});
