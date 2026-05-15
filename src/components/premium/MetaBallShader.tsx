import { Rect, Shader, Skia, vec } from "@shopify/react-native-skia";
import React from "react";
import {
  Easing,
  SharedValue,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";

// Liquid Parameters
export const LIQUID_SPEED = 1000;
export const LIQUID_EASING = Easing.bezier(0.68, -0.1, 0.32, 1.2);

// Convert hex color to RGB array [0-1]
export function hexToRgb(hex: string): number[] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : [0, 0, 0];
}

export interface MetaBallShaderProps {
  sharedXs: SharedValue<number>[];
  sharedYs: SharedValue<number>[];
  sharedRadius: SharedValue<number>[];
  bodyCount: SharedValue<number>;
  metaballColor: number[];
  backgroundColor: number[];
  width: number;
  height: number;
  stickyStrength: SharedValue<number>;
  maxBodies: number;
}

export default function MetaBallShader({
  sharedXs,
  sharedYs,
  sharedRadius,
  bodyCount,
  metaballColor,
  backgroundColor,
  width,
  height,
  stickyStrength = useSharedValue(0.32),
  maxBodies = 32,
}: MetaBallShaderProps) {
  // const { width, height } = useGetScreenDimentions();
  const CANVAS_WIDTH = width;
  const CANVAS_HEIGHT = height;

  // Dynamic circles

  const shader = Skia.RuntimeEffect.Make(`
     // Variables from the real world
     uniform vec2 u_aspectRatio;
     uniform vec4 u_circles[${maxBodies}]; // (cx, cy, radius, extra)
     uniform int u_circle_count;
     uniform vec3 u_metaballColor;  // RGB color for metaball
     uniform vec3 u_backgroundColor; // RGBA color for background

     // AI
     uniform float u_blendK;       // sticky strength
     uniform float u_threshold;    // cut-off for fill


     // Important functions
     float sdCircle(vec2 uv, float radius, vec2 offset){
       return length(uv - offset) - radius;
     }

     // Is the function that blends surfaces
     float smin(float a, float b, float k) {
      float h = max(k - abs(a-b), 0.0) / k;
      return min(a, b) - h * h * k * 0.25;
     }

  vec4 drawScene(vec2 uv){
    // Backround vector
    vec4 col = vec4(1.);
 
   float field = 1e6;

   for (int i = 0; i < ${maxBodies}; ++i) {
    if (i >= u_circle_count) break;
    vec4 circle = u_circles[i];
    vec2 center = circle.xy / u_aspectRatio;
    center -= 0.5;
    center.x *= u_aspectRatio.x / u_aspectRatio.y;
    float radius = circle.z / u_aspectRatio.y;
    float dist = sdCircle(uv, radius, center);
    field = (i == 0) ? dist : smin(field, dist, u_blendK);
  }

   // Setup 
   col = field < -u_threshold ? vec4(u_metaballColor, 1.0) : vec4(u_backgroundColor, 0.0);
   
   return col;
 }

 
      vec4 main(vec2 pos) {
        // Normalize Dimensions so they are standard across all screens and
        // pixel densities
        vec2 uv = pos / u_aspectRatio;
        uv -= 0.5;
        uv.x *= u_aspectRatio.x/u_aspectRatio.y;

        // Finish Drawing
        return drawScene(uv);}
  `)!;

  const uniforms = useDerivedValue(() => {
    // 1. Create buffer: 32 circles × 4 floats (x, y, radius, extra)
    const circleBuffer = new Float32Array(maxBodies * 4);

    // 2. Get active count from bodyCount SharedValue
    const count = Math.min(bodyCount.value, maxBodies);

    // 3. Fill buffer with circle data from SharedValue arrays
    for (let i = 0; i < count; i++) {
      const baseIndex = i * 4;
      circleBuffer[baseIndex + 0] = sharedXs[i].value; // x position
      circleBuffer[baseIndex + 1] = sharedYs[i].value; // y position
      circleBuffer[baseIndex + 2] = sharedRadius[i].value; // radius
      circleBuffer[baseIndex + 3] = 0; // extra (unused for now)
    }

    // 4. Zero out unused slots (safety)
    for (let i = count; i < maxBodies; i++) {
      const baseIndex = i * 4;
      circleBuffer[baseIndex + 0] = 0;
      circleBuffer[baseIndex + 1] = 0;
      circleBuffer[baseIndex + 2] = 0;
      circleBuffer[baseIndex + 3] = 0;
    }

    // 5. Return uniforms
    return {
      u_aspectRatio: vec(CANVAS_WIDTH, CANVAS_HEIGHT),
      u_circles: Array.from(circleBuffer),
      u_circle_count: count,
      u_blendK: stickyStrength.value, // sticky strength
      u_threshold: 0.001, // edge threshold
      u_metaballColor: metaballColor,
      u_backgroundColor: backgroundColor,
    };
  });

  return (
    <Rect x={0} y={0} height={height} width={width} color="violet">
      <Shader source={shader} uniforms={uniforms} />
    </Rect>
  );
}
