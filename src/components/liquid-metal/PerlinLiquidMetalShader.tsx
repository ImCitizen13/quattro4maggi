import {
  getMetalColors,
  type MetalPresetName,
  type RGB,
} from "@/lib/shaders/ColorsLiquidMetal";
import { perlinLiquidMetalShader } from "@/lib/shaders/PerlinLiquidMetal";
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

export type PerlinLiquidMetalShaderProps = {
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
   * RGB values 0-1
   */
  customHighlight?: RGB;

  /**
   * Custom shadow color (required if metal is 'custom')
   * RGB values 0-1
   */
  customShadow?: RGB;

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
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * PerlinLiquidMetalShader
 *
 * A Skia shader component that renders a liquid metal effect with customizable
 * metal colors. Uses Perlin noise for a differentiated visual texture.
 *
 * FLOW:
 * 1. Component mounts → shader compiles with uniforms
 * 2. Clock updates every frame → uniforms recalculate
 * 3. Shader renders liquid metal with selected metal preset and shape
 *
 * KEY FEATURES:
 * - 9 metal presets: silver, gold, copper, roseGold, bronze, platinum, chrome, titanium, brass
 * - Custom color support for unique metal looks
 * - Perlin noise for organic texture (different from original)
 * - 5 shape modes: full-fill, circle, daisy, diamond, metaballs
 *
 * USAGE:
 * ```tsx
 * // Using a preset
 * <PerlinLiquidMetalShader metal="gold" shape={1} />
 *
 * // Using custom colors
 * <PerlinLiquidMetalShader
 *   metal="custom"
 *   customHighlight={[0.9, 0.5, 0.8]}
 *   customShadow={[0.3, 0.1, 0.2]}
 * />
 * ```
 */
export function PerlinLiquidMetalShader({
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
}: PerlinLiquidMetalShaderProps) {
  // ============================================================================
  // METAL COLORS
  // ============================================================================

  const metalColors = useMemo(() => {
    return getMetalColors(metal, customHighlight, customShadow);
  }, [metal, customHighlight, customShadow]);

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
    };
  });

  // ============================================================================
  // SHADER COMPILATION
  // ============================================================================

  const shader = useMemo(() => {
    return Skia.RuntimeEffect.Make(perlinLiquidMetalShader);
  }, []);

  if (!shader) {
    console.error("Failed to compile Perlin liquid metal shader");
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
