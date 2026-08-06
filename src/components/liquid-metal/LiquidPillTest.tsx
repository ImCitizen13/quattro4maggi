import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { ThemeView } from "../Theme";
import { ExpoLiquidMetalShader } from "./ExpoLiquidMetalShader";
import { PressableScale } from "pressto";
import { Image } from "expo-image";


const PILL_WIDTH = 300;
const BORDER_RADIUS = 40;

export default function LiquidPillTest() {
  return (
    <ThemeView style={styles.container}>
      <PressableScale
        style={{
          borderRadius: BORDER_RADIUS,
          shadowColor: "rgba(0,0,0,0.2)",
          shadowOffset: { width: 260, height: 260 },
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            position: "absolute",
            zIndex: 101,
            flexDirection: "row",
            justifyContent: "flex-start",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Image
            style={{
              width: PILL_WIDTH / 6,
              height: PILL_WIDTH / 6,
            }}
            source={require("../../../assets/images/triangle.png")}
            contentFit="contain"
          />
          <Text
            style={{
              color: "white",
              fontSize: PILL_WIDTH / 8,
              textShadowColor: "rgba(0,0,0,0.5)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
              fontWeight: "bold"
            }}
          >
            Featured
          </Text>
        </View>

        <ExpoLiquidMetalShader
          shape={0}
          iridescence={0.7}
          angle={60}
          repetition={3}
          shiftRed={0.2}
          shiftBlue={0.3}
          softness={0}
          speed={1}
          width={PILL_WIDTH}
          height={PILL_WIDTH / 4}
          borderRadius={BORDER_RADIUS}
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
          // bubble={false}
          // Omit bubbleRadius so the bubble corner matches the pill: it defaults
          // to borderRadius - bubblePadding, keeping the curves concentric.
          bubble={false}
          bubbleColor={[0, 0, 0]}
          bubbleOpacity={0.1}
        />
      </PressableScale>
    </ThemeView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: "#BCC5C8",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    width: "100%",
    gap: 10,
  },
});
