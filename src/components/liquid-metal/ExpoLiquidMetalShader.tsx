import {
  getMetalColors,
  type MetalPresetName,
  type RGB,
} from "@/lib/shaders/ColorsLiquidMetal";
import { expoLiquidMetalShader } from "@/lib/shaders/ExpoLiquidMetal";
import { perlinLiquidMetalShader } from "@/lib/shaders/PerlinLiquidMetal";
import {
  Canvas,
  Group,
  Paint,
  Rect,
  RuntimeShader,
  Shader,
  Skia,
  useClock,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { PixelRatio, StyleSheet } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { BShader, gray_PRISM_COLORS } from "../wabi-and-more/BShader";

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

export type ExpoLiquidMetalShaderProps = {
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

  /**
   * Rim bevel brightness (0-1). Pushes a thin band just inside the outline
   * toward the highlight color so the edge stays a bright polished bevel
   * instead of being darkened by the bands. @default 0
   */
  rimLight?: number;

  /**
   * Overall brightness / shadow lift (0-1). Screen-blends the metal toward
   * white, raising the dark floor (shadow lobes) while leaving highlights
   * ~unchanged — makes the metal read bright-biased (chrome) without
   * flattening. Decoupled from shadow color / lobe depth. @default 0
   */
  brightness?: number;

  /**
   * Glass tint color for the refraction bubble, RGB 0-1
   * @default [1, 1, 1]
   */
  bubbleColor?: RGB;

  /**
   * Bubble glass tint strength (0 = clear refraction, 1 = solid color)
   * @default 0
   */
  bubbleOpacity?: number;
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
 * 2. Clockates every frame → uniforms recalculate
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
export function ExpoLiquidMetalShader({
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
  iridescence = 0,
  iridColors = [
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
    [1, 0, 1],
  ],
  rimLight = 0,
  brightness = 0,
  bubbleColor = [1, 1, 1],
  bubbleOpacity = 0,
}: ExpoLiquidMetalShaderProps) {
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
    const timeSec = clock.value / 1000;
    const time = timeSec * speed;
    // Rotate the sweep angle clockwise over time. Rate scales with speed/3;
    // ×36 makes it a visible gentle spin (~10°/s at speed 1 → ~36s/rev).
    // Literal speed/3 deg/s would be ~imperceptible.
    const animatedAngle = angle + timeSec * (speed / 3) * 36;
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
      iAngle: animatedAngle,
      iShape: shape,
      iRimLight: rimLight,
      iBrightness: brightness,
      iIridescence: iridescence,
      iIridColor0: iridColors[0],
      iIridColor1: iridColors[1],
      iIridColor2: iridColors[2],
      iIridColor3: iridColors[3],
      iIridColor4: iridColors[4],
      iIridColor5: iridColors[5],
    };
  });



  // Device pixel ratio. The BShader is applied as a Group `layer`, whose
  // offscreen is otherwise rasterized at LOGICAL size (e.g. 250²) and then
  // upscaled ~3× to the physical screen → a pixelated rim. The DPR trick
  // (outer group scale 1/pd, inner scale pd, layer uniforms ×pd) forces the
  // offscreen to device resolution so the bubble samples a crisp metal.
  // Same pattern as WabiTimerExperiment.
  const pd = PixelRatio.get();

  // Prism bubble shader uniforms — controls refraction, glow, and colors.
  // Radius is derived from the canvas so the bubble sits centered with a
  // padding gap to the metal's edge (was hardcoded 220 > canvas → no rim).
  // Pixel-space values are ×pd because the layer filter runs in device pixels.
  const bubblePadding = 10;
  const shaderUniforms = useDerivedValue(() => ({
    u_resolution: [width * pd, height * pd],
    u_center: [(width / 2) * pd, (height / 2) * pd],
    u_radius: (Math.min(width, height) / 2 - bubblePadding) * pd,
    u_refraction: 0.3,
    u_edgeWidth: 0.1,
    // Low dispersion keeps the rim colorless — high values reintroduce a
    // rainbow via R/B channel splitting regardless of the gray prism stops.
    u_dispersion: 0.12,
    u_bgColor: [1, 1, 1], // ignored while u_transparentBg = 1
    u_specular: 0.1,
    u_shadowColor: [0, 0, 0] ,
    u_shadowOpacity: 0,
    u_shadowSpread: 0.2,
    u_transparentBg: 1, // transparent outside the bubble — no corner fill
    u_bubbleColor: bubbleColor,
    u_bubbleOpacity: bubbleOpacity,
    ...gray_PRISM_COLORS,
  }));
  // ============================================================================
  // SHADER COMPILATION
  // ============================================================================

  const shader = useMemo(() => {
    return Skia.RuntimeEffect.Make(expoLiquidMetalShader);
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
      {/* DPR scaling trick: outer 1/pd cancels the inner pd, but the inner
          scale forces the layer's offscreen to device resolution → crisp rim.
          The metal shader stays in LOGICAL space (Rect + iResolution), the
          bubble layer filter runs in device pixels (uniforms ×pd). */}
      <Group transform={[{ scale: 1 / pd }]}>
        <Group
          transform={[{ scale: pd }]}
          layer={
            <Paint>
              <RuntimeShader source={BShader} uniforms={shaderUniforms} />
            </Paint>
          }
        >
          <Rect x={0} y={0} width={width} height={height}>
            <Shader source={shader} uniforms={uniforms} />
          </Rect>
        </Group>
      </Group>
    </Canvas>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  canvas: {},
});
