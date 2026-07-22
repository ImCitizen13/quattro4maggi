/**
 * Metaball Liquid Metal Shader (SkSL)
 *
 * A distinct shader from SdfLiquidMetal: the silhouette is the smooth-MAX
 * union of a baked path field AND up to 16 moving metaballs. The metal bands,
 * edge, bevel and analytic AA all follow the *fused* field, so the balls wear
 * the same liquid metal and grow gooey necks as they separate.
 *
 * WHY smooth-MAX (not smooth-min): this pipeline is POSITIVE-INSIDE. A union
 * of positive-inside fields is a smooth maximum. Each ball's SDF is
 * `r - length(p - c)` (positive within radius r), so the union grows the body.
 *
 * REST look is unchanged from SdfLiquidMetal: with `iBallCount == 0` the whole
 * ball loop is branched out and `main` reduces to the exact path-only field —
 * zero added cost, zero visual difference. Balls only participate on tap.
 *
 * COORDINATE SPACE: everything unions in FIELD PIXELS (texel space). A logical
 * fragCoord maps to texels via `* iSdfScale`. Ball centers/radii are authored
 * in field pixels (metaballSites.ts), matching the baked path distances.
 *
 * UNIFORMS (added over SdfLiquidMetal's set):
 * - iBalls[16]: float4 - Per-ball [cx, cy (field px), radius (field px),
 *   active]. Inactive balls (w < 0.5) are forced fully negative so the union
 *   ignores them — no offscreen hack, no per-index radius fiddling.
 * - iBallCount: float - Number of active balls. 0 = branch out the union
 *   entirely (idle path === SdfLiquidMetal).
 * - iBodyErode: float - Erodes the path field before the union, in units of
 *   the shape's deepest inside distance. 0 at rest (core intact); on tap it
 *   ramps toward ~1.15, marching the outline inward past the medial axis so
 *   the solid body dissolves entirely and only the dispersing balls remain.
 *   (Eroding — subtracting — is the correct recede: multiplying the signed
 *   field toward 0 would collapse the outline everywhere and flood the frame.)
 * - iBallSmooth: float - smooth-max softness k (field px). Larger = longer,
 *   gooier necks between the body and the balls.
 *
 * @see SdfLiquidMetal.ts for the path-only original this forks
 * @see metaballSites.ts for how ball centers/radii are chosen from the field
 */

