/**
 * PathMaskShaderDemo
 *
 * Demonstrates glass/refraction effects on arbitrary SVG paths using
 * alpha-based edge detection. The SVG path is rendered as a white mask,
 * and the shader uses the mask alpha to detect edges and apply effects.
 *
 * FLOW:
 * 1. SVG path is parsed and scaled to fit canvas
 * 2. Path is rendered as white on transparent (the mask)
 * 3. Shader samples mask alpha to detect edges
 * 4. Effects applied: prismatic colors, chromatic aberration, specular
 *
 * KEY FEATURES:
 * - Works with any SVG path (not limited to circles)
 * - Prismatic rainbow colors at edges
 * - Chromatic aberration effect
 * - Specular highlights
 */

import { pathMaskShaderSource } from "@/lib/shaders/PathMaskShader";
import {
  Canvas,
  Group,
  Paint,
  Path,
  Rect,
  RuntimeShader,
  Shader,
  Skia,
  useClock,
  vec,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useDerivedValue } from "react-native-reanimated";

// Stars shader - outputs to GREEN channel only (R=0, G=stars, B=stars)
// This leaves RED channel free for the mask
const starsShaderSource = Skia.RuntimeEffect.Make(`
  uniform float2 resolution;
  uniform float time;

  float hash12(float2 p) {
    float3 p3 = fract(float3(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, float3(p3.y, p3.z, p3.x) + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  half4 main(float2 fragCoord) {
    float d = hash12(fragCoord);
    d = pow(d, 3.0);
    float mult = sin(1.2 * time + fragCoord.x + fragCoord.y) + 1.0;
    mult *= 0.5;
    d = smoothstep(0.99, 1.0, d) * mult;
    // Output stars to G and B channels, leave R for mask
    return half4(0.0, half(d), half(d), 1.0);
  }
`)!;

// ============================================================================
// TYPES
// ============================================================================

type RGB = [number, number, number];

export type PathMaskShaderProps = {
  svgPath: string;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  width?: number;
  height?: number;
  dispersion?: number;
  refraction?: number;
  specular?: number;
  bgColor?: RGB;
  prismColors?: [RGB, RGB, RGB, RGB, RGB, RGB];
};

// ============================================================================
// COMPONENT
// ============================================================================

export function PathMaskShader({
  svgPath,
  viewBoxWidth = 20,
  viewBoxHeight = 20,
  width = 300,
  height = 300,
  dispersion = 0.05,
  refraction = 0.15,
  specular = 0.8,
  bgColor = [0.1, 0.1, 0.1],
  prismColors = [
    [1, 0.3, 0.3],
    [1, 0.8, 0.2],
    [0.3, 1, 0.4],
    [0.3, 0.9, 1],
    [0.4, 0.4, 1],
    [1, 0.4, 0.8],
  ],
}: PathMaskShaderProps) {
  const clock = useClock();

  // ============================================================================
  // SVG PATH
  // ============================================================================

  const path = useMemo(() => {
    const p = Skia.Path.MakeFromSVGString(svgPath);
    if (!p) return null;

    const bounds = p.getBounds();
    const boundsWidth = bounds.width || viewBoxWidth;
    const boundsHeight = bounds.height || viewBoxHeight;

    const padding = 40;
    const availableWidth = width - padding * 2;
    const availableHeight = height - padding * 2;
    const scale = Math.min(
      availableWidth / boundsWidth,
      availableHeight / boundsHeight
    );

    const scaledWidth = boundsWidth * scale;
    const scaledHeight = boundsHeight * scale;
    const offsetX = (width - scaledWidth) / 2;
    const offsetY = (height - scaledHeight) / 2;

    p.transform(
      Skia.Matrix()
        .translate(-bounds.x, -bounds.y)
        .scale(scale, scale)
        .translate(offsetX / scale, offsetY / scale)
    );

    return p;
  }, [svgPath, viewBoxWidth, viewBoxHeight, width, height]);

  // ============================================================================
  // SHADERS
  // ============================================================================

  const mainShader = useMemo(() => {
    return Skia.RuntimeEffect.Make(pathMaskShaderSource);
  }, []);

  const starsUniforms = useDerivedValue(() => ({
    resolution: vec(width, height),
    time: clock.value / 1000,
  }));

  const uniforms = useMemo(
    () => ({
      u_resolution: [width, height],
      u_dispersion: dispersion,
      u_refraction: refraction,
      u_specular: specular,
      u_bgColor: bgColor,
      u_prismColor0: prismColors[0],
      u_prismColor1: prismColors[1],
      u_prismColor2: prismColors[2],
      u_prismColor3: prismColors[3],
      u_prismColor4: prismColors[4],
      u_prismColor5: prismColors[5],
    }),
    [width, height, dispersion, refraction, specular, bgColor, prismColors]
  );

  if (!mainShader || !path || !starsShaderSource) {
    console.error("Failed to compile shader or parse path");
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  // Channel encoding approach:
  // - Stars render to G/B channels (cyan-ish)
  // - Mask path renders to R channel (red)
  // - Shader reads R for mask detection, G/B for star content
  return (
    <Canvas style={[styles.canvas, { width, height }]}>
      <Group
        layer={
          <Paint>
            <RuntimeShader source={mainShader} uniforms={uniforms} />
          </Paint>
        }
      >
        {/* Stars background - outputs to G/B channels */}
        <Rect x={0} y={0} width={width} height={height}>
          <Shader source={starsShaderSource} uniforms={starsUniforms} />
        </Rect>
        {/* Mask path - outputs to R channel */}
        <Path path={path} color="red" />
      </Group>
    </Canvas>
  );
}

// ============================================================================
// DEMO COMPONENT
// ============================================================================

const EXPO_LOGO =
  "M9.477 7.638c.164-.24.343-.27.488-.27.145 0 .387.03.551.27 2.13 2.901 6.55 10.56 6.959 10.976.605.618 1.436.233 1.918-.468.475-.69.607-1.174.607-1.69 0-.352-6.883-13.05-7.576-14.106-.667-1.017-.884-1.274-2.025-1.274h-.854c-1.138 0-1.302.257-1.969 1.274C6.883 3.406 0 16.104 0 16.456c0 .517.132 1 .607 1.69.482.7 1.313 1.086 1.918.468.41-.417 4.822-8.075 6.952-10.977z";

export function PathMaskShaderDemo() {
  return (
    <View style={styles.container}>
      <PathMaskShader
        svgPath={EXPO_LOGO}
        viewBoxWidth={20}
        viewBoxHeight={20}
        width={350}
        height={350}
        dispersion={0.08}
        specular={1.0}
        bgColor={[0.05, 0.05, 0.08]}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0d0d0d",
  },
  canvas: {},
});
