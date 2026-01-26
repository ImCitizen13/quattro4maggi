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

import { Canvas, Skia, Circle as SkiaCircle, Path as SkiaPath } from '@shopify/react-native-skia';
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
  /** Size of the color wheel (width and height) */
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
}: SVGColorWheelProps) => {
  const center = size / 2;
  const outerRadius = size / 2 - strokeWidth;
  const innerR = outerRadius * innerRadius;
  const numSegments = colors.length;
  const anglePerSegment = 360 / numSegments;

  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  /**
   * Creates an SVG path for a wedge segment.
   * For donut shape, creates an arc with inner and outer edges.
   * For full pie, creates a wedge from center.
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

      return [
        `M ${outerX1} ${outerY1}`, // Start at outer arc
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerX2} ${outerY2}`, // Outer arc
        `L ${innerX2} ${innerY2}`, // Line to inner arc
        `A ${innerR} ${innerR} 0 ${largeArcFlag} 0 ${innerX1} ${innerY1}`, // Inner arc (reverse)
        'Z', // Close path
      ].join(' ');
    }

    // Full pie wedge: from center
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
        <G rotation={rotation} origin={`${center}, ${center}`}>
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
 * Best for: Animations, complex shader effects, GPU acceleration.
 */
export const SkiaColorWheel = ({
  size = 300,
  colors = DEFAULT_COLORS,
  rotation = -90,
  innerRadius = 0,
  centerColor = 'transparent',
}: SkiaColorWheelProps) => {
  const center = size / 2;
  const outerRadius = size / 2;
  const innerR = outerRadius * innerRadius;
  const numSegments = colors.length;
  const anglePerSegment = (2 * Math.PI) / numSegments;

  // Convert rotation to radians and apply offset
  const rotationRad = (rotation * Math.PI) / 180;

  /**
   * Creates a Skia path for a wedge segment.
   */
  const createWedgePath = (startAngle: number, endAngle: number) => {
    const path = Skia.Path.Make();

    // Apply rotation offset
    const adjStartAngle = startAngle + rotationRad;
    const adjEndAngle = endAngle + rotationRad;

    // Calculate start points
    const outerX1 = center + outerRadius * Math.cos(adjStartAngle);
    const outerY1 = center + outerRadius * Math.sin(adjStartAngle);

    if (innerRadius > 0) {
      // Donut wedge - calculate inner end point for line connection
      const innerX2 = center + innerR * Math.cos(adjEndAngle);
      const innerY2 = center + innerR * Math.sin(adjEndAngle);

      path.moveTo(outerX1, outerY1);
      path.arcToOval(
        { x: 0, y: 0, width: size, height: size },
        ((adjStartAngle * 180) / Math.PI),
        ((anglePerSegment * 180) / Math.PI),
        false
      );
      path.lineTo(innerX2, innerY2);
      path.arcToOval(
        { x: center - innerR, y: center - innerR, width: innerR * 2, height: innerR * 2 },
        ((adjEndAngle * 180) / Math.PI),
        ((-anglePerSegment * 180) / Math.PI),
        false
      );
      path.close();
    } else {
      // Full pie wedge
      path.moveTo(center, center);
      path.lineTo(outerX1, outerY1);
      path.arcToOval(
        { x: 0, y: 0, width: size, height: size },
        ((adjStartAngle * 180) / Math.PI),
        ((anglePerSegment * 180) / Math.PI),
        false
      );
      path.lineTo(center, center);
      path.close();
    }

    return path;
  };

  return (
    <View style={styles.container}>
      <Canvas style={{ width: size, height: size }}>
        {colors.map((color, index) => {
          const startAngle = index * anglePerSegment;
          const endAngle = startAngle + anglePerSegment;
          const path = createWedgePath(startAngle, endAngle);

          return <SkiaPath key={index} path={path} color={color} />;
        })}
        {/* Center circle for donut hole */}
        {innerRadius > 0 && centerColor !== 'transparent' && (
          <SkiaCircle cx={center} cy={center} r={innerR} color={centerColor} />
        )}
      </Canvas>
    </View>
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
