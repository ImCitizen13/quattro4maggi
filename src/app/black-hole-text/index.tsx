import { BlackHoleText } from "@/components/black-hole-text/BlackHoleText";
import { ThemeHeaderTitle } from "@/components/Theme";
import { Stack } from "expo-router";
import {
  markLayout,
  resetLayoutLog,
} from "@/components/black-hole-text/pipeline/layoutDebug";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

// Plain View, not ThemeView: ThemeView centers children, which collapses a
// flex-only WebGPU canvas to 0×0.
export default function Index() {
  // TEMPORARY layout-order markers (see pipeline/layoutDebug.ts)
  // Lazy-init state runs once on the first render only → clock starts there
  useState(() => {
    resetLayoutLog();
    return 0;
  });
  markLayout("route render");
  // Children's layout effects run first, so Stack.Screen's setOptions has run
  useLayoutEffect(() => markLayout("route useLayoutEffect (setOptions done)"), []);
  useEffect(() => markLayout("route useEffect (after paint)"), []);

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        markLayout(`route onLayout h=${e.nativeEvent.layout.height.toFixed(1)}`)
      }
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Black Hole Text" />,
        }}
      />
      <BlackHoleText />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
});
