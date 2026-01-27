import React, { PropsWithChildren, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SkiaColorWheelBlurred } from "./ColorWheels";
import { AnimatedSkiaRingBorder } from "./SkiaRingBorder";

const scaleFactor = 2;

type AdaptableSkiaLiveBorderCardProps = {
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

export default function AdaptableSkiaLiveBorderCard({
  width,
  height,
  colors,
  duration = 2000,
  innerPaddingPercentage = 0.05,
  showGlow = true,
  glowIntensity = 0.8,
  glowSpread = 0.7,
  glowBlurRadius = 30,
  children,
}: PropsWithChildren<AdaptableSkiaLiveBorderCardProps>) {
  const rotateX = useSharedValue(0);

  const innerBborderRadius = 16;
  const innerPadding = Math.min(width, height) * innerPaddingPercentage;
  const outerBorderRadius = innerBborderRadius + innerPadding;


  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotateX.value}deg` }],
    };
  });

  // Animated rotation for SkiaRingBorder
  const rotation = useSharedValue(0);

  const glowRotation = () => {
    // Continuous clockwise rotation
    rotateX.value = withRepeat(
      withTiming(360, { duration: duration, easing: Easing.linear }),
      -1, // infinite repeats
      false // no reverse - always clockwise
    );
  };

  const ringBorderRotation = () => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 2500, easing: Easing.linear }),
      -1, // infinite
      false // no reverse
    );
  };

  useEffect(() => {
    glowRotation();
    ringBorderRotation();
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
            // glowAnimatedStyle,
          ]}
        >
          <SkiaColorWheelBlurred
            width={glowWidth}
            height={glowHeight}
            colors={colors}
            blurRadius={glowBlurRadius}
            opacity={1}
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
        {/* SkiaRingBorder - uses same padding & radii as inner/outer card */}
        <AnimatedSkiaRingBorder
          width={width}
          height={height}
          colors={[...colors, colors[0]]}
          strokeWidth={innerPadding}
          borderRadius={outerBorderRadius}
          rotation={rotation}
        />
          <View
            style={[
              styles.innerContent,
              {
                borderRadius: innerBborderRadius,
                inset: innerPadding,
                backgroundColor: "yellow",
                overflow: "hidden",
              },
            ]}
          >
            {children}
          </View>
        
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  glowLayer: {
    position: "absolute",
  },
  outerContainer: {
    zIndex: 1,
    justifyContent: "center",
    alignItems: "center",

  },
  innerContent: {
    position: "absolute",
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
  },
});
