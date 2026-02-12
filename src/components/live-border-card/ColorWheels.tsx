/**
 * ColorWheels
 *
 * Two implementations of a customizable color wheel with pie/wedge segments:
 * 1. SVGColorWheel - Uses react-native-svg (lightweight, good for static/simple interactions)
 * 2. SkiaColorWheel - Uses react-native-skia (better for animations and complex effects)
 *
 * KEY FEATURES:
 * - Customizable number of segments via colors array
 * - Adjustable size, rotation, stroke
 * - Optional donut hole (innerRadius)
 * - Pressable segments with onSegmentPress callback
 *
 * USAGE:
 * ```tsx
 * <SVGColorWheel
 *   size={300}
 *   colors={['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']}
 *   onSegmentPress={(index, color) => console.log(index, color)}
 * />
 *
 * <SkiaColorWheel
 *   size={300}
 *   colors={['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']}
 *   innerRadius={0.3}
 * />
 * ```
 */

import {
  Blur,
  Canvas,
  Group,
  Paint,
  Skia,
  Circle as SkiaCircle,
  Path as SkiaPath,
} from '@shopify/react-native-skia';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

// ============================================================================
// SHARED TYPES & CONSTANTS
// ============================================================================

const DEFAULT_COLORS = [
  '#FFEB3B', // Yellow
  '#FF9800', // Orange
  '#F44336', // Red
  '#E91E63', // Magenta
  '#9C27B0', // Purple
  '#3F51B5', // Indigo
  '#03A9F4', // Light Blue
  '#4CAF50', // Green
];

type BaseColorWheelProps = {
  /** Width of the color wheel. If only size is provided, uses size for both dimensions */
  width?: number;
  /** Height of the color wheel. If only size is provided, uses size for both dimensions */
  height?: number;
  /** @deprecated Use width/height instead. Sets both width and height when provided alone */
  size?: number;
  /** Array of colors for each segment */
  colors?: string[];
  /** Starting rotation in degrees (-90 starts from top) */
  rotation?: number;
  /** Inner radius as percentage (0-1) for donut effect, 0 = full pie */
  innerRadius?: number;
};

// ============================================================================
// SVG IMPLEMENTATION
// ============================================================================

type SVGColorWheelProps = BaseColorWheelProps & {
  /** Stroke width between segments */
  strokeWidth?: number;
  /** Stroke color between segments */
  strokeColor?: string;
  /** Callback when a segment is pressed */
  onSegmentPress?: (index: number, color: string) => void;
  /** Style for the container */
  style?: StyleProp<ViewStyle>;
  /** Amount of curve on the edges (0 = straight, 0.2 = subtle curve, 0.5 = pronounced curve) */
  curveAmount?: number;
};

/**
 * SVGColorWheel
 *
 * Color wheel implementation using react-native-svg.
 * Best for: Static displays, simple interactions, smaller bundle size impact.
 */
