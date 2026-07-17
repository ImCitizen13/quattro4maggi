import { SdfLiquidMetalShader } from "@/components/liquid-metal/SdfLiquidMetalShader";
import { extractPathsFromSvg } from "@/components/liquid-metal/utils";

import {  ThemeText, ThemeView } from "@/components/Theme";
import { MetalPresetName } from "@/lib/shaders/ColorsLiquidMetal";
import { SimpleLineIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { FlatList, StyleSheet, useColorScheme } from "react-native";
import { useAnimatedStyle } from "react-native-reanimated";
const EXPO_LOGO_SVG_PATH =
  "M9.477 7.638c.164-.24.343-.27.488-.27.145 0 .387.03.551.27 2.13 2.901 6.55 10.56 6.959 10.976.605.618 1.436.233 1.918-.468.475-.69.607-1.174.607-1.69 0-.352-6.883-13.05-7.576-14.106-.667-1.017-.884-1.274-2.025-1.274h-.854c-1.138 0-1.302.257-1.969 1.274C6.883 3.406 0 16.104 0 16.456c0 .517.132 1 .607 1.69.482.7 1.313 1.086 1.918.468.41-.417 4.822-8.075 6.952-10.977z";
const X_LOGO_SVG_PATH = extractPathsFromSvg('<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.746 9.75L5.9645 4.1605L9.4925 0H8.2645L5.419 3.357L3.149 0H0.0545L3.6995 5.388L0 9.75H1.228L4.2455 6.191L6.6545 9.75H9.75H9.746ZM2.7445 0.784L8.28 8.966H7.0565L1.52 0.784H2.7435H2.7445Z" fill="black"/></svg>')
const APPLE_LOGO_SVG_PATH = extractPathsFromSvg('<svg width="13" height="16" viewBox="0 0 13 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.5589 5.4318C12.038 5.75071 11.6066 6.19655 11.3049 6.72761C11.0032 7.25867 10.8413 7.85759 10.8341 8.4683C10.8362 9.15565 11.0398 9.8273 11.4198 10.4001C11.7998 10.9728 12.3395 11.4215 12.972 11.6906C12.7226 12.4952 12.3536 13.2577 11.8772 13.9524C11.1956 14.9336 10.4829 15.9147 9.3985 15.9147C8.3141 15.9147 8.0352 15.2847 6.7855 15.2847C5.5668 15.2847 5.133 15.9354 4.1415 15.9354C3.15 15.9354 2.4581 15.0265 1.6628 13.9111C0.612269 12.3485 0.0349098 10.516 0 8.6335C0 5.5351 2.014 3.893 3.9969 3.893C5.0504 3.893 5.9283 4.5849 6.5893 4.5849C7.2193 4.5849 8.2005 3.8516 9.3985 3.8516C10.0145 3.83571 10.6249 3.97152 11.176 4.24708C11.7271 4.52264 12.202 4.92949 12.5589 5.4318ZM8.8305 2.54C9.3586 1.91876 9.65755 1.13513 9.6774 0.32C9.67829 0.212542 9.6679 0.105288 9.6464 0C8.73926 0.0886136 7.9004 0.520975 7.3019 1.2084C6.76871 1.80488 6.4585 2.56759 6.424 3.3669C6.4244 3.46411 6.43479 3.56102 6.455 3.6561C6.52651 3.66962 6.59912 3.67655 6.6719 3.6768C7.08997 3.64353 7.49692 3.5256 7.868 3.33018C8.23908 3.13475 8.56655 2.86591 8.8305 2.54Z" fill="black"/></svg>')

const LOGOS = [EXPO_LOGO_SVG_PATH, ,APPLE_LOGO_SVG_PATH, X_LOGO_SVG_PATH]

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
  const [metal, setMetal] = useState<MetalPresetName>("platinum");
const [isLight, setLight] = useState(false)
const [logoIndex, setLogoIndex] = useState<number>(0)
const [debugSdf, setDebugSdf] = useState(false)
  return (
    <ThemeView style={styles.container}>
      {/*<ThemeView style={styles.shaderContainer}>*/}

      {/*Button*/}

      <PressableScale
        style={{marginBottom: 20}}
        onPress={() => {
        setLight((prev) => (!prev))
      }}
        onLongPress={() => {
          setDebugSdf((prev) => !prev)
        }} >
        <SimpleLineIcons
          name="ghost"
          size={BUTTON_SIZE / 4}
          color="white"
        />
      </PressableScale>
      <LinearGradient
        colors={isLight ? ["#BEBEBE", "#ffffff"] : ["#2E2E2E", "#000000"]}
        style={[
          styles.buttonContainer,
          {
            width: BUTTON_SIZE*1.5,
            height: BUTTON_SIZE*1.5,
            borderRadius: BUTTON_SIZE / 2,
          },
        ]}
      >
        <PressableScale onPress={() => {
          setLogoIndex((prev) => (prev + 1) % LOGOS.length)
}} >
      <SdfLiquidMetalShader
          svgPath={LOGOS[logoIndex] || EXPO_LOGO_SVG_PATH}
        width={BUTTON_SIZE}
        height={BUTTON_SIZE}
        debug={debugSdf}
        metal={metal as MetalPresetName}
        customHighlight={[0.9, 0.5, 0.8]}
        customShadow={[0.3, 0.1, 0.2]}
        iridescence={0.3}
        contour={0.00}
        distortion={0.6}
        repetition={1}
        />
</PressableScale>

      </LinearGradient>



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
    gap: 10
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
