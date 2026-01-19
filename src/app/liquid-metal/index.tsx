import { LiquidMetalShader } from "@/components/liquid-metal/LiquidMetalShader";
import { ThemeHeaderTitle, ThemeView } from "@/components/Theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack } from "expo-router";
import { PressableScale } from "pressto";
import React from "react";
import { StyleSheet } from "react-native";
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
const size = 200;
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
        { width: size, height: size, padding: 10, borderRadius: size / 2 }]}>
          <PressableScale onPress={() => { }} style={styles.button}>
            <LinearGradient colors={["#2E2E2E", "#000000"]} style={[styles.buttonGradient, {
              borderRadius: (size * .9) / 2,
              width: size * .92,
              height: size * .92,
            }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>

              <Ionicons name="chatbubbles-outline" size={size / 3} color="rgb(193, 184, 182)" />
            </LinearGradient>
          </PressableScale>
          <LiquidMetalShader width={size} height={size} />
        </LinearGradient>

      </ThemeView>
    </ThemeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  shaderContainer: {
    flexDirection: "row",
    borderRadius: 999,
    gap: 16,
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
  },
  buttonContainer: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "red",
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
});
