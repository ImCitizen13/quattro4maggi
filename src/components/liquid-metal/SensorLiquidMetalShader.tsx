import {
  getMetalColors,
  type MetalPresetName,
  type RGB,
} from "@/lib/shaders/ColorsLiquidMetal";
import { sensorLiquidMetalShader } from "@/lib/shaders/SensorLiquidMetal";
import {
  Canvas,
  Fill,
  Shader,
  Skia,
  useClock,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import {
  SensorType,
  useAnimatedSensor,
  useDerivedValue,
} from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Shape mode for the liquid metal effect
 */
export type LiquidMetalShape = 0 | 1 | 2 | 3 | 4;

export type SensorLiquidMetalShaderProps = {
  /**
   * Width of the canvas
   * @default 300
   */
  width?: number;

  /**
   * Height of the canvas
   * @default 300
   */
  height?: number;

  /**
   * Metal preset name or 'custom' for custom colors
   * @default 'silver'
   */
  metal?: MetalPresetName;

  /**
   * Custom highlight color (required if metal is 'custom')
   */
  customHighlight?: RGB;

  /**
   * Custom shadow color (required if metal is 'custom')
   */
  customShadow?: RGB;

  /**
   * Shape mode (0=full, 1=circle, 2=daisy, 3=diamond, 4=metaballs)
   * @default 1
   */
  shape?: LiquidMetalShape;

  /**
   * Background color [R, G, B, A] (0-1 range)
   * @default [0, 0, 0, 0]
   */
  colorBack?: [number, number, number, number];

  /**
   * Tint color for color burn effect [R, G, B, A] (0-1 range)
   * @default [1, 1, 1, 0]
   */
  colorTint?: [number, number, number, number];

  /**
   * Blur/softness amount (0-1)
   * @default 0
   */
  softness?: number;

  /**
   * Stripe pattern repetition count (1-20)
   * @default 3
   */
  repetition?: number;

  /**
   * Red channel chromatic shift amount (0-1)
   * @default 0.3
   */
  shiftRed?: number;

  /**
   * Blue channel chromatic shift amount (0-1)
   * @default 0.3
   */
  shiftBlue?: number;

  /**
   * Noise distortion amount (0-1)
   * @default 0.07
   */
  distortion?: number;

  /**
   * Edge/contour definition (0-1)
   * @default 0.3
   */
  contour?: number;

  /**
   * Pattern rotation angle in degrees
   * @default 30
   */
  angle?: number;

  /**
   * Animation speed multiplier
   * @default 1
   */
  speed?: number;

  /**
   * How much the device sensor affects the reflection (0-1)
   * 0 = no sensor influence, 1 = full sensor influence
   * @default 0.7
   */
  sensorInfluence?: number;

  /**
   * Sensor update interval in milliseconds
   * Lower = more responsive, higher = less battery drain
   * @default 16 (60fps)
   */
  sensorInterval?: number;
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * SensorLiquidMetalShader
 *
 * A liquid metal shader that reacts to device tilt using the accelerometer/gyroscope.
 * Tilting the device shifts the light reflections for a realistic metallic effect.
 *
 * FLOW:
 * 1. Component mounts → sensor starts listening
 * 2. Device tilts → sensor data updates (pitch, roll)
 * 3. Shader receives sensor values as uniforms
 * 4. Metal reflections shift based on tilt angle
 *
 * KEY FEATURES:
 * - Real-time device orientation tracking
 * - Smooth reflection angle changes based on tilt
 * - Adjustable sensor influence (0-1)
 * - All metal presets and shapes supported
 * - Battery-conscious with configurable update interval
 *
 * USAGE:
 * ```tsx
 * // Basic - tilt device to see reflections shift
 * <SensorLiquidMetalShader metal="gold" />
 *
 * // Subtle sensor effect
 * <SensorLiquidMetalShader metal="chrome" sensorInfluence={0.3} />
 *
 * // Maximum sensor reactivity
 * <SensorLiquidMetalShader metal="silver" sensorInfluence={1.0} />
 * ```
 *
 * @see https://docs.swmansion.com/react-native-reanimated/docs/device/useAnimatedSensor/
 */
export function SensorLiquidMetalShader({
  width = 300,
  height = 300,
  metal = "silver",
  customHighlight,
  customShadow,
  shape = 1,
  colorBack = [0, 0, 0, 0],
  colorTint = [1, 1, 1, 0],
  softness = 0,
  repetition = 3,
  shiftRed = 0.3,
  shiftBlue = 0.3,
  distortion = 0.07,
  contour = 0.3,
  angle = 30,
  speed = 1,
  sensorInfluence = 0.7,
  sensorInterval = 16,
}: SensorLiquidMetalShaderProps) {
  // ============================================================================
  // METAL COLORS
  // ============================================================================

  const metalColors = useMemo(() => {
    return getMetalColors(metal, customHighlight, customShadow);
  }, [metal, customHighlight, customShadow]);

  // ============================================================================
  // SENSOR DATA
  // ============================================================================

  /**
   * useAnimatedSensor with ROTATION gives us:
   * - pitch: forward/backward tilt (-π to π)
   * - roll: left/right tilt (-π to π)
   * - yaw: rotation around vertical axis (-π to π)
   *
   * We normalize these to -1 to 1 range for the shader.
   */
  const sensor = useAnimatedSensor(SensorType.ROTATION, {
    interval: sensorInterval,
  });

  // ============================================================================
  // ANIMATION STATE
  // ============================================================================

  const clock = useClock();

  const uniforms = useDerivedValue(() => {
    const time = (clock.value / 1000) * speed;

    // Extract sensor values and normalize to -1 to 1 range
    // pitch: tilt forward/backward, roll: tilt left/right
    const sensorX = sensor.sensor.value.roll / Math.PI; // -1 to 1
    const sensorY = sensor.sensor.value.pitch / Math.PI; // -1 to 1

    return {
      iResolution: [width, height],
      iTime: time,
      iColorBack: colorBack,
      iColorTint: colorTint,
      iColorHighlight: metalColors.highlight,
      iColorShadow: metalColors.shadow,
      iSoftness: softness,
      iRepetition: repetition,
      iShiftRed: shiftRed,
      iShiftBlue: shiftBlue,
      iDistortion: distortion,
      iContour: contour,
      iAngle: angle,
      iShape: shape,
      iSensorX: sensorX,
      iSensorY: sensorY,
      iSensorInfluence: sensorInfluence,
    };
  });

  // ============================================================================
  // SHADER COMPILATION
  // ============================================================================

  const shader = useMemo(() => {
    return Skia.RuntimeEffect.Make(sensorLiquidMetalShader);
  }, []);

  if (!shader) {
    console.error("Failed to compile sensor liquid metal shader");
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Canvas style={[styles.canvas, { width, height }]}>
      <Fill>
        <Shader source={shader} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  canvas: {},
});
