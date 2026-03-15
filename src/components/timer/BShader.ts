import { Skia } from "@shopify/react-native-skia";

export const BShader = Skia.RuntimeEffect.Make(`
    // ============================================================
    // UNIFORMS — values passed in from React Native
    // ============================================================
    uniform shader image;          // source content (used by RuntimeShader)
    uniform float2 u_resolution;   // canvas size in pixels (width, height)
    uniform float2 u_center;       // bubble center in pixels (x, y)
    uniform float u_radius;        // bubble radius in pixels
    uniform float u_refraction;    // lens distortion strength (e.g. 0.15)
    uniform float u_edgeWidth;     // prismatic edge band width as fraction of radius (e.g. 0.15)
    uniform float u_dispersion;    // chromatic aberration strength at edge (e.g. 0.03)
    uniform half3 u_bgColor;       // background color (RGB 0-1)
    uniform float u_specular;      // specular intensity (0-1)

    // ============================================================
    // HELPER — clamp coordinates to canvas bounds
    // ============================================================
    float2 clampCoord(float2 coord) {
        return clamp(coord, float2(0.0), u_resolution);
    }

    half4 main(float2 fragCoord) {
        // ============================================================
        // DISTANCE FROM BUBBLE CENTER
        // ============================================================

        float2 diff = fragCoord - u_center;
        float dist = length(diff);
        float normDist = dist / u_radius;

        // ============================================================
        // OUTSIDE THE BUBBLE — pass through the source content unchanged
        // ============================================================

        // Anti-aliased edge: 1 inside, 0 outside, smooth over 1.5px
        float mask = smoothstep(u_radius + 1.5, u_radius - 1.5, dist);

        half4 src = image.eval(fragCoord);

        if (mask <= 0.0) {
            return src;
        }

        // ============================================================
        // BARREL DISTORTION — magnify/refract inside the bubble
        // ============================================================

        float2 dir = (dist > 0.001) ? diff / dist : float2(0.0);

        float t = normDist * normDist;
        float distortionAmount = u_refraction * t;
        float2 distortedCoord = clampCoord(fragCoord - dir * distortionAmount * u_radius);

        half4 distortedSrc = image.eval(distortedCoord);

        // ============================================================
        // PRISMATIC EDGE — chromatic aberration at the rim
        // ============================================================

        float edgeStart = 1.0 - u_edgeWidth;
        float edgeFactor = smoothstep(edgeStart, 1.0, normDist);

        float chromaOffset = u_dispersion * edgeFactor * u_radius;

        float2 coordR = clampCoord(distortedCoord + dir * chromaOffset);
        float2 coordB = clampCoord(distortedCoord - dir * chromaOffset);

        half3 chromaSrc = half3(
            image.eval(coordR).r,
            distortedSrc.g,
            image.eval(coordB).b
        );

        half3 interior = mix(distortedSrc.rgb, chromaSrc, edgeFactor);

        // ============================================================
        // PRISMATIC TINT — rainbow ring at the edge (additive, not blended)
        // ============================================================

        float angle = atan(diff.y, diff.x);
        float hue = angle / 6.28318 + 0.5;
        half3 rainbow = half3(
            abs(hue * 6.0 - 3.0) - 1.0,
            2.0 - abs(hue * 6.0 - 2.0),
            2.0 - abs(hue * 6.0 - 4.0)
        );
        rainbow = clamp(rainbow, half3(0.0), half3(1.0));

        // ============================================================
        // SPECULAR HIGHLIGHT — white glint on the bubble
        // ============================================================

        float2 lightDir = float2(-0.4, -0.6);
        float specDot = max(dot(normalize(diff / u_radius), lightDir), 0.0);
        // Sharp bright glint + softer broad glow
        float specular = (pow(specDot, 32.0) * 0.6 + pow(specDot, 8.0) * 0.15) * u_specular;

        half3 color = interior + half3(specular);

        // ============================================================
        // COMPOSITE — blend source content with bubble effects
        // ============================================================

        half3 finalColor = mix(src.rgb, color, mask);
        float finalAlpha = max(src.a, mask);

        return half4(finalColor, finalAlpha);
    }
`)!;
