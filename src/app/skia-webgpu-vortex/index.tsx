import { Placeholder } from "@/components/skia-webgpu-vortex/Placeholder";
import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView (it would collapse a flex-only GPU canvas). Content
// only mounts while the tab is focused so a hidden tab holds no GPU work.
export default function Skottie() {
  const focused = useIsFocused();
  return (
    <View style={styles.container}>
      {focused && (
        <Placeholder
          title="Skottie"
          description="A Skottie (Lottie) animation as a Skia texture source for the vortex. Filled by tasks 33 and 34."
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
});
