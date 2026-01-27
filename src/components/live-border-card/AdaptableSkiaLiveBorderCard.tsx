import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { PressableScale } from "pressto";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import { SkiaColorWheelBlurred } from "./ColorWheels";
import { AnimatedSkiaRingBorder } from "./SkiaRingBorder";

const scaleFactor = 2;

type GlowingBorderCardProps = {
  width: number;
  height: number;
  colors: string[];
  duration?: number;
  /** Whether to show the glow effect */
  showGlow?: boolean;
  /** Intensity of the glow (0-1), controls opacity */
  glowIntensity?: number;
  /** How much the glow extends beyond the card (1 = same size, 1.5 = 50% larger) */
  glowSpread?: number;
  /** Blur radius for the glow effect */
  glowBlurRadius?: number;
  innerPaddingPercentage?: number;
};

export default function GlowingBorderCard({
  width,
  height,
  colors,
  duration = 2000,
  innerPaddingPercentage = 0.05,
  showGlow = true,
  glowIntensity = 0.8,
  glowSpread = 0.7,
  glowBlurRadius = 30,
}: GlowingBorderCardProps) {
  const rotateX = useSharedValue(0);
  const startAnimation = useSharedValue(false);

  const innerBborderRadius = 16;
  const innerPadding = Math.min(width, height) * innerPaddingPercentage;
  const outerBorderRadius = innerBborderRadius + innerPadding;
  const [playIcon, setPlayIcon] = useState("play-arrow");

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotateX.value}deg` }],
    };
  });

  // Animated rotation for SkiaRingBorder
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 2500, easing: Easing.linear }),
      -1, // infinite
      false // no reverse
    );
  }, []);

  // Glow layer sizing - elliptical to match card proportions
  const glowWidth = width * scaleFactor * glowSpread;
  const glowHeight = height * scaleFactor * glowSpread;
  const glowOffsetX = (glowWidth - width) / 2;
  const glowOffsetY = (glowHeight - height) / 2;

  return (
    <View style={styles.wrapper}>
      {/* Glow layer - blurred elliptical color wheel behind the card */}
      {showGlow && (
        <Animated.View
          style={[
            styles.glowLayer,
            {
              width: glowWidth,
              height: glowHeight,
              left: -glowOffsetX,
              top: -glowOffsetY,
            },
            animatedStyle,
          ]}
        >
          <SkiaColorWheelBlurred
            width={glowWidth}
            height={glowHeight}
            colors={colors}
            blurRadius={glowBlurRadius}
            opacity={glowIntensity}
          />
        </Animated.View>
      )}

      {/* Main card with clipped elliptical color wheel */}
      <View
        style={[
          styles.outerContainer,
          { width, height, borderRadius: outerBorderRadius },
        ]}
      >
        {/* SkiaRingBorder Demo - Animated Ring Border */}
        <View style={{ position: "relative", width: width, height: height }}>
          <AnimatedSkiaRingBorder
            width={width}
            height={height}
            colors={[...colors, colors[0]]}
            strokeWidth={12}
            borderRadius={20}
            rotation={rotation}
          />
          {/* <View
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            bottom: 12,
            backgroundColor: "#2a2a2a",
            borderRadius: 8,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 14 }}>Ring Border</Text>
        </View> */}
        </View>
        <PressableScale
          onPress={() => (startAnimation.value = !startAnimation.value)}
          style={[
            styles.innerContent,
            { borderRadius: innerBborderRadius, inset: innerPadding },
          ]}
        >
          <Animated.View entering={FadeIn} exiting={FadeOut}>
            {playIcon === "play-arrow" ? (
              <MaterialIcons
                name="play-arrow"
                size={width * 0.3}
                color="white"
              />
            ) : (
              <MaterialIcons name="pause" size={width * 0.3} color="white" />
            )}
          </Animated.View>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  glowLayer: {
    position: "absolute",
  },
  outerContainer: {
    position: "relative",
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
    zIndex: 1,
  },
  innerContent: {
    position: "absolute",
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
  },
});
