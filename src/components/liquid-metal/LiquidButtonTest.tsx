import React from "react";
import { StyleSheet, View } from "react-native";
import { ThemeView } from "../Theme";
import { ExpoLiquidMetalShader } from "./ExpoLiquidMetalShader";
import { LinearGradient } from "expo-linear-gradient";
import { BShader } from "../wabi-and-more/BShader";
import { METAL_PRESETS } from "@/lib/shaders/ColorsLiquidMetal";
import { PressableScale } from "pressto";
import { Image } from "expo-image";

const starts = [{ x: 0, y: 0 }];
const ends = [{ x: 0, y: 1 }];
const BUTTON_SIZE = 300;
const PADDING = 15;

export default function LiquidButtonTest() {
  //  | 'silver'
  // | 'gold'
  // | 'copper'
  // | 'roseGold'
  // | 'bronze'
  // | 'platinum'
  // | 'chrome'
  // | 'titanium'
  // | 'brass'
  // | 'custom';
  return (
    <ThemeView style={styles.container}>
      {/*<View style={{ backgroundColor: "#ffffff", opacity: 0.3, width: BUTTON_SIZE - PADDING, height: BUTTON_SIZE - PADDING, position: "absolute", top:} } }>*/}
      <PressableScale
        style={{
          borderRadius: BUTTON_SIZE / 2,
          shadowColor: "rgba(0,0,0,0.4)",
          shadowRadius: 15,
          shadowOpacity: 1,
          // shadowOffset: { width: BUTTON_SIZE + PADDING, height: BUTTON_SIZE + PADDING },
        }}
      >
        <Image
          style={{
            zIndex: 101,
            width: BUTTON_SIZE / 3,
            height: BUTTON_SIZE / 3,
            position: "absolute",
            top: BUTTON_SIZE / 2 - BUTTON_SIZE / 6,
            left: BUTTON_SIZE / 2 - BUTTON_SIZE / 6,
          }}
          source={require("../../../assets/images/triangle.png")}
          contentFit="contain"
        />
        <ExpoLiquidMetalShader
          iridescence={0.7}
          angle={60}
          repetition={3}
          shiftRed={0.2}
          shiftBlue={0.3}
          softness={0}
          speed={1}
          width={BUTTON_SIZE}
          height={BUTTON_SIZE}
          // Chrome dome: bright highlight + a DARK shadow gives the deep
          // reflection lobes (depth). The rim bevel keeps the edge bright, so
          // the darkness reads as structured reflection, not flat/striped.
          metal={"custom"}
          customHighlight={[1, 1, 1]}
          customShadow={[0.12, 0.13, 0.16]}
          rimLight={1}
          brightness={0.12}
          contour={0.2}
          // distortion={0.5}
          bubbleColor={[0, 0, 0]}
          bubbleOpacity={0.8}
          bubblePadding={14}
        />
      </PressableScale>
      {/*</View>*/}
    </ThemeView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    gap: 10,
  },
});
