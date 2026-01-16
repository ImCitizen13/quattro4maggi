import { Canvas, Rect } from "@shopify/react-native-skia";
import { PressableScale } from "pressto";
import React from "react";
import { StyleSheet } from "react-native";

export default function SkiaMorphingButton() {
  return (
    <PressableScale
      onPress={() => {}}
      style={{ width: "auto", height: "auto" }}
    >
      <Canvas style={styles.canvas}>
        <Rect x={0} y={0} width={100} height={100} color="red" />
      </Canvas>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: 100,
    height: 100,
  },
});
