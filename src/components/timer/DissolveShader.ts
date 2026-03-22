import { Skia } from "@shopify/react-native-skia";

// Noise-driven dissolve shader with prismatic rainbow edge glow.
// Dissolves rendered content (image child) based on uProgress uniform.
// At uProgress=0 content is fully visible; at uProgress=1 fully dissolved.
// The dissolve boundary cycles through 6 prism colors based on position.
export const DissolveShader = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float uProgress;      // 0 = visible, 1 = dissolved

  // 6 prism color stops for rainbow edge glow
  uniform half3 uPrismColor0;   // 0°
  uniform half3 uPrismColor1;   // 60°
  uniform half3 uPrismColor2;   // 120°
  uniform half3 uPrismColor3;   // 180°
  uniform half3 uPrismColor4;   // 240°
  uniform half3 uPrismColor5;   // 300°

  // ── Noise helpers ──────────────────────────────────────────────────
  float hash(float2 p) {
    return fract(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // 3-octave FBM for organic dissolve pattern
  float fbm(float2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * valueNoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  // Cycle through 6 prism colors based on a 0-1 parameter
  half3 prismColor(float t) {
    float idx = fract(t) * 6.0;
    float f = fract(idx);
    float s = floor(idx);

    half3 a, b;
    if (s < 1.0)      { a = uPrismColor0; b = uPrismColor1; }
    else if (s < 2.0) { a = uPrismColor1; b = uPrismColor2; }
    else if (s < 3.0) { a = uPrismColor2; b = uPrismColor3; }
    else if (s < 4.0) { a = uPrismColor3; b = uPrismColor4; }
    else if (s < 5.0) { a = uPrismColor4; b = uPrismColor5; }
    else              { a = uPrismColor5; b = uPrismColor0; }

    return mix(a, b, half(f));
  }

  // ── Main ───────────────────────────────────────────────────────────
  half4 main(float2 pos) {
    half4 color = image.eval(pos);

    // Skip transparent pixels
    if (color.a < 0.01) return half4(0.0);

    // Pass through original pixels untouched when not dissolving — keeps text crisp
    if (uProgress < 0.001) return color;
    // Fully dissolved
    if (uProgress > 0.999) return half4(0.0);

    // Noise-based threshold — scale controls grain size
    float n = fbm(pos * 0.04);

    // Crisp dissolve with tight edge
    float edge = 0.02;
    float dissolve = smoothstep(uProgress - edge, uProgress + edge, n);

    // Prism glow at dissolve frontier — color cycles with horizontal position
    float glowWidth = 0.04;
    float glowMask = smoothstep(glowWidth, 0.0, abs(n - uProgress));
    // Map horizontal position to 0-1 for prism color cycling
    float colorT = fract(pos.x * 0.008 + pos.y * 0.003);
    half3 edgeGlow = prismColor(colorT);

    half3 finalColor = mix(color.rgb, edgeGlow, half(glowMask));
    float finalAlpha = color.a * dissolve;

    // Boost alpha at glow edge so the rainbow is visible on thin strokes
    finalAlpha = max(finalAlpha, color.a * glowMask * 0.7);

    return half4(finalColor * half(finalAlpha), half(finalAlpha));
  }
`)!;
