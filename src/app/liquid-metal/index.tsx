import { ExpoLiquidMetalShader } from "@/components/liquid-metal/ExpoLiquidMetalShader";
import { PerlinLiquidMetalShader } from "@/components/liquid-metal/PerlinLiquidMetalShader";
import { SvgLiquidMetalShader } from "@/components/liquid-metal/SvgLiquidMetalShader";
import { extractPathsFromSvg } from "@/components/liquid-metal/utils";

import { ThemeHeaderTitle, ThemeText, ThemeView } from "@/components/Theme";
import { MetalPresetName } from "@/lib/shaders/ColorsLiquidMetal";
import { MaterialCommunityIcons, SimpleLineIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { FlatList, StyleSheet, useColorScheme } from "react-native";
import { useAnimatedStyle } from "react-native-reanimated";
const LOGO_SVG_PATH =
  "M9.477 7.638c.164-.24.343-.27.488-.27.145 0 .387.03.551.27 2.13 2.901 6.55 10.56 6.959 10.976.605.618 1.436.233 1.918-.468.475-.69.607-1.174.607-1.69 0-.352-6.883-13.05-7.576-14.106-.667-1.017-.884-1.274-2.025-1.274h-.854c-1.138 0-1.302.257-1.969 1.274C6.883 3.406 0 16.104 0 16.456c0 .517.132 1 .607 1.69.482.7 1.313 1.086 1.918.468.41-.417 4.822-8.075 6.952-10.977z";
const X_LOGO_SVG_PATH = "M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z"
const APPLE_LOGO_SVG_PATH ="m13.0729 17.6825a3.61 3.61 0 0 0 -1.7248 3.0365 3.5132 3.5132 0 0 0 2.1379 3.2223 8.394 8.394 0 0 1 -1.0948 2.2618c-.6816.9812-1.3943 1.9623-2.4787 1.9623s-1.3633-.63-2.613-.63c-1.2187 0-1.6525.6507-2.644.6507s-1.6834-.9089-2.4787-2.0243a9.7842 9.7842 0 0 1 -1.6628-5.2776c0-3.0984 2.014-4.7405 3.9969-4.7405 1.0535 0 1.9314.6919 2.5924.6919.63 0 1.6112-.7333 2.8092-.7333a3.7579 3.7579 0 0 1 3.1604 1.5802zm-3.7284-2.8918a3.5615 3.5615 0 0 0 .8469-2.22 1.5353 1.5353 0 0 0 -.031-.32 3.5686 3.5686 0 0 0 -2.3445 1.2084 3.4629 3.4629 0 0 0 -.8779 2.1585 1.419 1.419 0 0 0 .031.2892 1.19 1.19 0 0 0 .2169.0207 3.0935 3.0935 0 0 0 2.1586-1.1368z"
//extractPathsFromSvg('<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" data-icon="icon-x" viewBox="0 0 24 24" width="1em" height="1em" display="flex" role="img" class="h-full w-full"><path d="M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z"></path></svg>')

/**
 * Liquid Metal Demo
 *
 * A shader-based demo showcasing a liquid metal effect using React Native Skia.
 * The effect creates a smooth, reflective metallic surface with animated flow.
 *
 * FLOW:
 * 1. Shader initializes with liquid metal parameters
 * 2. Animation continuously updates shader uniforms for flow effect
 * 3. User can interact to modify the liquid motion (optional)
 *
 * KEY FEATURES:
 *-GPU-accelerated shader rendering via Skia
 *-Smooth liquid metal animation
 *-Customizable metallic properties
 */
const BG_COLOR = "rgb(64 64 64)";
const CONTAINER_SIZE = 400;
const BUTTON_SIZE = 200;
const gradientColors = ["#2E2E2E", "#000000"];
export default function LiquidMetalDemo() {
  const [metal, setMetal] = useState<MetalPresetName>("bronze");

  return (
    <ThemeView style={styles.container}>
      {/*<ThemeView style={styles.shaderContainer}>*/}
      {/*<LinearGradient
        colors={["#2E2E2E", "#000000"]}
        style={[
          styles.buttonContainer,
          {
            width: CONTAINER_SIZE,
            height: CONTAINER_SIZE / 4,
            borderRadius: CONTAINER_SIZE,
          },
        ]}
      >
        <LinearGradient
          colors={["#2E2E2E", "#000000"]}
          style={[
            styles.buttonGradient,

            {
              position: "absolute",
              zIndex: 98,
              borderRadius: (CONTAINER_SIZE * 0.9) / 2,
              width: CONTAINER_SIZE * 0.92,
              height: (CONTAINER_SIZE / 4) * 0.92,
            },
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >*/}
      {/*Button*/}

      <SvgLiquidMetalShader
        svgPath={APPLE_LOGO_SVG_PATH}
        viewBoxWidth={20}
        viewBoxHeight={20}
        width={BUTTON_SIZE/3}
        height={BUTTON_SIZE/3}
        metal={metal as MetalPresetName}
        customHighlight={[0.9, 0.5, 0.8]}
        customShadow={[0.3, 0.1, 0.2]}
        iridescence={0.3}
        angle={30}
        contour={0.07}
        distortion={0.6}
        repetition={3}
      />


      <SvgLiquidMetalShader
        svgPath={X_LOGO_SVG_PATH}
        viewBoxWidth={30}
        viewBoxHeight={30}
        width={BUTTON_SIZE}
        height={BUTTON_SIZE}
        metal={metal as MetalPresetName}
        customHighlight={[0.9, 0.5, 0.8]}
        customShadow={[0.3, 0.1, 0.2]}
        iridescence={0.3}
        angle={30}
        contour={0.07}
        distortion={0.6}
        repetition={3}
      />


      <SvgLiquidMetalShader
        svgPath={LOGO_SVG_PATH}
        viewBoxWidth={20}
        viewBoxHeight={20}
        width={BUTTON_SIZE}
        height={BUTTON_SIZE}
        metal={metal as MetalPresetName}
        customHighlight={[0.9, 0.5, 0.8]}
        customShadow={[0.3, 0.1, 0.2]}
        iridescence={0.3}
        angle={30}
        contour={0.07}
        distortion={0.6}
        repetition={3}
      />
      {/*<LinearGradient
        colors={["#2E2E2E", "#000000"]}
        style={[
          styles.buttonContainer,
          {
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            borderRadius: BUTTON_SIZE / 2,
          },
        ]}
      >
        <PressableScale onPress={() => {}} style={styles.button}>
          <LinearGradient
            colors={["#2E2E2E", "#000000"]}
            style={[
              styles.buttonGradient,
              {
                borderRadius: (BUTTON_SIZE * 0.9) / 2,
                width: BUTTON_SIZE * 0.92,
                height: BUTTON_SIZE * 0.92,
              },
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <SimpleLineIcons
              name="ghost"
              size={BUTTON_SIZE / 3}
              color="white"
            />
          </LinearGradient>
        </PressableScale>
        <PerlinLiquidMetalShader
          width={BUTTON_SIZE}
          height={BUTTON_SIZE}
          metal={metal as MetalPresetName}
          customHighlight={[0.9, 0.5, 0.8]}
          customShadow={[0.3, 0.1, 0.2]}
        />
      </LinearGradient>*/}
      {/*</LinearGradient>
        <PerlinLiquidMetalShader
          width={CONTAINER_SIZE}
          height={CONTAINER_SIZE / 4}
          metal={metal as MetalPresetName}
          customHighlight={[0.9, 0.5, 0.8]}
          customShadow={[0.3, 0.1, 0.2]}
        />
      </LinearGradient>*/}
      {/*</ThemeView>*/}

      <FlatList
        style={{
          padding: 16,

          height: 100,
          flexGrow: 0,
        }}
        horizontal
        contentContainerStyle={{
          gap: 12,
          alignItems: "center",
        }}
        data={[
          "silver",
          "gold",
          "copper",
          "roseGold",
          "bronze",
          "platinum",
          "chrome",
          "titanium",
          "brass",
          "custom",
        ]}
        renderItem={({ item }) => (
          <PressableScale
            onPress={() => {
              setMetal(item as MetalPresetName);
            }}
            style={styles.buttonItem}
          >
            <ThemeText
              text={item.toLocaleUpperCase()}
              style={{ fontSize: 16, fontWeight: "bold", color: "white" }}
            />
          </PressableScale>
        )}
      />
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
  },
  shaderContainer: {
    flexDirection: "row",
    borderRadius: 999,
    gap: 16,
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "black",
  },
  buttonContainer: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    // backgroundColor: "red",
  },
  button: {
    position: "absolute",
    zIndex: 100,
    flexDirection: "row",
    gap: 16,
  },
  buttonGradient: {
    // padding: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2E2E2E",
  },
});
