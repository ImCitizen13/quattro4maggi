import React, { PropsWithChildren, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { AnimatedSkiaRingBorder } from "./SkiaRingBorder";
import { SkiaRingGlow } from "./SkiaRingGlow";

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
  /** Use uniform solid colors instead of smooth gradient */
  uniformColors?: boolean;
  /** Enable pulsating glow animation */
  pulsateGlow?: boolean;
  /** Duration of one pulse cycle in ms */
  pulsateDuration?: number;
  /** Minimum opacity during pulse */
  pulsateMinOpacity?: number;
  /** Maximum opacity during pulse */
  pulsateMaxOpacity?: number;
  borderRadius?: number;
};

export default function AdaptableSkiaLiveBorderCard({
  width,
  height,
  colors,
  duration = 2000,
  innerPaddingPercentage = 0.05,
  showGlow = true,
  glowIntensity = 1,
  glowSpread = 1.4,
  glowBlurRadius = 15,
  uniformColors = false,
  pulsateGlow = false,
  pulsateDuration = 2000,
  pulsateMinOpacity = 0.3,
  pulsateMaxOpacity = 1.0,
  borderRadius = 16,
  children,
}: PropsWithChildren<AdaptableSkiaLiveBorderCardProps>) {
  const innerBorderRadius = borderRadius;
  const innerPadding = Math.min(width, height) * innerPaddingPercentage;
  const outerBorderRadius = innerBorderRadius + innerPadding;

  // Animated rotation for both glow and ring border
  const rotation = useSharedValue(0);

  const startRotation = () => {
    rotation.value = withRepeat(
      withTiming(360, { duration: duration, easing: Easing.linear }),
      -1, // infinite
      false // no reverse
    );
  };

  useEffect(() => {
    startRotation();
  }, []);

  // Glow layer sizing - scales with glowSpread
  const glowWidth = width * glowSpread;
  const glowHeight = height * glowSpread;
  const glowStrokeWidth = innerPadding * glowSpread;
  const glowBorderRadius = outerBorderRadius * glowSpread;
  const glowOffsetX = (glowWidth - width) / 2;
  const glowOffsetY = (glowHeight - height) / 2;

  return (
    <View style={styles.wrapper}>
      {/* Glow layer - ring-shaped blur matching card border */}
      {showGlow && (
        <View
          style={[
            styles.glowLayer,
            {
              left: -glowOffsetX,
              top: -glowOffsetY,
            },
          ]}
        >
          <SkiaRingGlow
            width={glowWidth}
            height={glowHeight}
            colors={[...colors, colors[0]]}
            borderRadius={glowBorderRadius}
            strokeWidth={glowStrokeWidth}
            blurRadius={glowBlurRadius}
            opacity={glowIntensity}
            rotation={rotation}
            uniformColors={uniformColors}
            pulsate={pulsateGlow}
            pulsateDuration={pulsateDuration}
            pulsateMinOpacity={pulsateMinOpacity}
            pulsateMaxOpacity={pulsateMaxOpacity}
          />
        </View>
      )}

      {/* Main card with ring border */}
      <View
        style={[
          styles.outerContainer,
          { width, height, borderRadius: outerBorderRadius },
        ]}
      >
        <AnimatedSkiaRingBorder
          width={width}
          height={height}
          colors={[...colors, colors[0]]}
          strokeWidth={innerPadding}
          borderRadius={outerBorderRadius}
          rotation={rotation}
          uniformColors={uniformColors}
        />
        <View
          style={[
            styles.innerContent,
            {
              borderRadius: innerBorderRadius,
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
