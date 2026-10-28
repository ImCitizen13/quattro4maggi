import { Placeholder } from "@/components/skia-webgpu-vortex/Placeholder";
import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView (it would collapse a flex-only GPU canvas). Content
// only mounts while the tab is focused so a hidden tab holds no GPU work.
export default function WebGpu() {
  const focused = useIsFocused();
  return (
    <View style={styles.container}>
      {focused && (
        <Placeholder
          title="WebGPU"
          description="An animated TypeGPU gradient as a WebGPU texture source for the vortex. Later task."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
});
