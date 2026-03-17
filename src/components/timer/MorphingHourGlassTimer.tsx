import { AntDesign } from "@expo/vector-icons";
import {
  Canvas,
  Fill,
  Group,
  Paint,
  RuntimeShader,
  Shader,
  Skia,
  Text as SKText,
  useFont,
} from "@shopify/react-native-skia";
import { PressableScale } from "pressto";
import React, { useMemo } from "react";
import {
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureUpdateEvent,
  PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import {
  clamp,
  interpolate,
  ReduceMotion,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { hexToRgb } from "../../../shaders/ShadersUtils";
import { BGSHADER } from "./BGTailwindShader";
import { BShader, DEFAULT_PRISM_COLORS } from "./BShader";

const BG_COLOR = "#FFFFFF";
// Background color (RGB 0-1) — change this to control the bubble/canvas bg
const SHADER_BG_COLOR = hexToRgb(BG_COLOR); //[0.1, 0.1, 0.1] as const; // dark gray (#1a1a1a)
const TEXT = "Bubble";
export default function MorphingHourGlassTimer() {
  const { width, height } = useWindowDimensions();
  const isDark = useColorScheme() === "dark";
  const CANVAS_HEIGHT = height;
  const BUBBLE_RADIUS = 200;
  const BOTTOM_Y = CANVAS_HEIGHT;
  const CENTER_Y = CANVAS_HEIGHT / 4;
  const CENTER_TEXT_Y = CANVAS_HEIGHT * 0.5;
  const BOTTOM_TEXT_Y = CANVAS_HEIGHT ;
  const bubbleYPos = useSharedValue(BOTTOM_Y);
  const textMainYPos = useSharedValue(BOTTOM_Y);
  const startY = useSharedValue(BOTTOM_Y);
  // Font utils
  const font = useFont(require("../../assets/fonts/BebasNeue-Regular.ttf"), 64);

  const fontWidth = useDerivedValue(() => {
    return font?.measureText(TEXT).width ?? 0;
  });

  // Scale radius from 1.0 (at bottom) to 0.75 (at center)
  const bubbleRadius = useDerivedValue(() =>
    interpolate(
      bubbleYPos.value,
      [CENTER_Y, BOTTOM_Y],
      [BUBBLE_RADIUS * 0.25, BUBBLE_RADIUS]
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
    u_refraction: 0.5,
    u_edgeWidth: 0.1,
    u_dispersion: 0.6,
    u_bgColor: isDark ? [0, 0, 0] : [1, 1, 1],
    u_specular: 1,
    u_shadowColor: isDark ? [1, 1, 1] : [0, 0, 0],
    u_shadowOpacity: isDark ? 0.15 : 0.25,
    u_shadowSpread: 0.2,
    ...DEFAULT_PRISM_COLORS,
  }));

  // Inner bubble uniforms — 80% radius, same center
  const innerShaderUniforms = useDerivedValue(() => ({
    u_resolution: [width, CANVAS_HEIGHT],
    u_center: [width / 2, bubbleYPos.value],
    u_radius: bubbleRadius.value * 0.8,
    u_refraction: 0.5,
    u_edgeWidth: 0.1,
    u_dispersion: 0.6,
    u_bgColor: isDark ? [0, 0, 0] : [1, 1, 1],
    u_specular: 1,
    u_shadowColor: isDark ? [1, 1, 1] : [1, 1, 1],
    u_shadowOpacity: isDark ? 0.05 : 0.1,
    u_shadowSpread: 1,
    ...DEFAULT_PRISM_COLORS,
  }));

  // Dot grid uniforms
  const dotUniforms = {
    uResolution: [width, height],
    uSpacing: 20,
    uRadius: 1.0,
    uColor: isDark ? [1, 1, 1, 0.5] : [0, 0, 0, 0.5],
  };

  const onBeginYPostions = () => {
    "worklet";
    startY.value = bubbleYPos.value;
  };

  const onUpdateYPostions = (
    e: GestureUpdateEvent<PanGestureHandlerEventPayload>
  ) => {
    "worklet";
    bubbleYPos.value = clamp(startY.value + e.translationY, CENTER_Y, BOTTOM_Y);
    textMainYPos.value = clamp(
      startY.value + e.translationY,
      CENTER_TEXT_Y,
      BOTTOM_TEXT_Y
    );
  };

  const onEndYPostions = () => {
    "worklet";
    const halfway = (CENTER_Y + BOTTOM_Y) / 2;
    const snapTo = bubbleYPos.value < halfway ? CENTER_Y : BOTTOM_Y;
    const snapTextTo = textMainYPos.value < halfway ? CENTER_TEXT_Y : BOTTOM_TEXT_Y;
    bubbleYPos.value = withSpring(snapTo, {
      stiffness: 900,
      damping: 120,
      mass: 4,
      overshootClamping: false,
      energyThreshold: 6e-9,
      velocity: 0,
      reduceMotion: ReduceMotion.System,
    });

    textMainYPos.value = withSpring(snapTextTo , {
      stiffness: 900,
      damping: 120,
      mass: 4,
      overshootClamping: false,
      energyThreshold: 6e-9,
      velocity: 0,
      reduceMotion: ReduceMotion.System,
    });
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          onBeginYPostions();
        })
        .onUpdate((e) => {
          onUpdateYPostions(e);
        })
        .onEnd(() => {
          onEndYPostions();
        }),
    [bubbleYPos, startY]
  );

  // ... inside your component
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  return (
    <View style={styles.container}>
      <View style={{ zIndex: 10, paddingTop: 60, alignItems: "center" }}>
        <PressableScale onPress={() => {}}>
          <AntDesign
            name={isDark ? "moon" : "sun"}
            size={24}
            color={isDark ? "white" : "black"}
          />
        </PressableScale>
      </View>
      <GestureDetector gesture={panGesture}>
        <Canvas style={styles.skiaCanvas}>
          {/*Main Bubble group */}
          <Group
            layer={
              // Outer Bubble
              <Paint>
                <RuntimeShader source={BShader} uniforms={shaderUniforms} />
              </Paint>
            }
          >
            {/* Background fill INSIDE Group so the layer covers full canvas (needed for shadow) */}
            <Fill color={isDark ? "#1a1a1a" : "#ffffff"} />
            {/* Background dots */}
            <Fill>
              <Shader source={BGSHADER} uniforms={dotUniforms} />
            </Fill>
            <Group
              // layer={
              //   // Inner Bubble
              //   <Paint>
              //     <RuntimeShader
              //       source={BInnerShader}
              //       uniforms={innerShaderUniforms}
              //     />
              //   </Paint>
              // }
            >
              <SKText
                text={TEXT}
                font={font}
                color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                x={width / 2 - fontWidth.value / 2}
                y={textMainYPos}
              />
            </Group>
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
  },
  timeText: {
    fontSize: 18,
    fontWeight: "bold",
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
    fontSize: 14,
    fontWeight: "600" as const,
  },
  skiaCanvas: {
    position: "absolute",
    width: "100%",
    height: "100%",
    bottom: 0,
    left: 0,
  },
});
