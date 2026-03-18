import { AntDesign } from "@expo/vector-icons";
import {
  Canvas,
  Group,
  Paint,
  RuntimeShader,
  Text as SKText,
  useFont,
} from "@shopify/react-native-skia";
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
import { BShader, DEFAULT_PRISM_COLORS } from "./BShader";
import BubbleGenerator from "./BubbleGenerator";

const BUBBLE_RADIUS = 200;
const SPRING_SNAP_PROPS = {
  stiffness: 550,
  damping: 140,
  mass: 9,
  overshootClamping: undefined,
  energyThreshold: 6e-9,
  velocity: -300,
  reduceMotion: ReduceMotion.System,
};

// Smooth follow spring — high stiffness + damping for responsive but not jerky tracking
const SPRING_FOLLOW_PROPS = {
  stiffness: 300,
  damping: 30,
  mass: 1,
  reduceMotion: ReduceMotion.System,
};
// Background color (RGB 0-1) — change this to control the bubble/canvas bg
const TEXT = "Bubble";
export default function MorphingHourGlassTimer() {
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = useWindowDimensions();
  const isDark = useColorScheme() === "dark";

  const BOTTOM_Y = CANVAS_HEIGHT;
  const CENTER_Y = CANVAS_HEIGHT / 4;
  const CENTER_TEXT_Y = CANVAS_HEIGHT * 0.5;
  const BOTTOM_TEXT_Y = CANVAS_HEIGHT;
  const bubbleYPos = useSharedValue(BOTTOM_Y);
  const bubbleXPos = useSharedValue(CANVAS_WIDTH / 2);
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

  // Shader uniforms — derived so they update on the UI thread
  const shaderUniforms = useDerivedValue(() => ({
    u_resolution: [CANVAS_WIDTH, CANVAS_HEIGHT],
    u_center: [bubbleXPos.value, bubbleYPos.value],
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

  // Dot grid uniforms
  const dotUniforms = {
    uResolution: [CANVAS_WIDTH, CANVAS_HEIGHT],
    uSpacing: 5,
    uRadius: 0.1,
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
    const targetY = clamp(startY.value + e.translationY, CENTER_Y, BOTTOM_Y);
    const targetX = CANVAS_WIDTH / 2 + e.translationX;
    bubbleYPos.value = withSpring(targetY, SPRING_FOLLOW_PROPS);
    bubbleXPos.value = withSpring(targetX, SPRING_FOLLOW_PROPS);
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
    const snapTextTo =
      textMainYPos.value < halfway ? CENTER_TEXT_Y : BOTTOM_TEXT_Y;
    bubbleYPos.value = withSpring(snapTo, SPRING_SNAP_PROPS);
    bubbleXPos.value = withSpring(CANVAS_WIDTH / 2, SPRING_SNAP_PROPS);

    textMainYPos.value = withSpring(snapTextTo, {
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

  return (
    <View style={styles.container}>
      {/* Theme indicator Icon */}
      <View style={{ zIndex: 10, paddingTop: 60, alignItems: "center" }}>
        <AntDesign
          name={isDark ? "moon" : "sun"}
          size={24}
          color={isDark ? "white" : "black"}
        />
      </View>
      {/* //////////////////////////////////////////////////////////////// */}
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
            <BubbleGenerator lowerBounds={CANVAS_HEIGHT * .35} width={CANVAS_WIDTH}  />
            {/* Background fill INSIDE Group so the layer covers full canvas (needed for shadow) */}
            {/* <Fill color={isDark ? "rgb(253, 6, 6)" : "#ffffff"} /> */}
            {/* Background dots */}
            {/* <Fill>
              <Shader source={BGSHADER} uniforms={dotUniforms} />
            </Fill> */}
            <SKText
              antiAlias={true}
              text={TEXT}
              font={font}
              color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
              x={CANVAS_WIDTH / 2 - fontWidth.value / 2}
              y={textMainYPos}
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
