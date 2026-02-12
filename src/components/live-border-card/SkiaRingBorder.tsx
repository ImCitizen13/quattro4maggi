/**
 * SkiaRingBorder
 *
 * A Skia-based animated ring/arc border component.
 * Creates a stroked path around the view with a gradient that can rotate/animate.
 *
 * KEY FEATURES:
 * - Stroked arc path (not filled segments)
 * - SweepGradient for smooth color transitions
 * - Rotation animation support for flowing colors
 * - Adapts to rectangular views with rounded corners
 *
 * USAGE:
 * ```tsx
 * <SkiaRingBorder
 *   width={300}
 *   height={200}
 *   colors={['#4285F4', '#EA4335', '#FBBC05', '#34A853']}
 *   strokeWidth={15}
 *   borderRadius={20}
 *   rotation={rotationValue}
 * />
 * ```
 */

import {
  Canvas,
  Fill,
  Group,
  PathOp,
  Skia,
  SweepGradient,
  vec,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

type SkiaRingBorderBaseProps = {
  /** Total width of the view */
  width: number;
  /** Total height of the view */
  height: number;
  /** Array of colors for the gradient */
  colors: string[];
  /** Stroke width of the ring/arc */
  strokeWidth: number;
  /** Border radius for rounded corners */
  borderRadius?: number;
  /** Background color inside the ring (optional) */
  backgroundColor?: string;
  /** Use uniform solid colors instead of smooth gradient */
  uniformColors?: boolean;
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

export type SkiaRingBorderProps = SkiaRingBorderBaseProps & {
  /** Rotation angle in degrees for animating the gradient */
  rotation?: number;
};

export type AnimatedSkiaRingBorderProps = SkiaRingBorderBaseProps & {
  /** Animated rotation value (SharedValue) in degrees */
  rotation: SharedValue<number>;
};

// ============================================================================
// DEFAULT COLORS
// ============================================================================

const DEFAULT_COLORS = [
  "#4285F4", // Blue
  "#EA4335", // Red
  "#FBBC05", // Yellow
  "#34A853", // Green
  "#4285F4", // Blue (repeat for seamless loop)
];

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * SkiaRingBorder
 *
 * Renders a stroked ring/arc border with animated gradient colors.
 * The ring is created by clipping (outer shape - inner shape) and applying
 * a SweepGradient that can rotate for animation.
 */
export const SkiaRingBorder = ({
  width,
  height,
  colors = DEFAULT_COLORS,
  strokeWidth,
  borderRadius = 0,
  rotation = 0,
  backgroundColor = "transparent",
  uniformColors = false,
}: SkiaRingBorderProps) => {
  const center = vec(width / 2, height / 2);

  // Create the ring clip path (outer - inner)
  const clipPath = useMemo(() => {
    // Outer rounded rectangle
    const outerPath = Skia.Path.Make();
    outerPath.addRRect(
      Skia.RRectXY(
        Skia.XYWHRect(0, 0, width, height),
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
          strokeWidth,
          strokeWidth,
          width - strokeWidth * 2,
          height - strokeWidth * 2
        ),
        innerRadius,
        innerRadius
      )
    );

    // Subtract inner from outer to create ring
    return Skia.Path.MakeFromOp(outerPath, innerPath, PathOp.Difference)!;
  }, [width, height, strokeWidth, borderRadius]);

  // Gradient rotation matrix
  const gradientMatrix = useMemo(() => {
    const m = Skia.Matrix();
    const angleRad = (rotation * Math.PI) / 180;
    m.translate(center.x, center.y);
    m.rotate(angleRad);
    m.translate(-center.x, -center.y);
    return m;
  }, [rotation, center.x, center.y]);

  // Prepare colors and positions for gradient
  const gradientProps = useMemo(() => {
    if (uniformColors) {
      return createUniformColorStops(colors);
    }
    return { colors, positions: undefined };
  }, [colors, uniformColors]);

  return (
    <View style={styles.container}>
      <Canvas style={{ width, height }}>
        <Group clip={clipPath}>
          {/* Background fill inside the ring */}
          {backgroundColor !== "transparent" && (
            <Fill color={backgroundColor} />
          )}
          {/* Ring with sweep gradient */}
          <Fill>
            <SweepGradient
              c={center}
              colors={gradientProps.colors}
              positions={gradientProps.positions}
              matrix={gradientMatrix}
            />
          </Fill>
        </Group>
      </Canvas>
    </View>
  );
};

// ============================================================================
// ANIMATED COMPONENT
// ============================================================================

/**
 * AnimatedSkiaRingBorder
 *
 * Same as SkiaRingBorder but accepts a SharedValue for rotation,
 * enabling smooth Reanimated-driven animations.
 */
export const AnimatedSkiaRingBorder = ({
  width,
  height,
  colors = DEFAULT_COLORS,
  strokeWidth,
  borderRadius = 0,
  rotation,
  backgroundColor = "transparent",
  uniformColors = false,
}: AnimatedSkiaRingBorderProps) => {
  const centerX = width / 2;
  const centerY = height / 2;
  const center = vec(centerX, centerY);

  // Create the ring clip path (outer - inner)
  const clipPath = useMemo(() => {
    const outerPath = Skia.Path.Make();
    outerPath.addRRect(
      Skia.RRectXY(
        Skia.XYWHRect(0, 0, width, height),
        borderRadius,
        borderRadius
      )
    );

    const innerPath = Skia.Path.Make();
    const innerRadius = Math.max(0, borderRadius - strokeWidth);
    innerPath.addRRect(
      Skia.RRectXY(
        Skia.XYWHRect(
          strokeWidth,
          strokeWidth,
          width - strokeWidth * 2,
          height - strokeWidth * 2
        ),
        innerRadius,
        innerRadius
      )
    );

    return Skia.Path.MakeFromOp(outerPath, innerPath, PathOp.Difference)!;
  }, [width, height, strokeWidth, borderRadius]);

  // Animated gradient rotation matrix using useDerivedValue
  const gradientMatrix = useDerivedValue(() => {
    const m = Skia.Matrix();
    const angleRad = (rotation.value * Math.PI) / 180;
    m.translate(centerX, centerY);
    m.rotate(angleRad);
    m.translate(-centerX, -centerY);
    return m;
  }, [rotation]);

  // Prepare colors and positions for gradient
  const gradientProps = useMemo(() => {
    if (uniformColors) {
      return createUniformColorStops(colors);
    }
    return { colors, positions: undefined };
  }, [colors, uniformColors]);

  return (
    <Canvas style={{ width, height }}>
      <Group clip={clipPath}>
        {backgroundColor !== "transparent" && (
          <Fill color={backgroundColor} />
        )}
        <Fill>
          <SweepGradient
            c={center}
            colors={gradientProps.colors}
            positions={gradientProps.positions}
            matrix={gradientMatrix}
          />
        </Fill>
      </Group>
    </Canvas>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});

export default SkiaRingBorder;
