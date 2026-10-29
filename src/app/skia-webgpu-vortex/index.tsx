import { SkottieVortex } from "@/components/skia-webgpu-vortex/SkottieVortex";
import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView (it would collapse a flex-only GPU canvas). Content
// only mounts while the tab is focused so a hidden tab holds no GPU work, and a
// tab switch mid-run unmounts (and tears down) the whole vortex.
export default function Skottie() {
  const focused = useIsFocused();
  return <View style={styles.container}>{focused && <SkottieVortex />}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
});
