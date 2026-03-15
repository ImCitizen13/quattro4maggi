import { Host, Slider } from "@expo/ui/swift-ui";
import { tint } from "@expo/ui/swift-ui/modifiers";
import {
  Canvas,
  Fill,
  Group,
  Paint,
  RuntimeShader,
  Text as SKText,
  useFont,
  useImage
} from "@shopify/react-native-skia";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  clamp,
  interpolate,
  ReduceMotion,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { imageArray } from "../../../assets/SkiaImageShaders/images.generated";
import { hexToRgb } from "../../../shaders/ShadersUtils";
import { BShader } from "./BShader";


const BG_COLOR = "#FFFFFF" 
  // Background color (RGB 0-1) — change this to control the bubble/canvas bg
  const SHADER_BG_COLOR = hexToRgb(BG_COLOR)//[0.1, 0.1, 0.1] as const; // dark gray (#1a1a1a)

export default function MorphingHourGlassTimer() {
  const { width, height } = useWindowDimensions();
  const CANVAS_HEIGHT = height;
  const BUBBLE_RADIUS = 200;
  const BOTTOM_Y = CANVAS_HEIGHT;
  const CENTER_Y = CANVAS_HEIGHT / 2;
  const bubbleYPos = useSharedValue(BOTTOM_Y);
  const startY = useSharedValue(BOTTOM_Y);
  // Font utils
  const font = useFont(require("../../assets/fonts/BebasNeue-Regular.ttf"), 48);
  const fontWidth = useDerivedValue(() => {
    return font?.measureText("Hello Skia").width ?? 0;
  });
  const [specularUI, setSpecularUI] = useState(0.5);
  const specular = useSharedValue(0.5);
  // Load a background image to show through the bubble
  const image = useImage(imageArray[16]);

  // Scale radius from 1.0 (at bottom) to 0.75 (at center)
  const bubbleRadius = useDerivedValue(() =>
    interpolate(
      bubbleYPos.value,
      [CENTER_Y, BOTTOM_Y],
      [BUBBLE_RADIUS * 0.75, BUBBLE_RADIUS]
    )
  );

  // Derived position to keep image centered
  const imageX = useDerivedValue(() => width / 2 - 100 / 2);
  const imageY = useDerivedValue(() => height / 2 - 100 / 2);
  

  // Shader uniforms — derived so they update on the UI thread
  const shaderUniforms = useDerivedValue(() => ({
    u_resolution: [width, CANVAS_HEIGHT],
    u_center: [width / 2, bubbleYPos.value],
    u_radius: bubbleRadius.value,
    u_refraction: 0.5, // 0 -> 1
    u_edgeWidth: 0.15,
    u_dispersion: 0.06,
    u_bgColor: SHADER_BG_COLOR,
    u_specular: 1,
  }));

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          "worklet";
          startY.value = bubbleYPos.value;
        })
        .onUpdate((e) => {
          "worklet";
          bubbleYPos.value = clamp(
            startY.value + e.translationY,
            CENTER_Y,
            BOTTOM_Y
          );
        })
        .onEnd(() => {
          "worklet";
          const halfway = (CENTER_Y + BOTTOM_Y) / 2;
          const snapTo = bubbleYPos.value < halfway ? CENTER_Y : BOTTOM_Y;
          bubbleYPos.value = withSpring(snapTo, {
            stiffness: 900,
            damping: 120,
            mass: 4,
            overshootClamping: false,
            energyThreshold: 6e-9,
            velocity: 0,
            reduceMotion: ReduceMotion.System,
          });
        }),
    [bubbleYPos, startY]
  );

  if (!image) return null;

  return (
    <View style={styles.container}>
      {/* <View
        style={{ flexDirection: "column", justifyContent: "center", gap: 12 }}
      >
        <Text style={styles.timeText}>Swipe up to check the timer</Text>
        <AntDesign
          style={{ textAlign: "center" }}
          name="hourglass"
          size={18}
          color="#ffffff"
        />
      </View> */}
      <View style={styles.sliderRow}>
        <Text style={styles.sliderLabel}>Specular</Text>
        <Host style={{ flex: 1 }} matchContents>
          <Slider
            step={0.1}
            min={0}
            max={1}
            value={specularUI}
            onValueChange={(v: number) => {
              console.log("Slider Value:", v)
              setSpecularUI(v);
              specular.value = v;
            }}
            modifiers={[tint("#ffffff")]}
          />
        </Host>
      </View>
      <GestureDetector gesture={panGesture}>
        <Canvas style={styles.skiaCanvas}>
          <Group
            layer={
              <Paint >
                <RuntimeShader source={BShader} uniforms={shaderUniforms} />
              </Paint>
            }
          >
            <Fill color={"rgb(198, 196, 196)"} />
            <SKText
              text="Hello Skia"
              font={font}
              color={"black"}
              x={width / 2 - fontWidth.value / 2}
              y={imageY.value + 100 / 2}
            />
          </Group>
        </Canvas>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    // justifyContent: "center",
  },
  timeText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "rgb(255, 255, 255)",
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  sliderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 60,
    zIndex: 10,
  },
  sliderLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  skiaCanvas: {
    position: "absolute",
    width: "100%",
    height: "100%",
    // height: CANVAS_HEIGHT,
    bottom: 0,
    left: 0,
    backgroundColor: "#1a1a1a",
  },
});
