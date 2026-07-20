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
 * - Path changes morph: the previous field is kept and lerped into the new
 *   one in the shader (noise-biased), so shapes melt/fuse like metaballs
 *   instead of popping — no extra canvas, no mount/unmount
 * - Field stays readable in JS for future bubble-containment physics
 * - `debug` prop renders the raw field with isolines for verification
 */

import {
  getMetalColors,
  type MetalPresetName,
  type RGB,
} from "@/lib/shaders/ColorsLiquidMetal";
import { type PathSdf } from "@/lib/shaders/pathSdf";
import { sdfLiquidMetalShader } from "@/lib/shaders/SdfLiquidMetal";
import { usePathSdf } from "@/hooks/usePathSdf";
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
  type SkPath,
} from "@shopify/react-native-skia";
import React, { useMemo, useRef } from "react";
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SPRING_SDF_MORPH } from "@/lib/animations/constants";

// ============================================================================
// TYPES
// ============================================================================

export type SdfLiquidMetalShaderProps = {
  /** SVG path string (the "d" attribute from an SVG path element) */
  svgPath?: string;

  /**
   * A ready-made SkPath (e.g. from Skia.Path.MakeFromText). Takes precedence
   * over svgPath. The path is copied before fitting, never mutated.
   */
  path?: SkPath;

  /**
   * Pre-baked distance field (from usePathSdf). When provided, svgPath/path
   * are not baked here — pass this when a parent already owns the bake
   * (e.g. MorphingLiquidMetal) to avoid duplicate work.
   */
  sdf?: PathSdf | null;

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
  path,
  sdf: sdfProp,
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

  // Bake locally only when no pre-baked field was passed in — the hook
  // no-ops on an empty source, so standalone usage keeps working unchanged
  const internalSdf = usePathSdf(
    sdfProp ? {} : { svgPath, path },
    width,
    height
  );
  const sdf = sdfProp ?? internalSdf;

  // ============================================================================
  // SHAPE MORPH (two-slot field blend)
  // ============================================================================

  // The shader blends two field slots: iMorph 0 = slot A, 1 = slot B. A path
  // change loads the new field into the HIDDEN slot and springs the blend
  // toward it — the just-committed texture has zero weight under the current
  // blend value, so the new shape can never flash before the animation starts
  // (a reset-to-0 scheme raced the commit and did exactly that). Mid-morph
  // changes retarget from wherever the blend currently is.
  const morph = useSharedValue(0);
  const slotsRef = useRef<{
    a: PathSdf | null;
    b: PathSdf | null;
    showing: "a" | "b";
  }>({ a: null, b: null, showing: "a" });

  const slots = slotsRef.current;
  if (sdf) {
    const current = slots.showing === "a" ? slots.a : slots.b;
    if (
      !current ||
      current.width !== sdf.width ||
      current.height !== sdf.height
    ) {
      // First bake, or canvas resized: fill both slots, nothing to animate
      slots.a = sdf;
      slots.b = sdf;
    } else if (sdf !== current) {
      const target = slots.showing === "a" ? "b" : "a";
      slots[target] = sdf;
      slots.showing = target;
      // Shared values must not be written during render — defer the kick
      queueMicrotask(() => {
        morph.value = withSpring(target === "b" ? 1 : 0, SPRING_SDF_MORPH);
      });
    }
  }
  const sdfA = slots.a ?? sdf;
  const sdfB = slots.b ?? sdf;

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
  const sdfMaxA = sdfA?.maxDist ?? 1;
  const sdfMaxB = sdfB?.maxDist ?? 1;
  const sdfMaxInsideA = sdfA?.maxInside ?? 1;
  const sdfMaxInsideB = sdfB?.maxInside ?? 1;
  const sdfScale = sdf?.scale ?? 1;

  const uniforms = useDerivedValue(() => {
    const time = (clock.value / 1000) * speed;
    return {
      iResolution: [width, height],
      iTime: time,
      iSdfMaxA: sdfMaxA,
      iSdfMaxB: sdfMaxB,
      iSdfMaxInsideA: sdfMaxInsideA,
      iSdfMaxInsideB: sdfMaxInsideB,
      iSdfScale: sdfScale,
      iMorph: morph.value,
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
            {/* Child order matches the uniform shader declarations:
                iSdfTexA, then iSdfTexB */}
            <ImageShader
              image={(sdfA ?? sdf).image}
              fit="none"
              sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
            />
            <ImageShader
              image={(sdfB ?? sdf).image}
              fit="none"
              sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
            />
          </Shader>
        </Fill>
      </Group>
    </Canvas>
  );
}
