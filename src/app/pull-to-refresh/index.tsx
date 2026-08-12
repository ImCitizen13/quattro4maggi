import { ThemeHeaderTitle, ThemeView } from "@/components/Theme";
import { PullToRefresh } from "@/components/pull-to-refresh/PullToRefresh";
import { Stack } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";

export default function Index() {
  return (
    <ThemeView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Pull To Refresh" />,
        }}
      />
      <PullToRefresh />
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // ThemeView's base style pads every screen by 10pt; this demo's headers
    // and overlay indicator are designed edge-to-edge, so strip it here.
    padding: 0,
  },
});
