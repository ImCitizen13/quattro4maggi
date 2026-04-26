import { Skia } from "@shopify/react-native-skia";

// Dot grid background shader
// Draws evenly spaced anti-aliased dots, themed via uColor uniform
export const BGSHADER = Skia.RuntimeEffect.Make(`
    uniform float2 uResolution;
    uniform float  uSpacing;   // distance between dots in pixels (e.g. 20)
    uniform float  uRadius;    // dot radius in pixels (e.g. 1.0)
    uniform float4 uColor;     // dot color + alpha

    half4 main(float2 pos) {
      // Determine which row we're in
      float row = floor(pos.y / uSpacing);
      // Odd rows get shifted by half the spacing (staggered / brick pattern)
      float xOffset = mod(row, 2.0) * uSpacing * 0.5;

      // Snap to nearest grid point with row offset applied
      float2 adjusted = float2(pos.x - xOffset, pos.y);
      float2 cell = adjusted / uSpacing;
      float2 nearest = (floor(cell) + 0.5) * uSpacing;
      nearest.x += xOffset;

      // Distance from pixel to nearest dot center
      float dist = length(pos - nearest);

      // Anti-aliased dot: solid inside radius, smooth falloff at edge
      float aa = 0.5;  // anti-alias width in pixels
      float alpha = 1.0 - smoothstep(uRadius - aa, uRadius + aa, dist);

      return half4(uColor.rgb, uColor.a * alpha);
    }
`)!;
