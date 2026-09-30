import { SoapFilm } from "@/components/soap-film/SoapFilm";
import { ThemeHeaderTitle } from "@/components/Theme";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

// `ThemeView` centers its children (no `flex:1` on the cross axis), which
// collapses a flex-only Skia `<Canvas>` to 0x0 — see
// `.claude/rules/webgpu-shaders.md` → "Screens" (same collapse, not a
// WebGPU-only issue). A plain `View` keeps the canvas full-size.
export default function Index() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Soap Film" />,
        }}
      />
      <SoapFilm />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
});
