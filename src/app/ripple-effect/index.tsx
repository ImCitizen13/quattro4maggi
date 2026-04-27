import { RippleEffect } from "@/components/ripple-effect/RippleEffect";
import { ThemeView } from "@/components/Theme";
import React from "react";
import { StyleSheet } from "react-native";

export default function Index() {
  return (
    <ThemeView style={styles.container}>
      <RippleEffect />
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
