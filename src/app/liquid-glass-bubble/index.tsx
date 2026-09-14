import { LiquidBubbles } from "@/components/liquid-glass-bubble/LiquidBubbles";
import { ThemeHeaderTitle, ThemeView } from "@/components/Theme";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

export default function Index() {
  return (
    <ThemeView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Liquid Glass Bubble" />,
        }}
      />
      <LiquidBubbles />
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
