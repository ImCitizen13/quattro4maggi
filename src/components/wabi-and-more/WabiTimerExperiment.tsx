import {
  BackdropBlur,
  BlurMask,
  Canvas,
  Fill,
  Group,
  Paint,
  RuntimeShader,
  Shader,
  Text as SKText,
  useFont,
  useSVG,
  useTypeface,
} from "@shopify/react-native-skia";
import { Stack } from "expo-router";
import React from "react";
import {
  PixelRatio,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import StarsShader from "../common/StarsShader";
import { BGSHADER } from "./BGTailwindShader";
import { BShader, DEFAULT_PRISM_COLORS } from "./BShader";
import BubbleGenerator from "./BubbleGenerator";
import {
  BUBBLE_RADIUS,
  FLIP_WORDS,
  FONT_SIZE,
  INITIAL_TEXT,
  TEXT,
  TEXT_GAP,
} from "./constants";
import { useBubbleGesture } from "./hooks/useBubbleGesture";
import { useParagraphBuilder } from "./hooks/useParagraphBuilder";
import NameCrossfade from "./NameCrossfade";
import { SocialFooter } from "./SocialFooter";
import SplitFlapWord from "./SplitFlapWord";
import { SwipeIndicator } from "./SwipeIndicator";

// ============================================================================
// MAIN COMPONENT
// Fullscreen interactive experience with draggable prism bubble and text reveals
// ============================================================================

export default function WabiTimerExperiment() {
  // Screen dimensions and theme
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } = useWindowDimensions();
  const isDark = useColorScheme() === "dark";
  const pd = PixelRatio.get(); // Device pixel ratio for sharp shader rendering

  // ──────────────────────────────────────────────────────────────────────────
  // POSITION CONSTANTS
  // Define key Y positions for bubble snap points and text placement
  // ──────────────────────────────────────────────────────────────────────────
  const BOTTOM_Y = CANVAS_HEIGHT; // Bubble's initial/rest position
  const CENTER_Y = CANVAS_HEIGHT * 0.4; // Bubble's "revealed" position (40% from top)
  const CENTER_TEXT_Y = CANVAS_HEIGHT * 0.55; // Main text Y when revealed
  const BOTTOM_TEXT_Y = CANVAS_HEIGHT; // Main text Y when hidden (off-screen)
  const INDICATOR_Y = BOTTOM_Y - BUBBLE_RADIUS / 2.75; // Swipe indicator position
  const SOCIAL_Y = CANVAS_HEIGHT * 0.9; // Social footer position
  const SOCIAL_FADE_START = SOCIAL_Y - CANVAS_HEIGHT * 0.15; // Where footer starts fading

  // ──────────────────────────────────────────────────────────────────────────
  // SHARED VALUES (animated state)
  // These drive all animations and are updated by gestures
  // ──────────────────────────────────────────────────────────────────────────
  const bubbleYPos = useSharedValue(BOTTOM_Y); // Current bubble Y position
  const bubbleXPos = useSharedValue(CANVAS_WIDTH / 2); // Current bubble X position
  const textMainYPos = useSharedValue(BOTTOM_Y); // Main text Y position
  const startY = useSharedValue(BOTTOM_Y); // Gesture start reference
  const bubbleAtCenter = useSharedValue(false); // True when bubble is snapped to center
  const secondaryTextOpacity = useSharedValue(0); // Opacity for name/split-flap text

  // ──────────────────────────────────────────────────────────────────────────
  // FONTS & ASSETS
  // Load fonts for text rendering and SVG for swipe indicator
  // ──────────────────────────────────────────────────────────────────────────
  const font = useFont(
    require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf"),
    FONT_SIZE
  );
  const initialFont = useFont(
    require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf"),
    FONT_SIZE
  );
  const englishTypeface = useTypeface(
    require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf")
  );
  const arabicTypeface = useTypeface(
    require("../../assets/fonts/ArefRuqaa-Regular.ttf")
  );
  const svgImage = useSVG(
    require("../../../assets/icons/drag-04-stroke-rounded.svg")
  );

  // ──────────────────────────────────────────────────────────────────────────
  // CUSTOM HOOKS
  // Encapsulated logic for paragraph building and gesture handling
  // ──────────────────────────────────────────────────────────────────────────

  // Builds Skia paragraphs for English and Arabic text with proper alignment
  const { paragraphs: nameParagraphs, baselineOffset: nameBaselineOffset } =
    useParagraphBuilder(englishTypeface, arabicTypeface, isDark, CANVAS_WIDTH);

  // Pan gesture with spring physics — snaps bubble to center or bottom
  const panGesture = useBubbleGesture({
    bubbleYPos,
    bubbleXPos,
    textMainYPos,
    startY,
    bubbleAtCenter,
    canvasWidth: CANVAS_WIDTH,
    centerY: CENTER_Y,
    bottomY: BOTTOM_Y,
    centerTextY: CENTER_TEXT_Y,
    bottomTextY: BOTTOM_TEXT_Y,
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DERIVED VALUES
  // Computed from shared values, update automatically when dependencies change
  // ──────────────────────────────────────────────────────────────────────────

  // Center the main greeting text horizontally
  const textX = useDerivedValue(() => {
    const w = font?.measureText(TEXT).width ?? 0;
    return CANVAS_WIDTH / 2 - w / 2;
  });

  // Main text fades in as bubble moves up (0 at bottom, 1 at 30% of travel)
  const textOpacity = useDerivedValue(() => {
    const thirtyPercent = BOTTOM_Y - 0.3 * (BOTTOM_Y - CENTER_Y);
    return interpolate(
      bubbleYPos.value,
      [BOTTOM_Y, thirtyPercent],
      [0, 1],
      "clamp"
    );
  });

  // Initial "Swipe Up" text — inverse of main text opacity
  const initialTextOpacity = useDerivedValue(() => 1 - textOpacity.value);

  // Blur increases as initial text fades out
  const initialTextBlur = useDerivedValue(() =>
    interpolate(textOpacity.value, [0, 1], [0, 10], "clamp")
  );

  // Backdrop blur behind initial text
  const initialBackdropBlur = useDerivedValue(
    () => initialTextOpacity.value * 4
  );

  // Center the initial "Swipe Up" text horizontally
  const initailTextX = useDerivedValue(() => {
    const w = initialFont?.measureText(INITIAL_TEXT).width ?? 0;
    return CANVAS_WIDTH / 2 - w / 2;
  });

  // Y positions for name text (adjusted for baseline alignment)
  const nameYPos = useDerivedValue(
    () => textMainYPos.value + FONT_SIZE + TEXT_GAP - nameBaselineOffset
  );

  const arabicNameYPos = useDerivedValue(
    () => textMainYPos.value + (FONT_SIZE - 20) + TEXT_GAP - nameBaselineOffset
  );

  // Y position for the third line (split-flap word)
  const text3YPos = useDerivedValue(
    () => textMainYPos.value + (FONT_SIZE + TEXT_GAP) * 2
  );

  // Bubble shrinks as it moves up (full size at bottom, 25% at center)
  const bubbleRadius = useDerivedValue(() =>
    interpolate(
      bubbleYPos.value,
      [CENTER_Y, BOTTOM_Y],
      [BUBBLE_RADIUS * 0.25, BUBBLE_RADIUS],
      "clamp"
    )
  );

  // Swipe indicator fades out as bubble passes over it
  const indicatorOpacity = useDerivedValue(() => {
    const bubbleBottom = bubbleYPos.value + bubbleRadius.value;
    return interpolate(
      bubbleBottom,
      [INDICATOR_Y - 30, INDICATOR_Y],
      [0, 1],
      "clamp"
    );
  });

  // ──────────────────────────────────────────────────────────────────────────
  // REACTIONS
  // Side effects triggered by shared value changes
  // ──────────────────────────────────────────────────────────────────────────

  // Fade in secondary text (name + split-flap) when bubble reaches center
  useAnimatedReaction(
    () => bubbleAtCenter.value,
    (atCenter) => {
      secondaryTextOpacity.value = withTiming(atCenter ? 1 : 0, {
        duration: 700,
      });
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SHADER UNIFORMS
  // Parameters passed to Skia shaders for rendering effects
  // ──────────────────────────────────────────────────────────────────────────

  // Prism bubble shader uniforms — controls refraction, glow, and colors
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

  // Dot grid background shader uniforms (light mode only)
  const dotUniforms = {
    uResolution: [CANVAS_WIDTH, CANVAS_HEIGHT],
    uSpacing: 3,
    uRadius: 0.05,
    uColor: isDark ? [1, 1, 1, 0.5] : [0, 0, 0, 0.5],
  };

  // ──────────────────────────────────────────────────────────────────────────
  // ANIMATED STYLES
  // React Native animated styles for non-Skia elements
  // ──────────────────────────────────────────────────────────────────────────

  // Social footer fades in when revealed, fades out when bubble returns down
  const socialAnimatedStyle = useAnimatedStyle(() => {
    const fadeIn = secondaryTextOpacity.value;
    const fadeOut =
      bubbleYPos.value < SOCIAL_FADE_START
        ? 1
        : interpolate(
            bubbleYPos.value,
            [SOCIAL_FADE_START, SOCIAL_Y],
            [1, 0],
            "clamp"
          );
    return { opacity: fadeIn * fadeOut };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Gesture wrapper — detects pan gestures on the canvas */}
      <GestureDetector gesture={panGesture}>
        <Canvas style={styles.skiaCanvas}>
          {/* DPR scaling trick: outer 1/pd cancels inner pd for sharp rendering */}
          <Group transform={[{ scale: 1 / pd }]}>
            {/* Inner group with prism shader applied as a layer effect */}
            <Group
              transform={[{ scale: pd }]}
              layer={
                <Paint>
                  <RuntimeShader source={BShader} uniforms={shaderUniforms} />
                </Paint>
              }
            >
              {/* Stars background (dark mode only) */}
              {isDark && (
                <StarsShader width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
              )}

              {/* Rising bubble particles — triggered when bubble is at center */}
              <BubbleGenerator
                lowerBounds={CENTER_Y + 10}
                width={CANVAS_WIDTH}
                startAnimation={bubbleAtCenter}
                bubbleRadius={bubbleRadius}
              />

              {/* Swipe up indicator — fades when bubble passes over it */}
              <SwipeIndicator
                svg={svgImage}
                x={CANVAS_WIDTH / 2}
                y={INDICATOR_Y}
                opacity={indicatorOpacity}
                isDark={isDark}
              />

              {/* Initial "Swipe Up To Start" text — fades and blurs out */}
              <Group opacity={initialTextOpacity}>
                <BackdropBlur
                  blur={initialBackdropBlur}
                  clip={{
                    x: initailTextX.value - 16,
                    y: CANVAS_HEIGHT / 2 - FONT_SIZE - 8,
                    width:
                      (initialFont?.measureText(INITIAL_TEXT).width ?? 0) + 32,
                    height: FONT_SIZE + 24,
                  }}
                  opacity={initialTextOpacity}
                />
                <SKText
                  text={INITIAL_TEXT}
                  font={initialFont}
                  x={initailTextX}
                  y={CANVAS_HEIGHT / 2}
                  color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                >
                  <BlurMask blur={initialTextBlur} style="normal" />
                </SKText>
              </Group>

              {/* Main greeting text — fades in as bubble moves up */}
              <Group opacity={textOpacity}>
                <SKText
                  antiAlias={true}
                  text={TEXT}
                  font={font}
                  color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                  x={textX}
                  y={textMainYPos}
                />
              </Group>

              {/* Secondary text group — appears when bubble reaches center */}
              <Group layer={<Paint opacity={secondaryTextOpacity} />}>
                {/* Name crossfade — alternates between English and Arabic */}
                <NameCrossfade
                  englishParagraph={nameParagraphs.english}
                  arabicParagraph={nameParagraphs.arabic}
                  englishY={nameYPos}
                  arabicY={arabicNameYPos}
                  width={CANVAS_WIDTH}
                  bubbleAtCenter={bubbleAtCenter}
                />

                {/* Split-flap word animation — cycles through FLIP_WORDS */}
                {font && (
                  <SplitFlapWord
                    words={FLIP_WORDS}
                    prefix="I like to  "
                    suffix="stuff."
                    font={font}
                    fontSize={FONT_SIZE}
                    baselineY={text3YPos}
                    canvasWidth={CANVAS_WIDTH}
                    color={isDark ? "rgba(255,255,255,1)" : "rgb(0, 0, 0)"}
                    run={bubbleAtCenter}
                  />
                )}
              </Group>
            </Group>
          </Group>

          {/* Dot grid background overlay (light mode only) */}
          {!isDark && (
            <Fill>
              <Shader source={BGSHADER} uniforms={dotUniforms} />
            </Fill>
          )}
        </Canvas>
      </GestureDetector>

      {/* Social media footer — animated opacity based on reveal state */}
      <SocialFooter animatedStyle={socialAnimatedStyle} handle="@m090009" />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    alignItems: "center",
  },
  skiaCanvas: {
    position: "absolute",
    width: "100%",
    height: "100%",
    bottom: 0,
    left: 0,
  },
});
