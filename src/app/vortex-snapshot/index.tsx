import { VortexSnapshotDemo } from "@/components/black-hole-gpu/VortexSnapshotDemo";
import { ThemeHeaderTitle } from "@/components/Theme";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView: ThemeView centers children, which collapses a
// flex-only WebGPU canvas to 0×0.
export default function Index() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Vortex Snapshot" />,
        }}
      />
      <VortexSnapshotDemo />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
});
