import { Skia } from "@shopify/react-native-skia";

export const BShader = Skia.RuntimeEffect.Make(`
    // ============================================================
    // UNIFORMS — values passed in from React Native
    // ============================================================
    uniform float2 u_resolution;  // canvas size in pixels (width, height)
    uniform float2 u_center;      // circle center in pixels (x, y)
    uniform float u_radius;       // circle radius in pixels
    uniform float3 u_color;       // circle fill color (RGB, 0-1 range)

    half4 main(float2 fragCoord) {
        // ============================================================
        // DISTANCE CHECK — is this pixel inside the circle?
        // ============================================================

        // Vector from the circle center to the current pixel
        float2 diff = fragCoord - u_center;

        // Euclidean distance from the current pixel to the circle center
        float dist = length(diff);

        // ============================================================
        // EDGE SMOOTHING — anti-alias the circle border
        // ============================================================

        // smoothstep returns 1.0 inside the circle, fading to 0.0
        // over a 1-pixel band at the edge for smooth anti-aliasing
        float alpha = smoothstep(u_radius + 1.0, u_radius - 1.0, dist);

        // ============================================================
        // OUTPUT — premultiplied alpha color
        // ============================================================

        // Return the circle color with the computed alpha
        // Pixels outside the circle get alpha 0 (transparent)
        return half4(u_color * alpha, alpha);
    }
`)!;
