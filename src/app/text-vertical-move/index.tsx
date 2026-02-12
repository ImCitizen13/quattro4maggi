import TextVerticalMove from "@/components/text-vertical-move/TextVerticalMove";
import { ThemeHeaderTitle, ThemeView } from "@/components/Theme";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

export default function TextVerticalMoveScreen() {
  return (
    <ThemeView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => (
            <ThemeHeaderTitle text="Text Vertical Move" />
          ),
        }}
      />
      <TextVerticalMove />
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
