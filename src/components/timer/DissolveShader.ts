import { Skia } from "@shopify/react-native-skia";

// Noise-driven dissolve shader
// Dissolves rendered content (image child) based on uProgress uniform.
// At uProgress=0 content is fully visible; at uProgress=1 fully dissolved.
// Adds a bright edge glow at the dissolve boundary for a cinematic look.
export const DissolveShader = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float uProgress;   // 0 = visible, 1 = dissolved
  uniform float3 uEdgeColor; // glow color at dissolve boundary

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

  // 3-octave FBM for organic look
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

  // ── Main ───────────────────────────────────────────────────────────
  half4 main(float2 pos) {
    half4 color = image.eval(pos);

    // Skip transparent pixels (nothing to dissolve)
    if (color.a < 0.01) return half4(0.0);

    // Noise-based threshold — scale controls grain size
    float n = fbm(pos * 0.04);

    // Dissolve: where noise < progress → pixel disappears
    float edge = 0.06;
    float dissolve = smoothstep(uProgress - edge, uProgress + edge, n);
    // dissolve = 1 → pixel survives, dissolve = 0 → pixel gone

    // Glow at dissolve frontier
    float glowWidth = 0.08;
    float glow = smoothstep(glowWidth, 0.0, abs(n - uProgress)) * step(0.01, uProgress) * step(uProgress, 0.99);

    half3 finalColor = mix(color.rgb, half3(uEdgeColor), half(glow));
    float finalAlpha = color.a * dissolve;

    // Boost alpha slightly at glow so edge is visible even for thin strokes
    finalAlpha = max(finalAlpha, color.a * glow * 0.6);

    return half4(finalColor * half(finalAlpha), half(finalAlpha));
  }
`)!;