export const metaballLiquidMetalShader = `
uniform shader iSdfTexA;
uniform shader iSdfTexB;
uniform float2 iResolution;
uniform float iTime;
uniform float iSdfMaxA;
uniform float iSdfMaxB;
uniform float iSdfMaxInsideA;
uniform float iSdfMaxInsideB;
uniform float iSdfScale;
uniform float iMorph;
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

// --- Metaball uniforms ------------------------------------------------------
uniform float4 iBalls[16];
uniform float iBallCount;
uniform float iBodyErode;
uniform float iBallSmooth;

// --- Density bridge (thin stretching strings) -------------------------------
// The distance-max union can only bridge gaps ~k/4 wide, so far-apart balls
// detach. A SUMMED-density field bridges them instead: each ball adds a smooth
// finite kernel, and because contributions ADD, two balls whose supports
// overlap sum over the threshold and connect with a thin neck that stretches
// and snaps as they separate — the classic mercury/taffy metaball look. Fused
// as max(distanceField, densityBridge) so the body/ball bands stay on true
// distances; only the thin string regions come from density. iBridge = 0
// disables it (byte-identical to the distance-only field).
uniform float iBridge;          // 0 = off, 1 = on
uniform float iBridgeReach;     // kernel support = ball radius × this
uniform float iBridgeThreshold; // density isolevel (string thickness)
uniform float iBridgeScale;     // density → pixel conversion for the string

const float PI = 3.14159265359;

// ============================================================================
// DISTANCE FIELD
// ============================================================================

// Signed distance in field pixels, positive inside the path — the lerp of the
// two slot fields at morph position m (0 = A, 1 = B). Each texture is
// denormalized with its own max before mixing. Baked at iSdfScale× logical.
float sdPath(float2 fragCoord, float m) {
  float2 tc = fragCoord * iSdfScale;
  float dA = (iSdfTexA.eval(tc).r - 0.5) * 2.0 * iSdfMaxA;
  float dB = (iSdfTexB.eval(tc).r - 0.5) * 2.0 * iSdfMaxB;
  return mix(dA, dB, m);
}

// Smooth maximum (polynomial). Positive-inside union: the body grows to
// swallow the balls, leaving a soft neck of width ~k where fields overlap.
float smax(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(a, b, h) + k * h * (1.0 - h);
}

// Fused field: eroded path core unioned with the moving metaballs. When no
// balls are active this returns the pure path field at zero extra cost.
float sdField(float2 fragCoord, float m) {
  float dP = sdPath(fragCoord, m);
  if (iBallCount < 0.5) {
    return dP;
  }
  // Erode the body inward by a fraction of its own depth: at full burst the
  // outline marches past the medial axis and the solid core disappears,
  // leaving only the balls (their SDFs are untouched by the erosion).
  float erode = iBodyErode * max(mix(iSdfMaxInsideA, iSdfMaxInsideB, m), 1.0);
  float2 p = fragCoord * iSdfScale;
  float ballField = -1.0e6;
  float density = 0.0;
  for (int i = 0; i < 16; i++) {
    float4 b = iBalls[i];
    if (b.w > 0.5) {
      float dist = length(p - b.xy);
      ballField = max(ballField, b.z - dist);
      if (iBridge > 0.01) {
        // Smooth finite kernel (1 - x²)², support = radius × reach. Squared so
        // it stays smooth (zero slope) at the support edge → clean string tips.
        float x = dist / (b.z * iBridgeReach);
        float k = (x < 1.0) ? (1.0 - x * x) : 0.0;
        density += k * k;
      }
    }
  }
  float dBase = smax(dP - erode, ballField, iBallSmooth);
  if (iBridge < 0.01) {
    return dBase;
  }
  // Where the summed density clears the threshold, add a shallow positive band
  // (thin string). max() keeps the deeper body/ball field wherever it wins, so
  // only the gaps between balls gain the stretched connective tissue. iBridge
  // is a 0..1 strength (faded with dispersion) so the bridge vanishes cleanly
  // as the balls converge — otherwise the clustered rest density bulges and
  // pops when the ball loop switches off.
  float dBridge = (density - iBridgeThreshold) * iBridgeScale;
  return mix(dBase, max(dBase, dBridge), iBridge);
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

  // --- Field (morph-blended path unioned with metaballs) ---------------------
  // Static spatial noise biases the morph parameter so regions flow ahead of
  // others (liquid melt, not a uniform dissolve). The m*(1-m) envelope pins
  // the endpoints: settled shapes are exact, bias peaks mid-morph.
  float meltNoise = perlinNoise(uv * 2.5 + float2(4.7, 9.2));
  float m = clamp(iMorph + 1.4 * meltNoise * iMorph * (1.0 - iMorph), 0.0, 1.0);

  float d = sdField(fragCoord, m);
  // Depth normalized against the deepest point: 0 at outline, 1 on the spine
  float depth = clamp(d / max(mix(iSdfMaxInsideA, iSdfMaxInsideB, m), 1.0), 0.0, 1.0);

  // --- Debug view: raw field + isolines --------------------------------------
  if (iDebug > 0.5) {
    float dn = d / mix(iSdfMaxA, iSdfMaxB, m);
    float3 c = d >= 0.0
      ? float3(0.0, 0.4 + 0.6 * dn, 0.2)
      : float3(0.4 - 0.6 * dn, 0.0, 0.2);
    float iso = abs(fract(d / 8.0) - 0.5) * 2.0;
    c *= 0.6 + 0.4 * smoothstep(0.8, 0.95, iso);
    c = mix(c, float3(1.0), 1.0 - smoothstep(0.5, 1.5, abs(d)));
    return half4(c, 1.0);
  }

  // --- Mask & edge from the field --------------------------------------------
  float opacity = smoothstep(-0.75, 0.75, d);
  float edge = 1.0 - smoothstep(0.0, 0.6, depth);
  edge = 1.2 * pow(edge, 1.5);

  float noise = perlinNoise(uv * 3.0 - t);
  edge += (1.0 - edge) * iDistortion * noise;

  // --- direction: the band field. Isolines = offset contours of the field ----
  float direction = depth;
  direction -= 2.0 * noise * (smoothstep(0.0, 1.0, edge) * (1.0 - smoothstep(0.0, 1.0, edge)));
  direction *= mix(1.0, 1.0 - edge, smoothstep(0.5, 1.0, iContour));
  direction -= 1.7 * edge * smoothstep(0.5, 1.0, iContour);

  float bump = depth;

  float cycleWidth = iRepetition;
  float thin_strip_1_ratio = 0.12 / cycleWidth * (1.0 - 0.4 * bump);
  float thin_strip_2_ratio = 0.07 / cycleWidth * (1.0 + 0.4 * bump);
  float wide_strip_ratio = (1.0 - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  direction *= cycleWidth;
  direction -= t;

  // --- Dispersion (chromatic) ------------------------------------------------
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
