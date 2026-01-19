import { liquidMetalShader } from "@/lib/shaders/liquidMetal";
import {
  Canvas,
  Fill,
  Shader,
  Skia,
  useClock,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useDerivedValue } from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Shape mode for the liquid metal effect
 * - 0: Full-fill (fills entire canvas with edge effects)
 * - 1: Circle (centered circular shape)
 * - 2: Daisy (flower/petal pattern)
 * - 3: Diamond (rotated square)
 * - 4: Metaballs (animated blob shapes)
 */
export type LiquidMetalShape = 0 | 1 | 2 | 3 | 4;

export type LiquidMetalShaderProps = {
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
   * Shape mode (0=full, 1=circle, 2=daisy, 3=diamond, 4=metaballs)
   * @default 1
   */
  shape?: LiquidMetalShape;

  /**
   * Background color [R, G, B, A] (0-1 range)
   * @default [0, 0, 0, 0] (transparent)
   */
  colorBack?: [number, number, number, number];

  /**
   * Tint color for color burn effect [R, G, B, A] (0-1 range)
   * Alpha controls tint intensity
   * @default [1, 1, 1, 0] (no tint)
   */
  colorTint?: [number, number, number, number];

  /**
   * Blur/softness amount (0-1)
   * Higher values create softer stripe transitions
   * @default 0.5
   */
  softness?: number;

  /**
   * Stripe pattern repetition count (1-20)
   * Higher values = more stripes
   * @default 5
   */
  repetition?: number;

  /**
   * Red channel chromatic shift amount (0-1)
   * Creates color separation effect
   * @default 0.5
   */
  shiftRed?: number;

  /**
   * Blue channel chromatic shift amount (0-1)
   * Creates color separation effect
   * @default 0.5
   */
  shiftBlue?: number;

  /**
   * Noise distortion amount (0-1)
   * Adds organic randomness to the pattern
   * @default 0.2
   */
  distortion?: number;

  /**
   * Edge/contour definition (0-1)
   * Higher values create sharper shape edges
   * @default 0.5
   */
  contour?: number;

  /**
   * Pattern rotation angle in degrees
   * @default 0
   */
  angle?: number;

  /**
   * Animation speed multiplier
   * @default 1
   */
  speed?: number;
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * LiquidMetalShader
 *
 * A Skia shader component that renders a liquid metal effect with animated
 * flowing patterns and chromatic aberration. Ported from paper-design/shaders.
 *
 * FLOW:
 * 1. Component mounts → shader compiles with uniforms
 * 2. Clock updates every frame → uniforms recalculate
 * 3. Shader renders liquid metal with selected shape and effects
 *
 * KEY FEATURES:
 * - 5 shape modes: full-fill, circle, daisy, diamond, metaballs
 * - Chromatic aberration (RGB color separation)
 * - Animated stripe patterns
 * - Simplex noise distortion
 * - Customizable colors, softness, and effects
 *
 * USAGE:
 * ```tsx
 * <LiquidMetalShader
 *   shape={1}
 *   repetition={5}
 *   shiftRed={0.5}
 *   shiftBlue={0.5}
 *   distortion={0.2}
 *   contour={0.5}
 * />
 * ```
 *
 * @see https://github.com/paper-design/shaders
 */
export function LiquidMetalShader({
  width = 300,
  height = 300,
  shape = 1,
  colorBack = [0, 0, 0, 0], // Background color [R, G, B, A] (0-1 range)
  colorTint = [1, 1, 1, 0], // Tint color for color burn effect [R, G, B, A] (0-1 range)
  softness = 0, // Blur/softness amount (0-1)
  repetition = 3, // Stripe pattern repetition count (1-20)
  shiftRed = 0.3, // Red channel chromatic shift amount (0-1)
  shiftBlue = 0.3, // Blue channel chromatic shift amount (0-1)
  distortion = 0.07, // Noise distortion amount (0-1)
  contour = 0.3, // Edge/contour definition (0-1)
  angle = 30, // Pattern rotation angle in degrees
  speed = 1, // Animation speed multiplier
}: LiquidMetalShaderProps) {
  // const { width, height } = useWindowDimensions();

  // ============================================================================
  // ANIMATION STATE
  // ============================================================================

  const clock = useClock();

  const uniforms = useDerivedValue(() => {
    const time = (clock.value / 1000) * speed;
    return {
      iResolution: [width, height],
      iTime: time,
      iColorBack: colorBack,
      iColorTint: colorTint,
      iSoftness: softness,
      iRepetition: repetition,
      iShiftRed: shiftRed,
      iShiftBlue: shiftBlue,
      iDistortion: distortion,
      iContour: contour,
      iAngle: angle,
      iShape: shape,
    };
  });

  // ============================================================================
  // SHADER COMPILATION
  // ============================================================================

  const shader = useMemo(() => {
    return Skia.RuntimeEffect.Make(liquidMetalShader);
  }, []);

  if (!shader) {
    console.error("Failed to compile liquid metal shader");
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Canvas style={[styles.canvas, { width: width, height: height, }]}>
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
  canvas: {
    // flex: 1,
  },
});
