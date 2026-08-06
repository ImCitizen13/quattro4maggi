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
    uniform half3 u_shadowColor;   // shadow color (dark on light bg, light on dark bg)
    uniform float u_shadowOpacity; // shadow strength (0-1)
    uniform float u_shadowSpread;  // shadow spread as fraction of radius (e.g. 0.3)

    uniform float u_transparentBg; // 0 = fill outside with u_bgColor (opaque), 1 = transparent (keep source alpha)
    uniform half3 u_bubbleColor;   // glass tint color inside the bubble (RGB 0-1)
    uniform float u_bubbleOpacity; // glass tint strength (0 = clear refraction, 1 = solid color)

    uniform float u_shape;         // bubble shape: 0 = circle, 1 = rounded rect
    uniform float2 u_halfSize;     // rounded-rect half extents in px (used when u_shape = 1)
    uniform float u_cornerRadius;  // rounded-rect corner radius in px (used when u_shape = 1)

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

    // ============================================================
    // HELPER — rounded-box SDF + its outward normal (for u_shape = 1)
    // ============================================================
    // Signed distance to a rounded rectangle centered at the origin.
    // p: point relative to center, b: half-size, r: corner radius (px).
    // Negative inside, 0 on the outline, positive outside.
    float sdRoundedBox(float2 p, float2 b, float r) {
        float2 q = abs(p) - b + r;
        return min(max(q.x, q.y), 0.0) + length(max(q, float2(0.0))) - r;
    }

    // Outward unit normal of the rounded box, via central differences of the
    // SDF (robust across the flat edges and rounded corners alike).
    float2 sdRoundedBoxNormal(float2 p, float2 b, float r) {
        float e = 1.0;
        float dx = sdRoundedBox(p + float2(e, 0.0), b, r)
                 - sdRoundedBox(p - float2(e, 0.0), b, r);
        float dy = sdRoundedBox(p + float2(0.0, e), b, r)
                 - sdRoundedBox(p - float2(0.0, e), b, r);
        float2 g = float2(dx, dy);
        float l = length(g);
        return (l > 0.0001) ? g / l : float2(0.0);
    }

    // ============================================================
    // HELPER — bilinear sampling (image.eval uses nearest-neighbor)
    // ============================================================
    half4 sampleSmooth(float2 coord) {
        float2 adj = coord - 0.5;
        float2 fl  = floor(adj) + 0.5;
        float2 f   = adj - floor(adj);

        half4 tl = image.eval(clampCoord(fl));
        half4 tr = image.eval(clampCoord(fl + float2(1.0, 0.0)));
        half4 bl = image.eval(clampCoord(fl + float2(0.0, 1.0)));
        half4 br = image.eval(clampCoord(fl + float2(1.0, 1.0)));

        half4 top = mix(tl, tr, half(f.x));
        half4 bot = mix(bl, br, half(f.x));
        return mix(top, bot, half(f.y));
    }

    half4 main(float2 fragCoord) {
        // ============================================================
        // DISTANCE FROM BUBBLE CENTER
        // ============================================================

        // Unified bubble field so the circle and rounded-rect paths share the
        // downstream refraction / edge / shadow math:
        //   sd           signed distance to the boundary (px, < 0 inside)
        //   nrm          outward unit normal at this point
        //   norm         normalized center → edge factor in [0, 1]
        //   refractScale characteristic size (px) that scales refraction/chroma
        float2 diff = fragCoord - u_center;
        float sd;
        float2 nrm;
        float norm;
        float refractScale;
        if (u_shape < 0.5) {
            // Circle (original behavior, math-identical).
            float dist = length(diff);
            sd = dist - u_radius;
            norm = dist / u_radius;
            nrm = (dist > 0.001) ? diff / dist : float2(0.0);
            refractScale = u_radius;
        } else {
            // Rounded rectangle — inherits the pill shape with padding.
            refractScale = min(u_halfSize.x, u_halfSize.y);
            sd = sdRoundedBox(diff, u_halfSize, u_cornerRadius);
            norm = clamp(1.0 + sd / max(refractScale, 0.001), 0.0, 1.0);
            nrm = sdRoundedBoxNormal(diff, u_halfSize, u_cornerRadius);
        }

        // ============================================================
        // OUTSIDE THE BUBBLE — pass through the source content unchanged
        // ============================================================

        // Anti-aliased edge: 1 inside, 0 outside, smooth over ~1.5px
        float mask = smoothstep(1.5, -1.5, sd);

        half4 src = sampleSmooth(fragCoord);
        // Use u_bgColor as base background, blend with any source content on top
        half3 bg = mix(half3(u_bgColor), src.rgb, src.a);

        // ============================================================
        // SHADOW — soft halo around the bubble
        // ============================================================
        // sd is 0 on the boundary and grows outward; the halo fades over a band
        // of u_shadowSpread × refractScale px just outside the shape.
        float shadowAlpha = smoothstep(refractScale * u_shadowSpread, 0.0, sd) * u_shadowOpacity;
        half3 shadowed = mix(bg, half3(u_shadowColor), shadowAlpha);

        if (mask <= 0.0) {
            if (u_transparentBg < 0.5) {
                // Opaque mode (wabi): fill with bg + shadow, fully opaque
                return half4(shadowed, 1.0);
            }
            // Transparent mode: keep source coverage, shadow sits behind it.
            // Premultiplied output so canvas corners stay clear.
            float aOut = src.a + shadowAlpha * (1.0 - src.a);
            half3 cOut = src.rgb * src.a
                       + half3(u_shadowColor) * (shadowAlpha * (1.0 - src.a));
            return half4(cOut, aOut);
        }

        // ============================================================
        // BARREL DISTORTION — magnify/refract inside the bubble
        // ============================================================

        float t = norm * norm;
        float distortionAmount = u_refraction * t;
        float2 distortedCoord = clampCoord(fragCoord - nrm * distortionAmount * refractScale);

        half4 distortedSrc = sampleSmooth(distortedCoord);

        // ============================================================
        // PRISMATIC EDGE — chromatic aberration at the rim
        // ============================================================

        float edgeStart = 1.0 - u_edgeWidth;
        float edgeFactor = smoothstep(edgeStart, 1.0, norm);

        float chromaOffset = u_dispersion * edgeFactor * refractScale;

        float2 coordR = clampCoord(distortedCoord + nrm * chromaOffset);
        float2 coordB = clampCoord(distortedCoord - nrm * chromaOffset);

        half3 chromaSrc = half3(
            sampleSmooth(coordR).r,
            distortedSrc.g,
            sampleSmooth(coordB).b
        );

        // Interior color. In opaque mode we composite over u_bgColor (keeps the
        // wabi look); in transparent mode we keep the raw refracted colors and
        // carry alpha separately at the end.
        half3 interior;
        if (u_transparentBg < 0.5) {
            half3 distortedBg = mix(half3(u_bgColor), distortedSrc.rgb, distortedSrc.a);
            half3 chromaBg = mix(half3(u_bgColor), chromaSrc, distortedSrc.a);
            interior = mix(distortedBg, chromaBg, edgeFactor);
        } else {
            interior = mix(distortedSrc.rgb, chromaSrc, edgeFactor);
        }

        // Glass tint — colors the bubble. No-op when u_bubbleOpacity == 0.
        interior = mix(interior, half3(u_bubbleColor), u_bubbleOpacity);

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
        float specDot = max(dot(nrm, lightDir), 0.0);
        // Sharp bright glint + softer broad glow
        float specular = (pow(specDot, 32.0) * 0.6 + pow(specDot, 8.0) * 0.15) * u_specular;

        // Rainbow edge: blend into interior + additive glow
        half3 withRainbow = mix(interior, rainbow, edgeFactor * 0.15)
                          + rainbow * edgeFactor * 0.05;
        half3 color = withRainbow + half3(specular);

        // ============================================================
        // COMPOSITE — blend source content with bubble effects
        // ============================================================

        if (u_transparentBg < 0.5) {
            // Opaque mode (wabi): blend over the shadowed background, alpha 1
            half3 finalColor = mix(shadowed, color, mask);
            return half4(finalColor, 1.0);
        }

        // Transparent mode: carry alpha so the bubble sits on a clear canvas.
        float aOut = src.a + shadowAlpha * (1.0 - src.a);
        half3 cOut = src.rgb * src.a
                   + half3(u_shadowColor) * (shadowAlpha * (1.0 - src.a));
        float aIn = distortedSrc.a;
        float aFinal = mix(aOut, aIn, mask);
        half3 cFinal = mix(cOut, color * aIn, mask); // premultiplied
        return half4(cFinal, aFinal);
    }
