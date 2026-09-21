import { BouncingImagesBubble } from "@/components/liquid-bubble-live/BouncingImagesBubble";
import { LiquidBubbleLive } from "@/components/liquid-bubble-live/LiquidBubbleLive";
import { ThemeHeaderTitle } from "@/components/Theme";
import { Stack } from "expo-router";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type Mode = "float" | "bounce";

const MODES: { key: Mode; label: string }[] = [
  { key: "float", label: "Float" },
  { key: "bounce", label: "Bounce" },
];

/**
 * Plain `View`, not `ThemeView`: the Canvas is sized explicitly to the window
 * and a centering container buys nothing, while the background `<Fill>` wants
 * the whole screen.
 *
 * Only one demo is mounted at a time — both drive `useBubbleShape`, whose mode
 * state is a UI-runtime singleton.
 */
export default function Index() {
  const [mode, setMode] = useState<Mode>("float");

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Liquid Bubble Live" />,
        }}
      />
      {mode === "float" ? <LiquidBubbleLive /> : <BouncingImagesBubble />}

      <View style={styles.switcher} pointerEvents="box-none">
        {MODES.map(({ key, label }) => (
          <PressableScale
            key={key}
            onPress={() => setMode(key)}
            style={[styles.button, mode === key && styles.buttonActive]}
          >
            <Text
              style={[styles.buttonText, mode === key && styles.buttonTextActive]}
            >
              {label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  switcher: {
    position: "absolute",
    top: 12,
    right: 16,
    flexDirection: "row",
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#1a1a1a",
  },
  buttonActive: {
    backgroundColor: "#fff",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  buttonTextActive: {
    color: "#1a1a1a",
  },
});
