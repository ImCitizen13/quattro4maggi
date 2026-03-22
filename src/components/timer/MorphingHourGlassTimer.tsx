import {
  Canvas,
  Fill,
  Group,
  Paint,
  Paragraph,
  RuntimeShader,
  Shader,
  Skia,
  Text as SKText,
  TextAlign,
  TextDirection,
  useFont,
  useTypeface,
} from "@shopify/react-native-skia";
import { Stack } from "expo-router";
import React, { useMemo } from "react";
import {
  PixelRatio,
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
  cancelAnimation,
  clamp,
  interpolate,
  ReduceMotion,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BGSHADER } from "./BGTailwindShader";
import { BShader, DEFAULT_PRISM_COLORS } from "./BShader";
import BubbleGenerator from "./BubbleGenerator";

const BUBBLE_RADIUS = 200;
const FONT_SIZE = 32;
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
// const TEXT = "It's Me"; //Who likes to \n build UI";
// const TEXT_2 = "MEltohamy";
// const TEXT_3 = "I like to build UI";
const TEXT = "Hi There.";
const TEXT_2 = "I'm MelTohamy,";
const ARABIC_TEXT = "أنا م.التهامي";
const TEXT_3 = "I like to build stuff.";
const TEXT_GAP = 15; // vertical spacing between text lines
const MORPH_DELAY_MS = 3000; // pause before morphing to next text
const MORPH_DURATION_MS = 1500; // morph animation duration

