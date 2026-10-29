import { ThreadsExample } from "@/components/pull-to-refresh/threads-example/ThreadsExample";
import { useIsFocused } from "expo-router/react-navigation";
import React from "react";
import { StyleSheet, View } from "react-native";

// Plain View: the posts' VortexSnapshot canvases need real flex sizing. The
// feed only mounts while focused so its GPU scenes are torn down on blur.
export default function Threads() {
  const focused = useIsFocused();
  return <View style={styles.container}>{focused && <ThreadsExample />}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
});
