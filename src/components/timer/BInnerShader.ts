import { Skia } from "@shopify/react-native-skia";

// Inner bubble shader — identical to BShader, applied at 80% radius inside the outer bubble
export const BInnerShader = Skia.RuntimeEffect.Make(`
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
    uniform half3 u_shadowColor;   // shadow color
    uniform float u_shadowOpacity; // shadow strength (0-1)
    uniform float u_shadowSpread;  // shadow spread as fraction of radius

    // 6 rainbow color stops around the bubble edge (RGB 0-1)
    uniform half3 u_prismColor0;   // 0°   (right)
    uniform half3 u_prismColor1;   // 60°
    uniform half3 u_prismColor2;   // 120°
    uniform half3 u_prismColor3;   // 180° (left)
    uniform half3 u_prismColor4;   // 240°
    uniform half3 u_prismColor5;   // 300°

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
        // Use u_bgColor as base background, blend with any source content on top
        half3 bg = mix(half3(u_bgColor), src.rgb, src.a);

        // ============================================================
        // SHADOW — soft halo around the bubble
        // ============================================================
        float shadowEdge = u_radius + u_radius * u_shadowSpread;
        float shadowAlpha = smoothstep(shadowEdge, u_radius, dist) * u_shadowOpacity;
        half3 shadowed = mix(bg, half3(u_shadowColor), shadowAlpha);

        if (mask <= 0.0) {
            return half4(shadowed, 1.0);
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

        // Composite distorted content over bgColor (source may be transparent)
        half3 distortedBg = mix(half3(u_bgColor), distortedSrc.rgb, distortedSrc.a);
        half3 chromaBg = mix(half3(u_bgColor), chromaSrc, distortedSrc.a);
        half3 interior = mix(distortedBg, chromaBg, edgeFactor);

        // ============================================================
        // PRISMATIC TINT — configurable rainbow colors around the edge
        // ============================================================

        float angle = atan(diff.y, diff.x);
        float hue = fract(angle / 6.28318 + 0.5);  // 0 to 1 around the circle
        float segment = hue * 6.0;
        float idx = floor(segment);
        float f = segment - idx;

        // Interpolate between adjacent color stops
        half3 rainbow;
        if (idx < 1.0)      rainbow = mix(u_prismColor0, u_prismColor1, half(f));
        else if (idx < 2.0) rainbow = mix(u_prismColor1, u_prismColor2, half(f));
        else if (idx < 3.0) rainbow = mix(u_prismColor2, u_prismColor3, half(f));
        else if (idx < 4.0) rainbow = mix(u_prismColor3, u_prismColor4, half(f));
        else if (idx < 5.0) rainbow = mix(u_prismColor4, u_prismColor5, half(f));
        else                rainbow = mix(u_prismColor5, u_prismColor0, half(f));

        // ============================================================
        // SPECULAR HIGHLIGHT — white glint on the bubble
        // ============================================================

        float2 lightDir = float2(-0.4, -0.6);
        float specDot = max(dot(normalize(diff / u_radius), lightDir), 0.0);
        // Sharp bright glint + softer broad glow
        float specular = (pow(specDot, 32.0) * 0.6 + pow(specDot, 8.0) * 0.15) * u_specular;

        // Rainbow edge: blend into interior + additive glow
        half3 withRainbow = mix(interior, rainbow, edgeFactor * 0.15)
                          + rainbow * edgeFactor * 0.05;
        half3 color = withRainbow + half3(specular);

        // ============================================================
        // COMPOSITE — blend source content with bubble effects
        // ============================================================

        half3 finalColor = mix(shadowed, color, mask);

        return half4(finalColor, 1.0);
    }
`)!;
