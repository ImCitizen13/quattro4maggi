/**
 * SDF Liquid Metal Shader (SkSL)
 *
 * Liquid metal whose bands are isolines of a baked signed distance field of
 * an SVG path — bands follow the outline as offset contours instead of a
 * rotated linear ramp, and the mask/edge/bevel all derive from the same field
 * (no clip needed).
 *
 * The field is baked on the CPU (see pathSdf.ts) and passed as an RGBA_F32
 * child shader. R holds `0.5 + 0.5 * d / iSdfMax` with d positive inside.
 *
 * UNIFORMS (beyond ExpoLiquidMetal's set):
 * - iSdfTexture: shader - Baked distance field
 * - iSdfMax: float - Normalization scale (pixels) to reconstruct d
 * - iSdfMaxInside: float - Deepest inside distance (pixels)
 * - iDebug: float - 1 = render the raw field with isolines instead of metal
 *
 * @see pathSdf.ts for the bake, ExpoLiquidMetal.ts for the original ramp field
 */

export const sdfLiquidMetalShader = `
uniform shader iSdfTexture;
uniform float2 iResolution;
uniform float iTime;
uniform float iSdfMax;
uniform float iSdfMaxInside;
uniform float iDebug;
uniform float4 iColorBack;
uniform float4 iColorTint;
uniform float3 iColorHighlight;
uniform float3 iColorShadow;
uniform float iSoftness;
uniform float iRepetition;
uniform float iShiftRed;
uniform float iShiftBlue;
uniform float iDistortion;
uniform float iContour;
uniform float iIridescence;
uniform float3 iIridColor0;
uniform float3 iIridColor1;
uniform float3 iIridColor2;
uniform float3 iIridColor3;
uniform float3 iIridColor4;
uniform float3 iIridColor5;

const float PI = 3.14159265359;

// ============================================================================
// DISTANCE FIELD
// ============================================================================

// Signed distance in pixels, positive inside the path
float sdPath(float2 fragCoord) {
  float r = iSdfTexture.eval(fragCoord).r;
  return (r - 0.5) * 2.0 * iSdfMax;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

float3 getRainbowColor(float hue) {
  float segment = fract(hue) * 6.0;
  float idx = floor(segment);
  float f = segment - idx;

  float3 rainbow;
  if (idx < 1.0)      rainbow = mix(iIridColor0, iIridColor1, f);
  else if (idx < 2.0) rainbow = mix(iIridColor1, iIridColor2, f);
  else if (idx < 3.0) rainbow = mix(iIridColor2, iIridColor3, f);
  else if (idx < 4.0) rainbow = mix(iIridColor3, iIridColor4, f);
  else if (idx < 5.0) rainbow = mix(iIridColor4, iIridColor5, f);
  else                rainbow = mix(iIridColor5, iIridColor0, f);

  return rainbow;
}

float getStripeEdgeMask(float stripe_p, float3 w, float blur) {
  float edgeMask = 0.0;
  edgeMask = max(edgeMask, 1.0 - smoothstep(0.0, blur * 3.0, stripe_p));
  edgeMask = max(edgeMask, 1.0 - smoothstep(0.0, blur * 3.0, 1.0 - stripe_p));
  float b1 = w.x;
  edgeMask = max(edgeMask, 1.0 - smoothstep(0.0, blur * 3.0, abs(stripe_p - b1)));
  float b2 = w.x + w.y;
  edgeMask = max(edgeMask, 1.0 - smoothstep(0.0, blur * 3.0, abs(stripe_p - b2)));
  return edgeMask;
}

// ============================================================================
// PERLIN NOISE (2D)
// ============================================================================

float2 hash2(float2 p) {
  p = float2(dot(p, float2(127.1, 311.7)), dot(p, float2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float perlinNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float2 ga = hash2(i + float2(0.0, 0.0));
  float2 gb = hash2(i + float2(1.0, 0.0));
  float2 gc = hash2(i + float2(0.0, 1.0));
  float2 gd = hash2(i + float2(1.0, 1.0));
  float va = dot(ga, f - float2(0.0, 0.0));
  float vb = dot(gb, f - float2(1.0, 0.0));
  float vc = dot(gc, f - float2(0.0, 1.0));
  float vd = dot(gd, f - float2(1.0, 1.0));
  return va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);
}

// ============================================================================
// COLOR CHANGES (Stripe Pattern)
// ============================================================================

float getColorChanges(float c1, float c2, float stripe_p, float3 w, float blur, float bump, float tint) {
  float ch = mix(c2, c1, smoothstep(0.0, 2.0 * blur, stripe_p));

  float border = w.x;
  ch = mix(ch, c2, smoothstep(border, border + 2.0 * blur, stripe_p));

  bump = smoothstep(0.2, 0.8, bump);
  border = w.x + 0.4 * (1.0 - bump) * w.y;
  ch = mix(ch, c1, smoothstep(border, border + 2.0 * blur, stripe_p));

  border = w.x + 0.5 * (1.0 - bump) * w.y;
  ch = mix(ch, c2, smoothstep(border, border + 2.0 * blur, stripe_p));

  border = w.x + w.y;
  ch = mix(ch, c1, smoothstep(border, border + 2.0 * blur, stripe_p));

  float gradient_t = (stripe_p - w.x - w.y) / w.z;
  float gradient = mix(c1, c2, smoothstep(0.0, 1.0, gradient_t));
  ch = mix(ch, gradient, smoothstep(border, border + 0.5 * blur, stripe_p));

  ch = mix(ch, 1.0 - min(1.0, (1.0 - ch) / max(tint, 0.0001)), iColorTint.a);
  return ch;
}

// ============================================================================
// MAIN SHADER
// ============================================================================

half4 main(float2 fragCoord) {
  const float firstFrameOffset = 2.8;
  float t = 0.3 * (iTime + firstFrameOffset);

  float2 uv = fragCoord / iResolution;
  uv.y = 1.0 - uv.y;

  // --- Field ---------------------------------------------------------------
  float d = sdPath(fragCoord);
  // Depth normalized against the deepest point: 0 at outline, 1 on the spine
  float depth = clamp(d / max(iSdfMaxInside, 1.0), 0.0, 1.0);

  // --- Debug view: raw field + isolines --------------------------------------
  if (iDebug > 0.5) {
    float dn = d / iSdfMax;
    // inside green, outside red, ramped by |distance|
    float3 c = d >= 0.0
      ? float3(0.0, 0.4 + 0.6 * dn, 0.2)
      : float3(0.4 - 0.6 * dn, 0.0, 0.2);
    // isolines every 8 pixels
    float iso = abs(fract(d / 8.0) - 0.5) * 2.0;
    c *= 0.6 + 0.4 * smoothstep(0.8, 0.95, iso);
    // zero-crossing in white
    c = mix(c, float3(1.0), 1.0 - smoothstep(0.5, 1.5, abs(d)));
    return half4(c, 1.0);
  }

  // --- Mask & edge from the field (replaces getShapeEdge + the clip) ---------
  // Antialiased coverage over ~1.5px
  float opacity = smoothstep(-0.75, 0.75, d);
  // edge: 1 at the outline, falling to 0 toward the spine
  float edge = 1.0 - smoothstep(0.0, 0.6, depth);
  edge = 1.2 * pow(edge, 1.5);

  float noise = perlinNoise(uv * 3.0 - t);
  edge += (1.0 - edge) * iDistortion * noise;

  // --- direction: the band field. Isolines = offset contours of the path -----
  float direction = depth;
  // noise bends the isolines most in the mid-band, dying at outline and spine
  direction -= 2.0 * noise * (smoothstep(0.0, 1.0, edge) * (1.0 - smoothstep(0.0, 1.0, edge)));
  direction *= mix(1.0, 1.0 - edge, smoothstep(0.5, 1.0, iContour));
  direction -= 1.7 * edge * smoothstep(0.5, 1.0, iContour);

  // bump: depth doubles as the "height" of the liquid surface
  float bump = depth;

  float cycleWidth = iRepetition;
  float thin_strip_1_ratio = 0.12 / cycleWidth * (1.0 - 0.4 * bump);
  float thin_strip_2_ratio = 0.07 / cycleWidth * (1.0 + 0.4 * bump);
  float wide_strip_ratio = (1.0 - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  direction *= cycleWidth;
  direction -= t;

  // --- Dispersion ------------------------------------------------------------
  float colorDispersion = clamp(1.0 - bump, 0.0, 1.0);

  float dispersionRed = colorDispersion;
  dispersionRed += 0.03 * bump * noise;

  float dispersionBlue = colorDispersion * 1.3;
  dispersionBlue -= 0.2 * edge;

  dispersionRed *= (iShiftRed / 20.0);
  dispersionBlue *= (iShiftBlue / 20.0);

  float blur = iSoftness / 15.0 + 0.3 * iContour;

  float3 color1 = iColorHighlight;
  float3 color2 = iColorShadow + float3(0.0, 0.0, 0.1 * smoothstep(0.7, 1.3, uv.x + uv.y));

  float3 w = float3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w.y -= 0.02 * smoothstep(0.0, 1.0, edge + bump);

  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + 0.01, bump, iColorTint.r);

  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + 0.01, bump, iColorTint.g);

  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + 0.01, bump, iColorTint.b);

  float3 color = float3(r, g, b);

  // --- Iridescence at stripe edges -------------------------------------------
  if (iIridescence > 0.0) {
    float hue = direction * 0.5 + noise * 0.4;
    float3 irid = getRainbowColor(hue);
    float edgeMask = getStripeEdgeMask(stripe_g, w, blur);
    float noiseMask = abs(noise) * 0.5;
    float combinedMask = max(edgeMask, noiseMask) * (1.0 - edge);
    color = mix(color, color * irid * 1.2 + irid * 0.1, iIridescence * combinedMask);
  }

  color *= opacity;

  float3 bgColor = iColorBack.rgb * iColorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + iColorBack.a * (1.0 - opacity);

  float dither = (fract(sin(dot(fragCoord, float2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  color += dither;

  return half4(color, opacity);
}
`;