export const SVGColorWheel = ({
  size = 300,
  colors = DEFAULT_COLORS,
  rotation = -90,
  innerRadius = 0,
  strokeWidth = 0,
  strokeColor = '#fff',
  style,
  onSegmentPress,
  curveAmount = 0,
}: SVGColorWheelProps) => {
  const center = size / 2;
  const outerRadius = size / 2 - strokeWidth;
  const innerR = outerRadius * innerRadius;
  const numSegments = colors.length;
  const anglePerSegment = 360 / numSegments;
  const anglePerSegmentRad = (anglePerSegment * Math.PI) / 180;

  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  /**
   * Creates an SVG path for a wedge segment.
   * For donut shape, creates an arc with inner and outer edges.
   * For full pie, creates a wedge from center.
   * When curveAmount > 0, edges are curved using quadratic bezier curves.
   */
  const createWedgePath = (startAngleDeg: number, endAngleDeg: number) => {
    const startAngle = toRadians(startAngleDeg);
    const endAngle = toRadians(endAngleDeg);

    // Outer arc points
    const outerX1 = center + outerRadius * Math.cos(startAngle);
    const outerY1 = center + outerRadius * Math.sin(startAngle);
    const outerX2 = center + outerRadius * Math.cos(endAngle);
    const outerY2 = center + outerRadius * Math.sin(endAngle);

    const largeArcFlag = anglePerSegment > 180 ? 1 : 0;

    if (innerRadius > 0) {
      // Donut wedge: arc with inner cutout
      const innerX1 = center + innerR * Math.cos(startAngle);
      const innerY1 = center + innerR * Math.sin(startAngle);
      const innerX2 = center + innerR * Math.cos(endAngle);
      const innerY2 = center + innerR * Math.sin(endAngle);

      if (curveAmount > 0) {
        // Curved edges using quadratic bezier
        // Control points are placed perpendicular to the edge, curving outward
        const midRadius = (outerRadius + innerR) / 2;
        const curveOffset = midRadius * curveAmount;

        // Control point for start edge (outer to inner at start angle)
        const ctrl1X = center + (midRadius + curveOffset) * Math.cos(startAngle);
        const ctrl1Y = center + (midRadius + curveOffset) * Math.sin(startAngle);

        // Control point for end edge (inner to outer at end angle)
        const ctrl2X = center + (midRadius + curveOffset) * Math.cos(endAngle);
        const ctrl2Y = center + (midRadius + curveOffset) * Math.sin(endAngle);

        return [
          `M ${outerX1} ${outerY1}`, // Start at outer arc start
          `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerX2} ${outerY2}`, // Outer arc
          `Q ${ctrl2X} ${ctrl2Y} ${innerX2} ${innerY2}`, // Curved line to inner arc end
          `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerX1} ${innerY1}`, // Inner arc (reverse)
          `Q ${ctrl1X} ${ctrl1Y} ${outerX1} ${outerY1}`, // Curved line back to start
        ].join(' ');
      }

      return [
        `M ${outerX1} ${outerY1}`, // Start at outer arc
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerX2} ${outerY2}`, // Outer arc
        `L ${innerX2} ${innerY2}`, // Line to inner arc
        `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerX1} ${innerY1}`, // Inner arc (reverse)
        'Z', // Close path
      ].join(' ');
    }

    // Full pie wedge: from center
    if (curveAmount > 0) {
      // Curved edges using quadratic bezier
      // Control points bow outward from the straight line
      const curveOffset = outerRadius * curveAmount;

      // Control point for line from center to outer start
      const ctrl1X = center + curveOffset * Math.cos(startAngle - anglePerSegmentRad * 0.15);
      const ctrl1Y = center + curveOffset * Math.sin(startAngle - anglePerSegmentRad * 0.15);

      // Control point for line from outer end back to center
      const ctrl2X = center + curveOffset * Math.cos(endAngle + anglePerSegmentRad * 0.15);
      const ctrl2Y = center + curveOffset * Math.sin(endAngle + anglePerSegmentRad * 0.15);

      return [
        `M ${center} ${center}`, // Move to center
        `Q ${ctrl1X} ${ctrl1Y} ${outerX1} ${outerY1}`, // Curved line to arc start
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerX2} ${outerY2}`, // Arc
        `Q ${ctrl2X} ${ctrl2Y} ${center} ${center}`, // Curved line back to center
      ].join(' ');
    }

    return [
      `M ${center} ${center}`, // Move to center
      `L ${outerX1} ${outerY1}`, // Line to arc start
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerX2} ${outerY2}`, // Arc
      'Z', // Close path
    ].join(' ');
  };

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G transform={`rotate(${rotation}, ${center}, ${center})`}>
          {colors.map((color, index) => {
            const startAngle = index * anglePerSegment;
            const endAngle = startAngle + anglePerSegment;

            return (
              <Path
                key={index}
                d={createWedgePath(startAngle, endAngle)}
                fill={color}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                onPress={onSegmentPress ? () => onSegmentPress(index, color) : undefined}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
};

// ============================================================================
// SKIA IMPLEMENTATION
// ============================================================================

type SkiaColorWheelProps = BaseColorWheelProps & {
  /** Background color for the center (donut hole) */
  centerColor?: string;
};

/**
 * SkiaColorWheel
 *
 * Color wheel implementation using react-native-skia.
 * Supports elliptical shapes when width !== height.
 * Best for: Animations, complex shader effects, GPU acceleration.
 */
export const SkiaColorWheel = ({
  width,
  height,
  size = 300,
  colors = DEFAULT_COLORS,
  rotation = -90,
  innerRadius = 0,
  centerColor = 'transparent',
}: SkiaColorWheelProps) => {
  // Support both width/height and legacy size prop
  const actualWidth = width ?? size;
  const actualHeight = height ?? size;

  // Elliptical radii
  const centerX = actualWidth / 2;
  const centerY = actualHeight / 2;
  const radiusX = actualWidth / 2;
  const radiusY = actualHeight / 2;

  // Inner radius scales proportionally with the smaller dimension
  const minRadius = Math.min(radiusX, radiusY);
  const innerRadiusX = minRadius * innerRadius;
  const innerRadiusY = minRadius * innerRadius;

  const numSegments = colors.length;
  const anglePerSegment = (2 * Math.PI) / numSegments;

  // Convert rotation to radians and apply offset
  const rotationRad = (rotation * Math.PI) / 180;

  /**
   * Creates a Skia path for an elliptical wedge segment.
   */
  const createWedgePath = (startAngle: number, endAngle: number) => {
    const path = Skia.Path.Make();

    // Apply rotation offset
    const adjStartAngle = startAngle + rotationRad;
    const adjEndAngle = endAngle + rotationRad;

    // Calculate elliptical start points
    const outerX1 = centerX + radiusX * Math.cos(adjStartAngle);
    const outerY1 = centerY + radiusY * Math.sin(adjStartAngle);

    if (innerRadius > 0) {
      // Donut wedge - calculate inner end point for line connection
      const innerX2 = centerX + innerRadiusX * Math.cos(adjEndAngle);
      const innerY2 = centerY + innerRadiusY * Math.sin(adjEndAngle);

      path.moveTo(outerX1, outerY1);
      path.arcToOval(
        { x: 0, y: 0, width: actualWidth, height: actualHeight },
        ((adjStartAngle * 180) / Math.PI),
        ((anglePerSegment * 180) / Math.PI),
        false
      );
      path.lineTo(innerX2, innerY2);
      path.arcToOval(
        { x: centerX - innerRadiusX, y: centerY - innerRadiusY, width: innerRadiusX * 2, height: innerRadiusY * 2 },
        ((adjEndAngle * 180) / Math.PI),
        ((-anglePerSegment * 180) / Math.PI),
        false
      );
      path.close();
    } else {
      // Full pie wedge
      path.moveTo(centerX, centerY);
      path.lineTo(outerX1, outerY1);
      path.arcToOval(
        { x: 0, y: 0, width: actualWidth, height: actualHeight },
        ((adjStartAngle * 180) / Math.PI),
        ((anglePerSegment * 180) / Math.PI),
        false
      );
      path.lineTo(centerX, centerY);
      path.close();
    }

    return path;
  };

  return (
    <View style={styles.container}>
      <Canvas style={{ width: actualWidth, height: actualHeight }}>
        {colors.map((color, index) => {
          const startAngle = index * anglePerSegment;
          const endAngle = startAngle + anglePerSegment;
          const path = createWedgePath(startAngle, endAngle);

          return <SkiaPath key={index} path={path} color={color} />;
        })}
        {/* Center ellipse for donut hole */}
        {innerRadius > 0 && centerColor !== 'transparent' && (
          <SkiaCircle cx={centerX} cy={centerY} r={minRadius * innerRadius} color={centerColor} />
        )}
      </Canvas>
    </View>
  );
};

// ============================================================================
// SKIA BLURRED IMPLEMENTATION (FOR GLOW EFFECT)
// ============================================================================

type SkiaColorWheelBlurredProps = BaseColorWheelProps & {
  /** Blur radius for the glow effect */
  blurRadius?: number;
  /** Opacity of the blurred wheel (0-1) */
  opacity?: number;
};

/**
 * SkiaColorWheelBlurred
 *
 * A blurred version of the color wheel for creating glow effects.
 * Renders the same color wheel segments with a Gaussian blur applied.
 * Supports elliptical shapes when width !== height.
 *
 * Best for: Glow effects behind cards, ambient lighting effects.
 */
export const SkiaColorWheelBlurred = ({
  width,
  height,
  size = 300,
  colors = DEFAULT_COLORS,
  rotation = -90,
  innerRadius = 0,
  blurRadius = 20,
  opacity = 0.6,
}: SkiaColorWheelBlurredProps) => {
  // Support both width/height and legacy size prop
  const actualWidth = width ?? size;
  const actualHeight = height ?? size;

  // Add padding to canvas to prevent blur clipping at edges
  const blurPadding = blurRadius * 2;
  const canvasWidth = actualWidth + blurPadding * 2;
  const canvasHeight = actualHeight + blurPadding * 2;
  const offsetX = blurPadding;
  const offsetY = blurPadding;

  // Elliptical radii with offset for padded canvas
  const centerX = actualWidth / 2 + offsetX;
  const centerY = actualHeight / 2 + offsetY;
  const radiusX = actualWidth / 2;
  const radiusY = actualHeight / 2;

  // Inner radius scales proportionally with the smaller dimension
  const minRadius = Math.min(radiusX, radiusY);
  const innerRadiusX = minRadius * innerRadius;
  const innerRadiusY = minRadius * innerRadius;

  const numSegments = colors.length;
  const anglePerSegment = (2 * Math.PI) / numSegments;

  // Convert rotation to radians and apply offset
  const rotationRad = (rotation * Math.PI) / 180;

  /**
   * Creates a Skia path for an elliptical wedge segment.
   */
  const createWedgePath = (startAngle: number, endAngle: number) => {
    const path = Skia.Path.Make();

    // Apply rotation offset
    const adjStartAngle = startAngle + rotationRad;
    const adjEndAngle = endAngle + rotationRad;

    // Calculate elliptical start points
    const outerX1 = centerX + radiusX * Math.cos(adjStartAngle);
    const outerY1 = centerY + radiusY * Math.sin(adjStartAngle);

    if (innerRadius > 0) {
      // Donut wedge - calculate inner end point for line connection
      const innerX2 = centerX + innerRadiusX * Math.cos(adjEndAngle);
      const innerY2 = centerY + innerRadiusY * Math.sin(adjEndAngle);

      path.moveTo(outerX1, outerY1);
      path.arcToOval(
        { x: offsetX, y: offsetY, width: actualWidth, height: actualHeight },
        (adjStartAngle * 180) / Math.PI,
        (anglePerSegment * 180) / Math.PI,
        false
      );
      path.lineTo(innerX2, innerY2);
      path.arcToOval(
        { x: centerX - innerRadiusX, y: centerY - innerRadiusY, width: innerRadiusX * 2, height: innerRadiusY * 2 },
        (adjEndAngle * 180) / Math.PI,
        (-anglePerSegment * 180) / Math.PI,
        false
      );
      path.close();
    } else {
      // Full pie wedge
      path.moveTo(centerX, centerY);
      path.lineTo(outerX1, outerY1);
      path.arcToOval(
        { x: offsetX, y: offsetY, width: actualWidth, height: actualHeight },
        (adjStartAngle * 180) / Math.PI,
        (anglePerSegment * 180) / Math.PI,
        false
      );
      path.lineTo(centerX, centerY);
      path.close();
    }

    return path;
  };

  // Create the blur paint for the layer
  const blurPaint = (
    <Paint>
      <Blur blur={blurRadius} />
    </Paint>
  );

  return (
    <Canvas
      style={{
        width: canvasWidth,
        height: canvasHeight,
        opacity,
        // Offset the canvas to center the glow effect
        marginLeft: -blurPadding,
        marginTop: -blurPadding,
      }}
    >
      {/* Use layer prop to apply blur to all children */}
      <Group layer={blurPaint}>
        {colors.map((color, index) => {
          const startAngle = index * anglePerSegment;
          const endAngle = startAngle + anglePerSegment;
          const path = createWedgePath(startAngle, endAngle);

          return <SkiaPath key={index} path={path} color={color} />;
        })}
      </Group>
    </Canvas>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
