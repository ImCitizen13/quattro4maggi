import MaterialIcons from "@expo/vector-icons/build/MaterialIcons";
import { PressableScale } from "pressto";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { SkiaColorWheel, SkiaColorWheelBlurred } from "./ColorWheels";

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

  useAnimatedReaction(
    () => startAnimation.value,
    (value) => {
      if (value) {
        // Continuous clockwise rotation
        rotateX.value = withRepeat(
          withTiming(360, { duration: duration, easing: Easing.linear }),
          -1, // infinite repeats
          false // no reverse - always clockwise
        );
        scheduleOnRN(setPlayIcon, "pause");
      } else {
        rotateX.value = withTiming(0, { duration: duration / 2 });
        scheduleOnRN(setPlayIcon, "play-arrow");
      }
    }
  );

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
        <Animated.View
          style={[
            {
              position: "absolute",
              width: width * scaleFactor,
              height: height * scaleFactor,
              left: -width / scaleFactor,
              top: -height / scaleFactor,
            },
            animatedStyle,
          ]}
        >
          <SkiaColorWheel
            width={width * scaleFactor}
            height={height * scaleFactor}
            colors={colors}
          />
        </Animated.View>
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
