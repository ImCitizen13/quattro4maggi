import { Skia } from "@shopify/react-native-skia";

export const BRingShader = Skia.RuntimeEffect.Make(`
    // ============================================================
    // UNIFORMS
    // ============================================================
    uniform shader image;          // source content (from parent layer)
    uniform float2 u_resolution;   // canvas size in pixels
    uniform float2 u_center;       // bubble center in pixels
    uniform float u_radius;        // bubble radius in pixels
    uniform float u_refraction;    // bubble refraction strength (ring uses opposite)
    uniform float u_ringWidth;     // ring width as fraction of radius (e.g. 0.2)
    uniform float u_dispersion;    // chromatic aberration strength
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

        half4 src = image.eval(fragCoord);

        // ============================================================
        // RING ZONE — inner ring from (1.0 - ringWidth) to (1.0)
        // The ring sits inside the bubble's edge
        // ============================================================

        float ringInner = 1.0 - u_ringWidth;      // starts inward
        float ringOuter = 1.0;                     // ends at bubble edge
        float ringNormDist = (normDist - ringInner) / u_ringWidth;  // 0 at inner, 1 at outer edge

        // Anti-aliased ring mask: 1 inside ring, 0 outside
        float ringMask = smoothstep(u_radius * ringInner - 1.5, u_radius * ringInner + 1.5, dist)
                       * smoothstep(u_radius * ringOuter + 1.5, u_radius * ringOuter - 1.5, dist);

        if (ringMask <= 0.0) {
            return src;
        }

        // ============================================================
        // OPPOSITE REFRACTION — pincushion distortion (pushes outward)
        // Bubble uses barrel (inward), ring uses the opposite
        // ============================================================

        float2 dir = (dist > 0.001) ? diff / dist : float2(0.0);

        // Opposite refraction: positive direction (pushes UVs outward)
        // Strongest at outer edge (bubble rim), fades inward
        float ringFalloff = ringNormDist;  // 0 at inner edge, 1 at bubble rim
        float t = ringFalloff * ringFalloff;
        float distortionAmount = u_refraction * t;
        // Note the + instead of - : opposite direction from bubble's barrel distortion
        float2 distortedCoord = clampCoord(fragCoord + dir * distortionAmount * u_radius * 0.5);

        half4 distortedSrc = image.eval(distortedCoord);

        // ============================================================
        // CHROMATIC ABERRATION — prismatic split in the ring
        // ============================================================

        float chromaOffset = u_dispersion * ringFalloff * u_radius;

        float2 coordR = clampCoord(distortedCoord + dir * chromaOffset);
        float2 coordB = clampCoord(distortedCoord - dir * chromaOffset);

        half3 chromaSrc = half3(
            image.eval(coordR).r,
            distortedSrc.g,
            image.eval(coordB).b
        );

        half3 interior = mix(distortedSrc.rgb, chromaSrc, ringFalloff * 0.6);

        // ============================================================
        // SPECULAR HIGHLIGHT — glint on the ring
        // ============================================================

        float2 lightDir = float2(-0.4, -0.6);
        float specDot = max(dot(normalize(diff / u_radius), lightDir), 0.0);
        float specular = (pow(specDot, 32.0) * 0.4 + pow(specDot, 8.0) * 0.1) * u_specular * ringFalloff;

        half3 color = interior + half3(specular);

        // ============================================================
        // COMPOSITE — blend ring effect with source
        // ============================================================

        half3 finalColor = mix(src.rgb, color, ringMask);
        float finalAlpha = max(src.a, ringMask);

        return half4(finalColor, finalAlpha);
    }
`)!;
