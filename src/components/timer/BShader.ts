import { Skia } from "@shopify/react-native-skia";

export const BShader = Skia.RuntimeEffect.Make(`
    // ============================================================
    // UNIFORMS — values passed in from React Native
    // ============================================================
    uniform shader image;          // background content to sample through the bubble
    uniform float2 u_resolution;   // canvas size in pixels (width, height)
    uniform float2 u_center;       // bubble center in pixels (x, y)
    uniform float u_radius;        // bubble radius in pixels
    uniform float u_refraction;    // lens distortion strength (e.g. 0.15)
    uniform float u_edgeWidth;     // prismatic edge band width as fraction of radius (e.g. 0.15)
    uniform float u_dispersion;    // chromatic aberration strength at edge (e.g. 0.03)

    half4 main(float2 fragCoord) {
        // ============================================================
        // DISTANCE FROM BUBBLE CENTER
        // ============================================================

        // Vector from bubble center to the current pixel
        float2 diff = fragCoord - u_center;

        // Distance from center
        float dist = length(diff);

        // Normalized distance: 0 at center, 1 at edge
        float normDist = dist / u_radius;

        // ============================================================
        // OUTSIDE THE BUBBLE — passthrough
        // ============================================================

        // Anti-aliased edge: 1 inside, 0 outside, smooth over 1.5px
        float mask = smoothstep(u_radius + 1.5, u_radius - 1.5, dist);

        if (mask <= 0.0) {
            // Fully outside — return the background as-is
            return image.eval(fragCoord);
        }

        // ============================================================
        // BARREL DISTORTION — magnify/refract inside the bubble
        // ============================================================

        // Radial direction from center (unit vector)
        float2 dir = (dist > 0.001) ? diff / dist : float2(0.0);

        // Barrel distortion: push UVs inward for a magnification/lens effect
        // Stronger toward the edges (normDist^2 gives a natural lens curve)
        float distortionAmount = u_refraction * normDist * normDist;
        float2 distortedCoord = fragCoord - dir * distortionAmount * u_radius;

        // ============================================================
        // PRISMATIC EDGE — chromatic aberration at the rim
        // ============================================================

        // Edge band: how close we are to the rim (0 = deep inside, 1 = at edge)
        float edgeStart = 1.0 - u_edgeWidth;
        float edgeFactor = smoothstep(edgeStart, 1.0, normDist);

        // Chromatic offset: separate R/G/B channels along the radial direction
        // Stronger at the edge, zero at center
        float chromaOffset = u_dispersion * edgeFactor * u_radius;

        // Sample each channel at a slightly different position
        float2 coordR = distortedCoord + dir * chromaOffset;
        float2 coordG = distortedCoord;
        float2 coordB = distortedCoord - dir * chromaOffset;

        half3 refracted = half3(
            image.eval(coordR).r,
            image.eval(coordG).g,
            image.eval(coordB).b
        );

        // ============================================================
        // PRISMATIC TINT — rainbow color at the edge
        // ============================================================

        // Create a subtle rainbow based on angle around the bubble
        float angle = atan(diff.y, diff.x);

        // Map angle to hue (simplified HSV → RGB)
        float hue = angle / 6.28318 + 0.5;  // normalize to [0..1]
        half3 rainbow = half3(
            abs(hue * 6.0 - 3.0) - 1.0,
            2.0 - abs(hue * 6.0 - 2.0),
            2.0 - abs(hue * 6.0 - 4.0)
        );
        rainbow = clamp(rainbow, half3(0.0), half3(1.0));

        // Apply rainbow tint only at the edge, with low intensity
        half3 prismTint = rainbow * edgeFactor * 0.3;

        // ============================================================
        // SPECULAR HIGHLIGHT — subtle light reflection on the bubble
        // ============================================================

        // Fresnel-like effect: brighter at edges (like a real glass sphere)
        float fresnel = pow(normDist, 3.0) * 0.15;

        // Small specular glint near the top-left (simulating a light source)
        float2 lightDir = float2(-0.4, -0.6);
        float specDot = max(dot(normalize(diff / u_radius), lightDir), 0.0);
        float specular = pow(specDot, 16.0) * 0.3;

        // ============================================================
        // COMPOSITE — blend everything together
        // ============================================================

        half3 color = refracted + prismTint + fresnel + specular;

        // Apply anti-aliased mask
        return half4(color * mask, mask);
    }
`)!;
