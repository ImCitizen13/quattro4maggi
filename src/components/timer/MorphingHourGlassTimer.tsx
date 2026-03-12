import { AntDesign } from "@expo/vector-icons";
import { Canvas } from "@shopify/react-native-skia";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function MorphingHourGlassTimer() {
  return (
    <View style={styles.container}>
      <View
        style={{ flexDirection: "column", justifyContent: "center", gap: 12 }}
      >
        <Text style={styles.timeText}>Drag from the bottom to view timer</Text>
        <AntDesign
          style={{ textAlign: "center" }}
          name="hourglass"
          size={18}
          color="#ffffff"
        />
      </View>
      <Canvas style={styles.skiaCanvas}>
        {/* <Rect x={0} y={0} height={10} width={10}/> */}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
  },
  timeText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "rgb(255, 255, 255)",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  skiaCanvas: {
    position: "absolute",
    width: "100%",
    height: 300,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 255, 0.2)",
    // borderTopRightRadius: 200,
    // borderTopLeftRadius: 200,
  },
});
