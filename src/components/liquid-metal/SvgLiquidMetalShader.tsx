import {
  getMetalColors,
  type MetalPresetName,
  type RGB,
} from "@/lib/shaders/ColorsLiquidMetal";
import { expoLiquidMetalShader } from "@/lib/shaders/ExpoLiquidMetal";
import {
  Blur,
  Canvas,
  Fill,
  Group,
  Path,
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
const PADDING = 15;
export type SvgLiquidMetalShaderProps = {
  /**
   * SVG path string (the "d" attribute from an SVG path element)
   */
  svgPath: string;

  /**
   * Original viewBox width of the SVG
   * @default 20
   */
  viewBoxWidth?: number;

  /**
   * Original viewBox height of the SVG
   * @default 20
   */
  viewBoxHeight?: number;

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
   * Background color [R, G, B, A] (0-1 range)
   * @default [0, 0, 0, 0] (transparent)
   */
  colorBack?: [number, number, number, number];

  /**
   * Tint color for color burn effect [R, G, B, A] (0-1 range)
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

  /**
   * Iridescence intensity (0-1)
   * @default 0
   */
  iridescence?: number;

  /**
   * Six rainbow color stops for iridescence effect
   * Each is [R, G, B] in 0-1 range
   */
  iridColors?: [RGB, RGB, RGB, RGB, RGB, RGB];
};

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * SvgLiquidMetalShader
 *
 * A Skia shader component that renders a liquid metal effect clipped to
 * a custom SVG path shape.
 *
 * USAGE:
 * ```tsx
 * <SvgLiquidMetalShader
 *   svgPath="M10,0 L20,20 L0,20 Z"
 *   viewBoxWidth={20}
 *   viewBoxHeight={20}
 *   width={300}
 *   height={300}
 *   metal="gold"
 * />
 * ```
 */
export function SvgLiquidMetalShader({
  svgPath,
  viewBoxWidth = 20,
  viewBoxHeight = 20,
  width = 300,
  height = 300,
  metal = "silver",
  customHighlight,
  customShadow,
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
  iridescence = 0,
  iridColors = [
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
    [1, 0, 1],
  ],
}: SvgLiquidMetalShaderProps) {
  // ============================================================================
  // SVG PATH
  // ============================================================================

  const path = useMemo(() => {
    const p = Skia.Path.MakeFromSVGString(svgPath);
    if (!p) return null;

    // Scale from viewBox to canvas size
    const scaleX = width / viewBoxWidth;
    const scaleY = height / viewBoxHeight;
    p.transform(Skia.Matrix().scale(scaleX, scaleY));

    return p;
  }, [svgPath, viewBoxWidth, viewBoxHeight, width, height]);

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
      iShape: 0, // Full-fill, let the SVG path do the clipping
      iIridescence: iridescence,
      iIridColor0: iridColors[0],
      iIridColor1: iridColors[1],
      iIridColor2: iridColors[2],
      iIridColor3: iridColors[3],
      iIridColor4: iridColors[4],
      iIridColor5: iridColors[5],
    };
  });

  // ============================================================================
  // SHADER COMPILATION
  // ============================================================================

  const shader = useMemo(() => {
    return Skia.RuntimeEffect.Make(expoLiquidMetalShader);
  }, []);

  if (!shader || !path) {
    console.error("Failed to compile shader or parse SVG path");
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Canvas style={[styles.canvas, { width: width + PADDING * 2, height: height + PADDING * 2  }]}>
      <Group transform={[{ translateX: PADDING }, { translateY: PADDING }]}>
      {/* Outer shadow (bottom-right) */}
      <Group transform={[{ translateX: 2 }, { translateY: 2 }]}>
        <Path path={path} color="rgba(0,0,0,0.8)">
          <Blur blur={4} />
        </Path>
      </Group>

      {/* Inner highlight (top-left) */}
      <Group transform={[{ translateX: -1 }, { translateY: -1 }]}>
        <Path path={path} color="rgba(255,255,255,0.6)">
          <Blur blur={2} />
        </Path>
      </Group>
      <Group clip={path}>
        <Fill>
          <Shader source={shader} uniforms={uniforms} />
        </Fill>
        </Group>
      </Group>
    </Canvas>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  canvas: {
    // backgroundColor: "red"
  },
});
