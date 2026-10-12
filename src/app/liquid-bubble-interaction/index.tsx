import { LiquidBubbleInteraction } from "@/components/liquid-bubble-interaction/LiquidBubbleInteraction";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

/**
 * Plain `View`, not `ThemeView`: centering would collapse the scene, which
 * sizes itself from `onLayout`.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <LiquidBubbleInteraction />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
});
