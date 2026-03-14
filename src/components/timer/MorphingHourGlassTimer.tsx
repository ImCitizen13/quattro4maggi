import {
    Canvas,
    Fill,
    ImageShader,
    Shader,
    useImage,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
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
import { BShader } from "./BShader";

const CANVAS_HEIGHT = 500;
const BUBBLE_RADIUS = 200;
const BOTTOM_Y = CANVAS_HEIGHT;
const CENTER_Y = CANVAS_HEIGHT / 2;

export default function MorphingHourGlassTimer() {
  const { width } = useWindowDimensions();

  const bubbleYPos = useSharedValue(BOTTOM_Y);
  const startY = useSharedValue(BOTTOM_Y);

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

  // Shader uniforms — derived so they update on the UI thread
  const shaderUniforms = useDerivedValue(() => ({
    u_resolution: [width, CANVAS_HEIGHT],
    u_center: [width / 2, bubbleYPos.value],
    u_radius: bubbleRadius.value,
    u_refraction: 0.50, // 0 -> 1 
    u_edgeWidth: 0.15,
    u_dispersion: 0.06,
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
      <GestureDetector gesture={panGesture}>
        <Canvas style={styles.skiaCanvas}>
          <Fill>
            <Shader source={BShader} uniforms={shaderUniforms}>
              <ImageShader
                image={image}
                fit="cover"
                width={width}
                height={CANVAS_HEIGHT}
              />
            </Shader>
          </Fill>
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
  skiaCanvas: {
    position: "absolute",
    width: "100%",
    height: CANVAS_HEIGHT,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 255, 0.2)",
  },
});
