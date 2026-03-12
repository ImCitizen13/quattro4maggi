import LiveBorderTimer from "@/components/timer/LiveBorderTimer";
import MorphingHourGlassTimer from "@/components/timer/MorphingHourGlassTimer";
import React from "react";
import { StyleSheet, View } from "react-native";
import PagerView from "react-native-pager-view";

export default function Timer() {

  console.log("View Refreshed ♻️");

  return (
    <PagerView style={styles.container} initialPage={0}>
      <View style={styles.container} key={1}>
        <LiveBorderTimer />
      </View>
      <View style={styles.container} key={2}>
        <MorphingHourGlassTimer />
      </View>
    </PagerView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    gap: 32,
  },
  timerContent: {
    flex: 1,

    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "rgb(255, 255, 255)",
    fontVariant: ["tabular-nums"],
  },
  label: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.6)",
    fontWeight: "500",
  },
  controls: {
    flexDirection: "column",
    gap: 16,
  },

  controlsRow: {
    flexDirection: "row",
    gap: 16,
  },
  controlsFontSizeText: {
    textAlign: "center",
    fontWeight: "bold",
    color: "rgb(255, 255, 255)",
    fontVariant: ["tabular-nums"],
  },
  button: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
