/**
 * SkiaRingGlow
 *
 * A Skia-based glow effect component that renders a blurred rounded rectangle ring.
 * Unlike SkiaColorWheelBlurred (circular wedges), this component matches the shape
 * of rectangular cards with rounded corners.
 *
 * KEY FEATURES:
 * - Rounded rectangle ring shape (matches card border)
 * - Gaussian blur for glow effect
 * - Support for gradient or uniform solid colors
 * - Optional pulsating animation (opacity + scale)
 * - Animated rotation support
 *
 * USAGE:
 * ```tsx
 * <SkiaRingGlow
 *   width={300}
 *   height={200}
 *   colors={['#4285F4', '#EA4335', '#FBBC05', '#34A853']}
 *   borderRadius={20}
 *   strokeWidth={15}
 *   blurRadius={30}
 *   pulsate={true}
 * />
 * ```
 */

import {
  Blur,
  Canvas,
  Fill,
  Group,
  Paint,
  PathOp,
  Skia,
  SweepGradient,
  vec,
} from "@shopify/react-native-skia";
import React, { useEffect, useMemo } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

type SkiaRingGlowProps = {
  /** Total width of the glow area */
  width: number;
  /** Total height of the glow area */
  height: number;
  /** Array of colors for the gradient */
  colors: string[];
  /** Border radius for rounded corners */
  borderRadius: number;
  /** Width of the ring stroke */
  strokeWidth: number;
  /** Blur radius for the glow effect */
  blurRadius?: number;
  /** Base opacity of the glow (0-1) */
  opacity?: number;
  /** Animated rotation value (SharedValue) in degrees */
  rotation?: SharedValue<number>;
  /** Use uniform solid colors instead of smooth gradient */
  uniformColors?: boolean;
  /** Enable pulsating animation */
  pulsate?: boolean;
  /** Duration of one pulse cycle in ms */
  pulsateDuration?: number;
  /** Minimum opacity during pulse */
  pulsateMinOpacity?: number;
  /** Maximum opacity during pulse */
  pulsateMaxOpacity?: number;
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Creates color stops for uniform (non-gradient) colors.
 * Each color occupies an equal segment with hard transitions.
 */
function createUniformColorStops(colors: string[]) {
  const n = colors.length;
  const resultColors: string[] = [];
  const positions: number[] = [];

  colors.forEach((color, i) => {
    const start = i / n;
    const end = (i + 1) / n;
    resultColors.push(color, color);
    positions.push(start, end);
  });

  return { colors: resultColors, positions };
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * SkiaRingGlow
 *
 * Renders a blurred ring-shaped glow that matches the rounded rectangle
 * shape of a card border.
 */
export const SkiaRingGlow = ({
  width,
  height,
  colors,
  borderRadius,
  strokeWidth,
  blurRadius = 30,
  opacity = 0.8,
  rotation,
  uniformColors = false,
  pulsate = false,
  pulsateDuration = 2000,
  pulsateMinOpacity = 0.3,
  pulsateMaxOpacity = 1.0,
}: SkiaRingGlowProps) => {
  // Add padding to canvas to prevent blur clipping at edges
  const blurPadding = blurRadius * 2;
  const canvasWidth = width + blurPadding * 2;
  const canvasHeight = height + blurPadding * 2;
  const offsetX = blurPadding;
  const offsetY = blurPadding;

  const centerX = width / 2 + offsetX;
  const centerY = height / 2 + offsetY;
  const center = vec(centerX, centerY);

  // Pulsating animation values
  const pulseOpacity = useSharedValue(pulsateMaxOpacity);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (pulsate) {
      // Opacity animation
      pulseOpacity.value = withRepeat(
        withTiming(pulsateMinOpacity, {
          duration: pulsateDuration / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        -1, // infinite
        true // reverse (ping-pong)
      );

      // Scale animation (subtle: 1.0 → 1.05)
      pulseScale.value = withRepeat(
        withTiming(1.05, {
          duration: pulsateDuration / 2,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      );
    } else {
      // Reset to defaults when pulsate is disabled
      pulseOpacity.value = pulsateMaxOpacity;
      pulseScale.value = 1;
    }
  }, [pulsate, pulsateDuration, pulsateMinOpacity, pulsateMaxOpacity]);

  const pulseAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity * pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  // Create the ring clip path (outer - inner rounded rectangles)
  const clipPath = useMemo(() => {
    // Outer rounded rectangle (with offset for canvas padding)
    const outerPath = Skia.Path.Make();
    outerPath.addRRect(
      Skia.RRectXY(
        Skia.XYWHRect(offsetX, offsetY, width, height),
        borderRadius,
        borderRadius
      )
    );

    // Inner rounded rectangle (inset by strokeWidth)
    const innerPath = Skia.Path.Make();
    const innerRadius = Math.max(0, borderRadius - strokeWidth);
    innerPath.addRRect(
      Skia.RRectXY(
        Skia.XYWHRect(
          offsetX + strokeWidth,
          offsetY + strokeWidth,
          width - strokeWidth * 2,
          height - strokeWidth * 2
        ),
        innerRadius,
        innerRadius
      )
    );

    // Subtract inner from outer to create ring
    return Skia.Path.MakeFromOp(outerPath, innerPath, PathOp.Difference)!;
  }, [width, height, strokeWidth, borderRadius, offsetX, offsetY]);

  // Animated gradient rotation matrix
  const gradientMatrix = useDerivedValue(() => {
    const m = Skia.Matrix();
    if (rotation) {
      const angleRad = (rotation.value * Math.PI) / 180;
      m.translate(centerX, centerY);
      m.rotate(angleRad);
      m.translate(-centerX, -centerY);
    }
    return m;
  }, [rotation]);

  // Prepare colors and positions for gradient
  const gradientProps = useMemo(() => {
    if (uniformColors) {
      return createUniformColorStops(colors);
    }
    return { colors, positions: undefined };
  }, [colors, uniformColors]);

  // Create the blur paint for the layer
  const blurPaint = (
    <Paint>
      <Blur blur={blurRadius} />
    </Paint>
  );

  return (
    <Animated.View
      style={[
        {
          width: canvasWidth,
          height: canvasHeight,
          // Offset the view to center the glow effect
          marginLeft: -blurPadding,
          marginTop: -blurPadding,
        },
        pulseAnimatedStyle,
      ]}
    >
      <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
        {/* Apply blur to the ring */}
        <Group layer={blurPaint}>
          <Group clip={clipPath}>
            <Fill>
              <SweepGradient
                c={center}
                colors={gradientProps.colors}
                positions={gradientProps.positions}
                matrix={gradientMatrix}
              />
            </Fill>
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  );
};

export default SkiaRingGlow;