export default function MorphingHourGlassTimer() {
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = useWindowDimensions();
  const isDark = useColorScheme() === "dark";
  const pd = PixelRatio.get();
  const BOTTOM_Y = CANVAS_HEIGHT;
  const CENTER_Y = CANVAS_HEIGHT * 0.4;
  const CENTER_TEXT_Y = CANVAS_HEIGHT * 0.55;
  const BOTTOM_TEXT_Y = CANVAS_HEIGHT;
  const bubbleYPos = useSharedValue(BOTTOM_Y);
  const bubbleXPos = useSharedValue(CANVAS_WIDTH / 2);
  const textMainYPos = useSharedValue(BOTTOM_Y);
  const startY = useSharedValue(BOTTOM_Y);

  // Bubble is in the center
  // const bubbleAtCenter = useDerivedValue(() => {
  //   return bubbleYPos.value === CENTER_Y;
  // });
  const bubbleAtCenter = useSharedValue(false);
  // Font utils
  const font = useFont(
    require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf"),
    FONT_SIZE
  );

  const englishTypeface = useTypeface(
    require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf")
  );
  const arabicTypeface = useTypeface(
    require("../../assets/fonts/ArefRuqaa-Regular.ttf")
  );

  // Build both name paragraphs: same width, centered, single line
  const nameParagraphs = useMemo(() => {
    const color = Skia.Color(isDark ? "#fff" : "#000");
    const fontProvider = Skia.TypefaceFontProvider.Make();
    let english = null;
    let arabic = null;

    if (englishTypeface) {
      fontProvider.registerFont(englishTypeface, "LexendDeca");
      const builder = Skia.ParagraphBuilder.Make(
        {
          textAlign: TextAlign.Center,
          maxLines: 1,
          textStyle: {
            color,
            fontSize: FONT_SIZE,
            fontFamilies: ["LexendDeca"],
          },
        },
        fontProvider
      );
      builder.addText(TEXT_2);
      english = builder.build();
      english.layout(CANVAS_WIDTH);
    }

    if (arabicTypeface) {
      fontProvider.registerFont(arabicTypeface, "ArefRuqaa");
      const builder = Skia.ParagraphBuilder.Make(
        {
          textDirection: TextDirection.RTL,
          textAlign: TextAlign.Center,
          maxLines: 1,
          textStyle: {
            color,
            fontSize: FONT_SIZE + 10,
            fontFamilies: ["ArefRuqaa"],
          },
        },
        fontProvider
      );
      builder.addText(ARABIC_TEXT);
      arabic = builder.build();
      arabic.layout(CANVAS_WIDTH);
    }

    return { english, arabic };
  }, [englishTypeface, arabicTypeface, isDark, CANVAS_WIDTH]);

  // Baseline offset for Paragraph (top-left) vs SKText (baseline) alignment
  const nameBaselineOffset = useMemo(() => {
    const p = nameParagraphs.english ?? nameParagraphs.arabic;
    if (!p) return FONT_SIZE;
    const lines = p.getLineMetrics();
    return lines.length > 0 ? lines[0].baseline : FONT_SIZE;
  }, [nameParagraphs]);

  const textX = useDerivedValue(() => {
    const w = font?.measureText(TEXT).width ?? 0;
    return CANVAS_WIDTH / 2 - w / 2;
  });

  // Text opacity: 0 at bottom, fully visible at 30% of bubble travel
  const textOpacity = useDerivedValue(() => {
    const thirtyPercent = BOTTOM_Y - 0.3 * (BOTTOM_Y - CENTER_Y);
    return interpolate(
      bubbleYPos.value,
      [BOTTOM_Y, thirtyPercent],
      [0, 1],
      "clamp"
    );
  });

  // Secondary text: centered X for TEXT_3
  const text3X = useDerivedValue(() => {
    const w = font?.measureText(TEXT_3).width ?? 0;
    return CANVAS_WIDTH / 2 - w / 2;
  });

  // Line 2 Y position (top-left for Paragraph — subtract baseline offset)
  const nameYPos = useDerivedValue(
    () => textMainYPos.value + FONT_SIZE + TEXT_GAP - nameBaselineOffset
  );

  const arabicNameYPos = useDerivedValue(
    () => textMainYPos.value + (FONT_SIZE - 20) + TEXT_GAP - nameBaselineOffset
  );

  // Line 3 Y position (baseline)
  const text3YPos = useDerivedValue(
    () => textMainYPos.value + (FONT_SIZE + TEXT_GAP) * 2
  );
  // Secondary text opacity: fades in when bubble is at center, out when it leaves
  const secondaryTextOpacity = useSharedValue(0);
  useAnimatedReaction(
    () => bubbleAtCenter.value,
    (atCenter) => {
      secondaryTextOpacity.value = withTiming(atCenter ? 1 : 0, {
        duration: 700,
      });
    }
  );

  // Crossfade: 0 = English visible, 1 = Arabic visible
  const morphProgress = useSharedValue(0);

  // Opacity for each name text
  const englishNameOpacity = useDerivedValue(() => 1 - morphProgress.value);
  const arabicNameOpacity = useDerivedValue(() => morphProgress.value);

  // Cycling counter — incremented to trigger next morph cycle
  const morphCycleCounter = useSharedValue(0);

  useAnimatedReaction(
    () => morphCycleCounter.value,
    (count, prev) => {
      if (count === prev || count === 0) return;
      // Wait, then morph to Arabic
      morphProgress.value = withDelay(
        MORPH_DELAY_MS,
        withTiming(1, { duration: MORPH_DURATION_MS }, (finished) => {
          if (!finished) return;
          // Wait, then morph back to English
          morphProgress.value = withDelay(
            MORPH_DELAY_MS,
            withTiming(0, { duration: MORPH_DURATION_MS }, (finished2) => {
              if (finished2) morphCycleCounter.value += 1;
            })
          );
        })
      );
    }
  );

  // Start/stop morph cycling based on bubble position
  useAnimatedReaction(
    () => bubbleAtCenter.value,
    (atCenter, prev) => {
      if (atCenter === prev) return;
      if (atCenter) {
        morphProgress.value = 0;
        morphCycleCounter.value = 1;
      } else {
        cancelAnimation(morphProgress);
        morphProgress.value = 0;
        morphCycleCounter.value = 0;
      }
    }
  );

  // Scale radius from 1.0 (at bottom) to 0.75 (at center)
  const bubbleRadius = useDerivedValue(() =>
    interpolate(
      bubbleYPos.value,
      [CENTER_Y, BOTTOM_Y],
      [BUBBLE_RADIUS * 0.25, BUBBLE_RADIUS]
    )
  );

  // Shader uniforms — derived so they update on the UI thread
  // Scaled by pd because the shader Group has transform={[{scale: pd}]}
  // which makes the saveLayer buffer DPR-sized for sharp rendering.
  const shaderUniforms = useDerivedValue(() => ({
    u_resolution: [CANVAS_WIDTH * pd, CANVAS_HEIGHT * pd],
    u_center: [bubbleXPos.value * pd, bubbleYPos.value * pd],
    u_radius: bubbleRadius.value * pd,
    u_refraction: 0.5,
    u_edgeWidth: 0.1,
    u_dispersion: 0.9,
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
    uSpacing: 3,
    uRadius: 0.05,
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
    const targetY = clamp(startY.value + e.translationY, 0, BOTTOM_Y);
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
    bubbleAtCenter.value = snapTo === CENTER_Y;
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
      <Stack.Screen options={{ headerShown: false }} />
      {/* //////////////////////////////////////////////////////////////// */}
      <GestureDetector gesture={panGesture}>
        <Canvas style={styles.skiaCanvas}>
          {/*Main Bubble group */}
          {/* Outer 1/pd scale counteracts the DPR² magnification */}
          <Group transform={[{ scale: 1 / pd }]}>
            {/* Inner pd scale forces saveLayer to allocate a device-resolution buffer */}
            <Group
              transform={[{ scale: pd }]}
              layer={
                // Outer Bubble
                <Paint>
                  <RuntimeShader source={BShader} uniforms={shaderUniforms} />
                </Paint>
              }
            >
              <BubbleGenerator
                lowerBounds={CENTER_Y + 10}
                width={CANVAS_WIDTH}
                startAnimation={bubbleAtCenter}
              />
              {/* Main Text Group */}
              <Group opacity={textOpacity}>
                {/* First line */}
                <SKText
                  antiAlias={true}
                  text={TEXT}
                  font={font}
                  color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                  x={textX}
                  y={textMainYPos}
                />
              </Group>
              {/* Secondary Text Group — fades in when bubble reaches center */}
              <Group opacity={secondaryTextOpacity}>
                {/* Name crossfade: English ↔ Arabic */}
               
                <Group
                  layer={
                    <Paint opacity={englishNameOpacity} />
                  }
                >
                  <Paragraph
                    paragraph={nameParagraphs.english}
                    x={0}
                    y={nameYPos}
                    width={CANVAS_WIDTH}
                  />
                </Group>

                <Group
                  layer={
                    <Paint opacity={arabicNameOpacity} />
                  }
                >
                  <Paragraph
                    paragraph={nameParagraphs.arabic}
                    x={0.5}
                    y={arabicNameYPos}
                    width={CANVAS_WIDTH}
                  />
                </Group>
                

                {/* Third Line */}
                <SKText
                  antiAlias={true}
                  text={TEXT_3}
                  font={font}
                  color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                  x={text3X}
                  y={text3YPos}
                />
              </Group>
            </Group>
          </Group>
          {/* Background dots — on top of the magnifier shader */}
          <Fill>
            <Shader source={BGSHADER} uniforms={dotUniforms} />
          </Fill>
        </Canvas>
      </GestureDetector>
      {/* <View style={styles.socialButtonsContainer}>
        <PressableScale
          style={[styles.socialButtons, { backgroundColor: "black" }]}
        >
          <Image
            source={require("../../../assets/icons/x_icon.png")}
            style={{ width: 16, height: 16 }}
            contentFit="cover"
          />
          <Text style={{ color: "white", textAlign: "center" }}>
            Me on X @m090009
          </Text>
        </PressableScale>

        <PressableScale style={styles.socialButtons}>
          <Image source={require("../../../assets/icons/x_icon.png")} />
          <Text style={{ color: isDark ? "white" : "black" }}>
            Me on X @m090009
          </Text>
        </PressableScale>
      </View> */}
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
  socialButtonsContainer: {
    gap: 10,
    flexDirection: "column",
    width: "100%",
    position: "absolute",
    bottom: "1%",
    height: 150,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  socialButtons: {
    height: 55,
    flexDirection: "row",
    width: "90%",
    borderRadius: 50,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: "7%",
  },
});
