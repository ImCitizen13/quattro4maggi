import { PerlinLiquidMetalShader } from "@/components/liquid-metal/PerlinLiquidMetalShader";
import { ThemeHeaderTitle, ThemeText, ThemeView } from "@/components/Theme";
import { MetalPresetName } from "@/lib/shaders/ColorsLiquidMetal";
import { MaterialCommunityIcons, SimpleLineIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack } from "expo-router";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { FlatList, StyleSheet, useColorScheme } from "react-native";
import { useAnimatedStyle } from "react-native-reanimated";

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
 * - GPU-accelerated shader rendering via Skia
 * - Smooth liquid metal animation
 * - Customizable metallic properties
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
      <LinearGradient
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
      </LinearGradient>
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
    backgroundColor: "black",
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
