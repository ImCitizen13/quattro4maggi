/**
 * Path Mask Shader (SkSL)
 *
 * A glass/refraction shader that works with arbitrary SVG paths by using
 * alpha-based edge detection instead of circular distance.
 *
 * The path is rendered as white on transparent, and the shader samples
 * the mask alpha to detect edges and apply effects.
 *
 * UNIFORMS:
 * - image: shader - The mask (white path on transparent background)
 * - u_resolution: float2 - Canvas resolution (width, height)
 * - u_edgeWidth: float - Prismatic edge band width in pixels
 * - u_dispersion: float - Chromatic aberration strength (0-0.1)
 * - u_refraction: float - Barrel distortion strength (0-0.3)
 * - u_specular: float - Specular highlight intensity (0-1)
 * - u_bgColor: half3 - Background color (RGB 0-1)
 * - u_prismColor0-5: half3 - Six rainbow color stops (RGB 0-1)
 */

export const pathMaskShaderSource = `
uniform shader image;
uniform float2 u_resolution;
uniform float u_edgeWidth;
uniform float u_dispersion;
uniform float u_refraction;
uniform float u_specular;
uniform half3 u_bgColor;
uniform half3 u_prismColor0;
uniform half3 u_prismColor1;
uniform half3 u_prismColor2;
uniform half3 u_prismColor3;
uniform half3 u_prismColor4;
uniform half3 u_prismColor5;

// ============================================================================
// EDGE DETECTION
// ============================================================================

// Compute edge factor from mask alpha gradient
float getEdgeFactor(float2 fragCoord) {
    float mask = image.eval(fragCoord).a;

    // Sample neighboring pixels for gradient
    float maskL = image.eval(fragCoord + float2(-1.0, 0.0)).a;
    float maskR = image.eval(fragCoord + float2(1.0, 0.0)).a;
    float maskU = image.eval(fragCoord + float2(0.0, -1.0)).a;
    float maskD = image.eval(fragCoord + float2(0.0, 1.0)).a;

    // Sobel-like gradient magnitude
    float gradX = maskR - maskL;
    float gradY = maskD - maskU;
    float edge = sqrt(gradX * gradX + gradY * gradY);

    return edge;
}

// Compute edge normal direction
float2 getEdgeNormal(float2 fragCoord) {
    float maskL = image.eval(fragCoord + float2(-1.0, 0.0)).a;
    float maskR = image.eval(fragCoord + float2(1.0, 0.0)).a;
    float maskU = image.eval(fragCoord + float2(0.0, -1.0)).a;
    float maskD = image.eval(fragCoord + float2(0.0, 1.0)).a;

    float2 grad = float2(maskR - maskL, maskD - maskU);
    float len = length(grad);
    return len > 0.001 ? grad / len : float2(0.0);
}

// ============================================================================
// DISTANCE FROM EDGE (approximate)
// ============================================================================

float getDistanceFromEdge(float2 fragCoord) {
    float mask = image.eval(fragCoord).a;

    // Sample in multiple directions to estimate distance
    float minDist = 1000.0;
    for (int i = 0; i < 16; i++) {
        float angle = float(i) * 6.28318 / 16.0;
        float2 dir = float2(cos(angle), sin(angle));

        for (float d = 1.0; d <= u_edgeWidth * 2.0; d += 1.0) {
            float2 samplePos = fragCoord + dir * d;
            float sampleMask = image.eval(samplePos).a;

            // If we cross the edge
            if ((mask > 0.5 && sampleMask < 0.5) || (mask < 0.5 && sampleMask > 0.5)) {
                minDist = min(minDist, d);
                break;
            }
        }
    }

    return minDist;
}

// ============================================================================
// PRISMATIC COLOR
// ============================================================================

half3 getPrismColor(float2 fragCoord) {
    float2 center = u_resolution * 0.5;
    float2 diff = fragCoord - center;
    float angle = atan(diff.y, diff.x);
    float hue = fract(angle / 6.28318 + 0.5);
    float segment = hue * 6.0;
    float idx = floor(segment);
    float f = segment - idx;

    half3 rainbow;
    if (idx < 1.0)      rainbow = mix(u_prismColor0, u_prismColor1, half(f));
    else if (idx < 2.0) rainbow = mix(u_prismColor1, u_prismColor2, half(f));
    else if (idx < 3.0) rainbow = mix(u_prismColor2, u_prismColor3, half(f));
    else if (idx < 4.0) rainbow = mix(u_prismColor3, u_prismColor4, half(f));
    else if (idx < 5.0) rainbow = mix(u_prismColor4, u_prismColor5, half(f));
    else                rainbow = mix(u_prismColor5, u_prismColor0, half(f));

    return rainbow;
}

// ============================================================================
// MAIN
// ============================================================================

half4 main(float2 fragCoord) {
    float mask = image.eval(fragCoord).a;

    // Outside the shape
    if (mask < 0.01) {
        return half4(u_bgColor, 1.0);
    }

    // Get edge info
    float edge = getEdgeFactor(fragCoord);
    float2 normal = getEdgeNormal(fragCoord);
    float distFromEdge = getDistanceFromEdge(fragCoord);
    float edgeFactor = smoothstep(u_edgeWidth, 0.0, distFromEdge);

    // Base glass color (slightly tinted)
    half3 glassColor = half3(0.95, 0.97, 1.0);

    // Apply refraction offset for chromatic aberration
    float chromaOffset = u_dispersion * edgeFactor * u_edgeWidth;
    float2 offsetR = normal * chromaOffset;
    float2 offsetB = normal * -chromaOffset;

    float maskR = image.eval(fragCoord + offsetR).a;
    float maskB = image.eval(fragCoord + offsetB).a;

    // Chromatic aberration on the glass
    half3 chromaColor = half3(
        glassColor.r * half(maskR),
        glassColor.g * half(mask),
        glassColor.b * half(maskB)
    );

    // Prismatic edge coloring
    half3 prism = getPrismColor(fragCoord);
    half3 colorWithPrism = mix(chromaColor, prism, half(edgeFactor * 0.4));

    // Specular highlight (top-left light source)
    float2 lightDir = normalize(float2(-0.4, -0.6));
    float specDot = max(dot(normal, lightDir), 0.0);
    float specular = (pow(specDot, 32.0) * 0.6 + pow(specDot, 8.0) * 0.15) * u_specular;

    // Inner glow/reflection
    float innerGlow = smoothstep(0.0, u_edgeWidth * 3.0, distFromEdge) * 0.1;

    // Combine
    half3 finalColor = colorWithPrism + half3(specular) + half3(innerGlow);

    // Soft edge anti-aliasing
    float alpha = smoothstep(0.0, 0.02, mask);

    // Blend with background
    half3 blended = mix(u_bgColor, finalColor, half(alpha));

    return half4(blended, 1.0);
}
`;

// Default prismatic colors (classic rainbow)
export const DEFAULT_PRISM_COLORS = {
  u_prismColor0: [1, 0.3, 0.3] as const,   // Red
  u_prismColor1: [1, 0.8, 0.2] as const,   // Yellow
  u_prismColor2: [0.3, 1, 0.4] as const,   // Green
  u_prismColor3: [0.3, 0.9, 1] as const,   // Cyan
  u_prismColor4: [0.4, 0.4, 1] as const,   // Blue
  u_prismColor5: [1, 0.4, 0.8] as const,   // Magenta
};
