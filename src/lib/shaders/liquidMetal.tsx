/**
 * Liquid Metal Shader (SkSL)
 *
 * Ported from paper-design/shaders liquid-metal shader.
 * Creates a liquid metal effect with animated flowing patterns and chromatic aberration.
 *
 * UNIFORMS:
 * - iResolution: float2 - Canvas resolution (width, height)
 * - iTime: float - Animation time in seconds
 * - iColorBack: float4 - Background color (RGBA)
 * - iColorTint: float4 - Tint color for color burn effect (RGBA)
 * - iSoftness: float - Blur/softness amount (0-1)
 * - iRepetition: float - Stripe pattern repetition (1-20)
 * - iShiftRed: float - Red channel chromatic shift (0-1)
 * - iShiftBlue: float - Blue channel chromatic shift (0-1)
 * - iDistortion: float - Noise distortion amount (0-1)
 * - iContour: float - Edge/contour definition (0-1)
 * - iAngle: float - Pattern rotation angle in degrees
 * - iShape: float - Shape mode (0=full, 1=circle, 2=daisy, 3=diamond, 4=metaballs)
 *
 * FUTURE ENHANCEMENT:
 * - Image mode: Add `uniform shader image;` and sample with `image.eval(uv)`
 *
 * @see https://github.com/paper-design/shaders
 */

