import { BouncingImagesBubble } from "@/components/liquid-bubble-live/BouncingImagesBubble";
import { ThemeHeaderTitle } from "@/components/Theme";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

/**
 * Plain `View`, not `ThemeView`: the Canvas is sized explicitly to the window
 * and a centering container buys nothing, while the background `<Fill>` wants
 * the whole screen.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Liquid Bubble Live" />,
        }}
      />
      <BouncingImagesBubble />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
});
