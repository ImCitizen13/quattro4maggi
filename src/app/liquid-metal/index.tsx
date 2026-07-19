import { ParticlePathAssembly } from "@/components/liquid-metal/ParticlePathAssembly";
import { SdfLiquidMetalShader } from "@/components/liquid-metal/SdfLiquidMetalShader";
import { extractPathsFromSvg } from "@/components/liquid-metal/utils";

import {  ThemeText, ThemeView } from "@/components/Theme";
import { MetalPresetName } from "@/lib/shaders/ColorsLiquidMetal";
import { SimpleLineIcons } from "@expo/vector-icons";
import { Skia, useFont } from "@shopify/react-native-skia";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "pressto";
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { EXPO_LOGO_SVG_PATH, LOGOS } from "../../../svgs/svgs";


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
const BUTTON_SIZE = 250;
const gradientColors = ["#2E2E2E", "#000000"];

// Morph pill: collapsed round button ↔ expanded text input
const PILL_HEIGHT = 56;
const PILL_EXPANDED_WIDTH = BUTTON_SIZE * 1.5;
const MORPH_SPRING = {
  stiffness: 900,
        damping: 90,
        mass: 4,
        overshootClamping: undefined,
        energyThreshold: 6e-9,
        velocity: 0,
        reduceMotion: ReduceMotion.System,
};
export default function LiquidMetalDemo() {
  const [metal, setMetal] = useState<MetalPresetName>("platinum");
const [isLight, setLight] = useState(false)
const [logoIndex, setLogoIndex] = useState<number>(0)
const [debugSdf, setDebugSdf] = useState(false)
const [text, setText] = useState("")
const [showParticles, setShowParticles] = useState(false)

  // Glyph outlines of the typed text as one SkPath — this is what the SDF
  // bake consumes, exactly like an SVG logo path
  const font = useFont(
    require("../../assets/fonts/LobsterTwo-Regular.ttf"),
    128
  );
  const textPath = useMemo(() => {
    if (!font || !text.trim()) return undefined;
    const p = Skia.Path.MakeFromText(text.trim(), 0, 128, font);
    if (!p) return undefined;
    const b = p.getBounds();
    return b.width > 0 && b.height > 0 ? p : undefined;
  }, [font, text]);

  // Keyboard-driven lift: height goes 0 → -keyboardHeight as it shows, and
  // the native controller animates it frame-locked with the keyboard — the
  // content rises just enough (60%) to keep the input clear of the keyboard
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const keyboardLift = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value * 0.6 }],
  }));

  // ============================================================================
  // MODE SWITCH — round button morphs into the text input
  // ============================================================================

  const [mode, setMode] = useState<"icon" | "text">("icon");
  const inputRef = useRef<TextInput>(null);
  const morph = useSharedValue(0); // 0 = round button, 1 = input pill

  const openInput = () => {
    setMode("text");
    morph.value = withSpring(1, MORPH_SPRING);
    inputRef.current?.focus();
  };

  const closeInput = () => {
    setMode("icon");
    inputRef.current?.blur();
    morph.value = withSpring(0, MORPH_SPRING);
  };

  const pillStyle = useAnimatedStyle(() => ({
    width: interpolate(morph.value, [0, 1], [PILL_HEIGHT, PILL_EXPANDED_WIDTH]),
    borderRadius: interpolate(morph.value, [0, 1], [PILL_HEIGHT / 2, 12]),
  }));
  // Icon fades out in the first half of the morph, input fades in second half
  const iconFaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0, 0.5], [1, 0], "clamp"),
  }));
  const inputFaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(morph.value, [0.5, 1], [0, 1], "clamp"),
  }));
  return (
    <ThemeView style={styles.container}>
      <Pressable
        style={styles.dismissArea}
        onPress={Keyboard.dismiss}
        accessible={false}
      >
      <Animated.View style={[styles.dismissArea, keyboardLift]}>


      {/*<ThemeView style={styles.shaderContainer}>*/}

      {/*Button*/}

      {/*<PressableScale
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
      >*/}

        {showParticles ? (
          <ParticlePathAssembly
            svgPath={LOGOS[logoIndex] || EXPO_LOGO_SVG_PATH}
            path={mode === "text" ? textPath : undefined}
            width={mode === "text" && textPath ? BUTTON_SIZE * 1.4 : BUTTON_SIZE}
            height={BUTTON_SIZE}
            onPress={
              mode === "icon"
                ? () => setLogoIndex((prev) => (prev + 1) % LOGOS.length)
                : undefined
            }
          />
        ) : (
        <PressableScale onPress={() => {
          setLogoIndex((prev) => (prev + 1) % LOGOS.length)
}} >
      <SdfLiquidMetalShader
          svgPath={LOGOS[logoIndex] || EXPO_LOGO_SVG_PATH}
        path={mode === "text" ? textPath : undefined}
        width={mode === "text" && textPath ? BUTTON_SIZE * 1.4 : BUTTON_SIZE}
        height={BUTTON_SIZE}
        debug={debugSdf}
        metal={metal as MetalPresetName}
        customHighlight={[0.9, 0.5, 0.8]}
        customShadow={[0.3, 0.1, 0.2]}
        iridescence={0.05}
        contour={0.1}
        distortion={0.0}
            repetition={1}
            speed={1}
        />
</PressableScale>
        )}

        {/* Metal ↔ particles view toggle */}
        <PressableScale
          style={styles.particleToggle}
          onPress={() => setShowParticles((prev) => !prev)}
        >
          <SimpleLineIcons
            name={showParticles ? "drop" : "grid"}
            size={18}
            color="#fff"
          />
        </PressableScale>
{/* Round button ↔ text input morph */}
<Animated.View style={[styles.morphPill, pillStyle]}>
  <Animated.View
    style={[StyleSheet.absoluteFill, styles.pillIconFace, iconFaceStyle]}
    pointerEvents={mode === "icon" ? "auto" : "none"}
  >
    <Pressable style={styles.pillIconFace} onPress={openInput} hitSlop={8}>
      <SimpleLineIcons name="pencil" size={20} color="#fff" />
    </Pressable>
  </Animated.View>

  <Animated.View
    style={[styles.pillInputFace, inputFaceStyle]}
    pointerEvents={mode === "text" ? "auto" : "none"}
  >
    <TextInput
      ref={inputRef}
      style={styles.textInput}
      value={text}
      onChangeText={setText}
      placeholder="Type to liquify…"
      placeholderTextColor="#666"
      autoCapitalize="characters"
      autoCorrect={false}
      maxLength={12}
      returnKeyType="done"
    />
    <Pressable onPress={closeInput} hitSlop={8}>
      <SimpleLineIcons name="close" size={18} color="#666" />
    </Pressable>
  </Animated.View>
</Animated.View>

      {/*</LinearGradient>



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
            />*/}
          {/*</PressableScale>
        )}
      />*/}
      </Animated.View>
      </Pressable>
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
  dismissArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
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
  particleToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2E2E2E",
    justifyContent: "center",
    alignItems: "center",
  },
  morphPill: {
    height: PILL_HEIGHT,
    borderWidth: 1,
    borderColor: "#2E2E2E",
    overflow: "hidden",
    justifyContent: "center",
  },
  pillIconFace: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pillInputFace: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  textInput: {
    flex: 1,
    color: "#fff",
    fontSize: 18,
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