export const liquidMetalShader = `
uniform float2 iResolution;
uniform float iTime;
uniform float4 iColorBack;
uniform float4 iColorTint;
uniform float iSoftness;
uniform float iRepetition;
uniform float iShiftRed;
uniform float iShiftBlue;
uniform float iDistortion;
uniform float iContour;
uniform float iAngle;
uniform float iShape;

// ============================================================================
// CONSTANTS
// ============================================================================

const float PI = 3.14159265359;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// 2D Rotation
float2 rotate(float2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return float2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// ============================================================================
// SIMPLEX NOISE (2D)
// ============================================================================

float3 permute(float3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(float2 v) {
  const float4 C = float4(
    0.211324865405187,   // (3.0-sqrt(3.0))/6.0
    0.366025403784439,   // 0.5*(sqrt(3.0)-1.0)
    -0.577350269189626,  // -1.0 + 2.0 * C.x
    0.024390243902439    // 1.0 / 41.0
  );

  // First corner
  float2 i = floor(v + dot(v, C.yy));
  float2 x0 = v - i + dot(i, C.xx);

  // Other corners
  float2 i1 = (x0.x > x0.y) ? float2(1.0, 0.0) : float2(0.0, 1.0);
  float4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  // Permutations
  i = mod(i, 289.0);
  float3 p = permute(permute(i.y + float3(0.0, i1.y, 1.0)) + i.x + float3(0.0, i1.x, 1.0));

  float3 m = max(0.5 - float3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;

  // Gradients
  float3 x = 2.0 * fract(p * C.www) - 1.0;
  float3 h = abs(x) - 0.5;
  float3 ox = floor(x + 0.5);
  float3 a0 = x - ox;

  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

  // Compute final noise value
  float3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// ============================================================================
// COLOR CHANGES (Stripe Pattern)
// ============================================================================

float getColorChanges(float c1, float c2, float stripe_p, float3 w, float blur, float bump, float tint) {
  float ch = mix(c2, c1, smoothstep(0.0, 2.0 * blur, stripe_p));

  float border = w.x;
  ch = mix(ch, c2, smoothstep(border, border + 2.0 * blur, stripe_p));

  // Bump adjustment
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

  // Color burn blending with tint
  ch = mix(ch, 1.0 - min(1.0, (1.0 - ch) / max(tint, 0.0001)), iColorTint.a);
  return ch;
}

// ============================================================================
// SHAPE EDGE DETECTION
// ============================================================================

float getShapeEdge(float2 uv, float t) {
  float edge = 0.0;

  if (iShape < 0.5) {
    // Shape 0: Full-fill (rectangle edges)
    float2 mask = min(uv, 1.0 - uv);
    float2 pixel_thickness = float2(0.15);
    float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
    float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
    maskX = pow(maskX, 0.25);
    maskY = pow(maskY, 0.25);
    edge = clamp(1.0 - maskX * maskY, 0.0, 1.0);

  } else if (iShape < 1.5) {
    // Shape 1: Circle
    float2 shapeUV = uv - 0.5;
    shapeUV *= 0.67;
    edge = pow(clamp(3.0 * length(shapeUV), 0.0, 1.0), 18.0);

  } else if (iShape < 2.5) {
    // Shape 2: Daisy (flower)
    float2 shapeUV = uv - 0.5;
    shapeUV *= 1.68;
    float r = length(shapeUV) * 2.0;
    float a = atan(shapeUV.y, shapeUV.x) + 0.2;
    r *= (1.0 + 0.05 * sin(3.0 * a + 2.0 * t));
    float f = abs(cos(a * 3.0));
    edge = smoothstep(f, f + 0.7, r);
    edge *= edge;

  } else if (iShape < 3.5) {
    // Shape 3: Diamond (rotated square)
    float2 shapeUV = uv - 0.5;
    shapeUV = rotate(shapeUV, 0.25 * PI);
    shapeUV *= 1.42;
    shapeUV += 0.5;
    float2 mask = min(shapeUV, 1.0 - shapeUV);
    float2 pixel_thickness = float2(0.15);
    float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
    float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
    maskX = pow(maskX, 0.25);
    maskY = pow(maskY, 0.25);
    edge = clamp(1.0 - maskX * maskY, 0.0, 1.0);

  } else {
    // Shape 4: Metaballs (animated blobs)
    float2 shapeUV = uv - 0.5;
    shapeUV *= 1.3;
    edge = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float speed = 1.5 + 0.666 * sin(fi * 12.345);
      float angle = -fi * 1.5;
      float2 dir1 = float2(cos(angle), sin(angle));
      float2 dir2 = float2(cos(angle + 1.57), sin(angle + 1.0));
      float2 traj = 0.4 * (dir1 * sin(t * speed + fi * 1.23) + dir2 * cos(t * (speed * 0.7) + fi * 2.17));
      float d = length(shapeUV + traj);
      edge += pow(1.0 - clamp(d, 0.0, 1.0), 4.0);
    }
    edge = 1.0 - smoothstep(0.65, 0.9, edge);
    edge = pow(edge, 4.0);
  }

  // Apply contour smoothing (simplified without fwidth)
  float edgeSmooth = smoothstep(0.85, 0.95, edge);
  edge = mix(edgeSmooth, edge, smoothstep(0.0, 0.4, iContour));

  return edge;
}

// ============================================================================
// MAIN SHADER
// ============================================================================

half4 main(float2 fragCoord) {
  // Time with offset for interesting first frame
  const float firstFrameOffset = 2.8;
  float t = 0.3 * (iTime + firstFrameOffset);

  // Normalized UV coordinates
  float2 uv = fragCoord / iResolution;
  uv.y = 1.0 - uv.y; // Flip Y for standard orientation

  float cycleWidth = iRepetition;

  // Rotation for stripe pattern
  float2 rotatedUV = uv - float2(0.5);
  float angle = (-iAngle + 70.0) * PI / 180.0;
  rotatedUV = rotate(rotatedUV, angle) + float2(0.5);

  // Get edge from shape
  float edge = getShapeEdge(uv, t);

  // Calculate opacity (inverse of edge for shape visibility)
  float opacity = 1.0 - smoothstep(0.85, 0.95, edge);

  // Adjust edge intensity based on shape
  if (iShape < 1.5) {
    edge = 1.2 * edge;
  } else if (iShape < 4.5) {
    edge = 1.8 * pow(edge, 1.5);
  }

  // Diagonal gradients for lighting
  float diagBLtoTR = rotatedUV.x - rotatedUV.y;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y;

  // Base colors (silver metallic)
  float3 color1 = float3(0.98, 0.98, 1.0);
  float3 color2 = float3(0.1, 0.1, 0.1 + 0.1 * smoothstep(0.7, 1.3, diagTLtoBR));

  // Gradient calculations
  float2 grad_uv = uv - 0.5;
  float dist = length(grad_uv + float2(0.0, 0.2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (0.25 - 0.2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  // Bump mapping for 3D effect
  float bump = pow(1.8 * dist, 1.2);
  bump = 1.0 - bump;
  bump *= pow(uv.y, 0.3);

  // Stripe width ratios
  float thin_strip_1_ratio = 0.12 / cycleWidth * (1.0 - 0.4 * bump);
  float thin_strip_2_ratio = 0.07 / cycleWidth * (1.0 + 0.4 * bump);
  float wide_strip_ratio = (1.0 - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  // Noise for distortion
  float noise = snoise(uv - t);

  // Apply distortion
  edge += (1.0 - edge) * iDistortion * noise;

  // Direction calculation for stripe animation
  direction += diagBLtoTR;
  direction -= 2.0 * noise * diagBLtoTR * (smoothstep(0.0, 1.0, edge) * (1.0 - smoothstep(0.0, 1.0, edge)));
  direction *= mix(1.0, 1.0 - edge, smoothstep(0.5, 1.0, iContour));
  direction -= 1.7 * edge * smoothstep(0.5, 1.0, iContour);
  direction += 0.2 * pow(iContour, 4.0) * (1.0 - smoothstep(0.0, 1.0, edge));

  bump *= clamp(pow(uv.y, 0.1), 0.3, 1.0);
  direction *= (0.1 + (1.1 - edge) * bump);
  direction *= (0.4 + 0.6 * (1.0 - smoothstep(0.5, 1.0, edge)));
  direction += 0.18 * (smoothstep(0.1, 0.2, uv.y) * (1.0 - smoothstep(0.2, 0.4, uv.y)));
  direction += 0.03 * (smoothstep(0.1, 0.2, 1.0 - uv.y) * (1.0 - smoothstep(0.2, 0.4, 1.0 - uv.y)));
  direction *= (0.5 + 0.5 * pow(uv.y, 2.0));
  direction *= cycleWidth;
  direction -= t;

  // Chromatic aberration (color dispersion)
  float colorDispersion = clamp(1.0 - bump, 0.0, 1.0);

  float dispersionRed = colorDispersion;
  dispersionRed += 0.03 * bump * noise;
  dispersionRed += 5.0 * (smoothstep(-0.1, 0.2, uv.y) * (1.0 - smoothstep(0.1, 0.5, uv.y))) * (smoothstep(0.4, 0.6, bump) * (1.0 - smoothstep(0.4, 1.0, bump)));
  dispersionRed -= diagBLtoTR;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0.0, 0.4, uv.y) * (1.0 - smoothstep(0.1, 0.8, uv.y))) * (smoothstep(0.4, 0.6, bump) * (1.0 - smoothstep(0.4, 0.8, bump)));
  dispersionBlue -= 0.2 * edge;

  dispersionRed *= (iShiftRed / 20.0);
  dispersionBlue *= (iShiftBlue / 20.0);

  // Blur calculation
  float blur = iSoftness / 15.0 + 0.3 * iContour;

  // Stripe widths vector
  float3 w = float3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w.y -= 0.02 * smoothstep(0.0, 1.0, edge + bump);

  // Calculate RGB channels with chromatic aberration
  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + 0.01, bump, iColorTint.r);

  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + 0.01, bump, iColorTint.g);

  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + 0.01, bump, iColorTint.b);

  // Combine color
  float3 color = float3(r, g, b);
  color *= opacity;

  // Blend with background
  float3 bgColor = iColorBack.rgb * iColorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + iColorBack.a * (1.0 - opacity);

  // Simple dithering to reduce color banding
  float dither = (fract(sin(dot(fragCoord, float2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  color += dither;

  return half4(color, opacity);
}
`;
