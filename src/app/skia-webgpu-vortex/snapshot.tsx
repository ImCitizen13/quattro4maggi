import { SnapshotCard } from "@/components/skia-webgpu-vortex/SnapshotCard";
import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView (it would collapse a flex-only GPU canvas). The
// card only mounts while the tab is focused, so a hidden tab holds no GPU work.
export default function Snapshot() {
  const focused = useIsFocused();
  return (
    <View style={styles.container}>{focused && <SnapshotCard />}</View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
});