`)!;

// Default rainbow colors (classic spectrum)
export const DEFAULT_PRISM_COLORS = {
  u_prismColor0: [1, 0, 0],       // Red      (0°)
  u_prismColor1: [1, 1, 0],       // Yellow   (60°)
  u_prismColor2: [0, 1, 0],       // Green    (120°)
  u_prismColor3: [0, 1, 1],       // Cyan     (180°)
  u_prismColor4: [0, 0, 1],       // Blue     (240°)
  u_prismColor5: [1, 0, 1],       // Magenta  (300°)
} as const;
// Grayscale prism — same 6 faceted stops around the rim, but desaturated so
// the edge reads as a silver/chrome bevel instead of a rainbow. Values alternate
// light/dark around the circle to keep some faceted variation.
// NOTE: u_dispersion still splits the R/B channels and adds color fringing on
// its own — drop u_dispersion toward 0 for a truly colorless rim.
export const gray_PRISM_COLORS = {
  u_prismColor0: [0.75, 0.75, 0.75], //   0° light gray
  u_prismColor1: [0.95, 0.95, 0.95], //  60° near white
  u_prismColor2: [0.55, 0.55, 0.55], // 120° mid gray
  u_prismColor3: [0.85, 0.85, 0.85], // 180° light gray
  u_prismColor4: [0.45, 0.45, 0.45], // 240° dark gray
  u_prismColor5: [0.70, 0.70, 0.70], // 300° gray
} as const;
