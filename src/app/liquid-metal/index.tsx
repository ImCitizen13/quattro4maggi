import { PerlinLiquidMetalShader } from "@/components/liquid-metal/PerlinLiquidMetalShader";
import { ThemeHeaderTitle, ThemeText, ThemeView } from "@/components/Theme";
import { MetalPresetName } from "@/lib/shaders/ColorsLiquidMetal";
import { SimpleLineIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { FlatList, StyleSheet } from "react-native";
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
const size = 150;
const gradientColors = ["#2E2E2E", "#000000"];
export default function LiquidMetalDemo() {
  const gradientContainerAnimatedStyle = useAnimatedStyle(() => {
    return {
      width: size,
      height: size,
      padding: 10,
      borderRadius: size / 2,
    };
  });
  const [metal, setMetal] = useState<MetalPresetName>("bronze");

  return (
    <ThemeView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: () => <ThemeHeaderTitle text="Liquid Metal" />,
        }}
      />
      <ThemeView style={styles.shaderContainer}>
        <LinearGradient colors={["#2E2E2E", "#000000"]} style={[styles.buttonContainer,
        { width: size, height: size, borderRadius: size / 2 }]}>
          <PressableScale onPress={() => { }} style={styles.button}>
            <LinearGradient colors={["#2E2E2E", "#000000"]} style={[styles.buttonGradient, {
              borderRadius: (size * .9) / 2,
              width: size * .92,
              height: size * .92,
            }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>

              
              <SimpleLineIcons name="ghost" size={size / 3} color="white" />
            </LinearGradient>
          </PressableScale>
          <PerlinLiquidMetalShader width={size} height={size} metal={metal as MetalPresetName} customHighlight={[0.9, 0.5, 0.8]} customShadow={[0.3, 0.1, 0.2]} />
        </LinearGradient>

      </ThemeView>

      <FlatList
        style={{ padding: 16 }}
        numColumns={3}
        columnWrapperStyle={{ width: "100%", gap: 5, paddingVertical: 16, justifyContent: "space-around" }}
        // contentContainerStyle={{ gap: 16 }}
        data={["silver", "gold", "copper", "roseGold", "bronze", "platinum", "chrome", "titanium", "brass", "custom"]}
        renderItem={({ item }) => (
          <PressableScale onPress={() => { setMetal(item as MetalPresetName) }} style={styles.buttonItem}>
            <PerlinLiquidMetalShader width={size / 2} height={size / 2} metal={item as MetalPresetName} customHighlight={[0.9, 0.5, 0.8]} customShadow={[0.3, 0.1, 0.2]} />
            <ThemeText text={item.toLocaleUpperCase()} style={{ fontSize: 16, fontWeight: "bold", color: "white" }} />
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
    width: "30%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    gap: 10,
    borderRadius: 10,
    // backgroundColor: "black",
    borderWidth: 1,
    borderColor: "#2E2E2E",
  },
});
