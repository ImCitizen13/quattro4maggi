/**
 * SdfLiquidMetalShader
 *
 * Liquid metal that follows an SVG path via a baked signed distance field.
 * Unlike SvgLiquidMetalShader there is NO clip: the mask, the edge/bevel and
 * the metal bands all derive from one distance field, so the bands render as
 * offset contours of the actual outline.
 *
 * FLOW:
 * 1. Parse + fit the SVG path into the canvas (same fitting as SvgLiquidMetalShader)
 * 2. Bake a signed EDT of the path on the CPU (pathSdf.ts) — once per path
 * 3. Upload the field as an RGBA_F32 image, passed as a child shader
 * 4. The shader draws bands as isolines of the field, marching with time
 *
 * KEY FEATURES:
 * - Bands follow the letterform outline (parallel offset contours)
 * - Field stays readable in JS for future bubble-containment physics
 * - `debug` prop renders the raw field with isolines for verification
 */

import {
  getMetalColors,
  type MetalPresetName,
  type RGB,
} from "@/lib/shaders/ColorsLiquidMetal";
import { bakePathSdf } from "@/lib/shaders/pathSdf";
import { sdfLiquidMetalShader } from "@/lib/shaders/SdfLiquidMetal";
import {
  Canvas,
  Fill,
  FilterMode,
  Group,
  ImageShader,
  MipmapMode,
  Shader,
  Skia,
  useClock,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { PixelRatio } from "react-native";
import { useDerivedValue } from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

export type SdfLiquidMetalShaderProps = {
  /** SVG path string (the "d" attribute from an SVG path element) */
  svgPath: string;

  /** Width of the canvas @default 300 */
  width?: number;

  /** Height of the canvas @default 300 */
  height?: number;

  /** Metal preset name or 'custom' for custom colors @default 'silver' */
  metal?: MetalPresetName;

  /** Custom highlight color (required if metal is 'custom'), RGB 0-1 */
  customHighlight?: RGB;

  /** Custom shadow color (required if metal is 'custom'), RGB 0-1 */
  customShadow?: RGB;

  /** Background color [R, G, B, A] (0-1) @default transparent */
  colorBack?: [number, number, number, number];

  /** Tint color for color burn effect [R, G, B, A] @default no tint */
  colorTint?: [number, number, number, number];

  /** Blur/softness amount (0-1) @default 0 */
  softness?: number;

  /** Stripe pattern repetition count (1-20) @default 3 */
  repetition?: number;

  /** Red channel chromatic shift amount (0-1) @default 0.3 */
  shiftRed?: number;

  /** Blue channel chromatic shift amount (0-1) @default 0.3 */
  shiftBlue?: number;

  /** Noise distortion amount (0-1) @default 0.07 */
  distortion?: number;

  /** Edge/contour definition (0-1) @default 0.3 */
  contour?: number;

  /** Animation speed multiplier @default 1 */
  speed?: number;

  /** Iridescence intensity (0-1) @default 0 */
  iridescence?: number;

  /** Six rainbow color stops for iridescence, each RGB 0-1 */
  iridColors?: [RGB, RGB, RGB, RGB, RGB, RGB];

  /** Render the raw distance field with isolines instead of metal @default false */
  debug?: boolean;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function SdfLiquidMetalShader({
  svgPath,
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
  debug = false,
}: SdfLiquidMetalShaderProps) {
  // ============================================================================
  // PATH + SDF BAKE (one-time per path/size)
  // ============================================================================

  const sdf = useMemo(() => {
    const p = Skia.Path.MakeFromSVGString(svgPath);
    if (!p) return null;

    const bounds = p.getBounds();
    if (!bounds.width || !bounds.height) return null;

    // Fit into the canvas with a margin so the outside field is visible too
    const margin = 0.1;
    const fitScale = Math.min(
      (width * (1 - 2 * margin)) / bounds.width,
      (height * (1 - 2 * margin)) / bounds.height
    );
    const offsetX = (width - bounds.width * fitScale) / 2;
    const offsetY = (height - bounds.height * fitScale) / 2;

    // Fix B: bake at device pixel ratio so the field matches the physical
    // pixel grid (capped — beyond 3× the F32 texture cost buys nothing)
    const pixelScale = Math.min(PixelRatio.get(), 3);

    p.transform(
      Skia.Matrix()
        .translate(-bounds.x, -bounds.y)
        .scale(fitScale * pixelScale, fitScale * pixelScale)
        .translate(offsetX / fitScale, offsetY / fitScale)
    );

    return bakePathSdf(
      p,
      width * pixelScale,
      height * pixelScale,
      pixelScale
    );
  }, [svgPath, width, height]);

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
  const sdfMax = sdf?.maxDist ?? 1;
  const sdfMaxInside = sdf?.maxInside ?? 1;
  const sdfScale = sdf?.scale ?? 1;

  const uniforms = useDerivedValue(() => {
    const time = (clock.value / 1000) * speed;
    return {
      iResolution: [width, height],
      iTime: time,
      iSdfMax: sdfMax,
      iSdfMaxInside: sdfMaxInside,
      iSdfScale: sdfScale,
      iDebug: debug ? 1 : 0,
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
    return Skia.RuntimeEffect.Make(sdfLiquidMetalShader);
  }, []);

  if (!shader || !sdf) {
    console.error("SdfLiquidMetalShader: failed to compile shader or bake SDF");
    return null;
  }

  // ============================================================================
  // RENDER — no clip: the field's own coverage masks the shape
  // ============================================================================

  return (
    <Canvas style={{ width, height }}>
      <Group>
        <Fill>
          <Shader source={shader} uniforms={uniforms}>
            <ImageShader
              image={sdf.image}
              fit="none"
              sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
            />
          </Shader>
        </Fill>
      </Group>
    </Canvas>
  );
}
