/**
 * Sensor Liquid Metal Shader (SkSL)
 *
 * A liquid metal shader that reacts to device orientation/tilt sensors.
 * The metal reflections shift based on how the device is tilted.
 *
 * DIFFERENTIATORS:
 * - Device tilt affects light reflection angle
 * - Perlin noise for organic texture
 * - Customizable metal colors
 * - Mobile-specific interaction
 *
 * SENSOR UNIFORMS:
 * - iSensorX: float - Device tilt on X axis (roll, -1 to 1)
 * - iSensorY: float - Device tilt on Y axis (pitch, -1 to 1)
 *
 * OTHER UNIFORMS:
 * - iResolution: float2 - Canvas resolution (width, height)
 * - iTime: float - Animation time in seconds
 * - iColorBack: float4 - Background color (RGBA)
 * - iColorTint: float4 - Tint color for color burn effect (RGBA)
 * - iColorHighlight: float3 - Metal highlight color (bright reflections)
 * - iColorShadow: float3 - Metal shadow color (dark areas)
 * - iSoftness: float - Blur/softness amount (0-1)
 * - iRepetition: float - Stripe pattern repetition (1-20)
 * - iShiftRed: float - Red channel chromatic shift (0-1)
 * - iShiftBlue: float - Blue channel chromatic shift (0-1)
 * - iDistortion: float - Noise distortion amount (0-1)
 * - iContour: float - Edge/contour definition (0-1)
 * - iAngle: float - Pattern rotation angle in degrees
 * - iShape: float - Shape mode (0=full, 1=circle, 2=daisy, 3=diamond, 4=metaballs)
 * - iSensorInfluence: float - How much sensor affects the reflection (0-1)
 *
 * @see https://docs.swmansion.com/react-native-reanimated/docs/device/useAnimatedSensor/
 */

export const sensorLiquidMetalShader = `
uniform float2 iResolution;
uniform float iTime;
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
uniform float iAngle;
uniform float iShape;

// Sensor uniforms
uniform float iSensorX;        // Roll: device tilt left/right (-1 to 1)
uniform float iSensorY;        // Pitch: device tilt forward/backward (-1 to 1)
uniform float iSensorInfluence; // How much sensor affects reflection (0-1)

// ============================================================================
// CONSTANTS
// ============================================================================

const float PI = 3.14159265359;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

float2 rotate(float2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return float2(v.x * c - v.y * s, v.x * s + v.y * c);
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

float getColorChanges(float c1, float c2, float stripe_p, float3 w, float blur, float bump, float tint, float tintAlpha) {
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

  ch = mix(ch, 1.0 - min(1.0, (1.0 - ch) / max(tint, 0.0001)), tintAlpha);
  return ch;
}

// ============================================================================
// SHAPE EDGE DETECTION
// ============================================================================

float getShapeEdge(float2 uv, float t) {
  float edge = 0.0;

  if (iShape < 0.5) {
    float2 mask = min(uv, 1.0 - uv);
    float2 pixel_thickness = float2(0.15);
    float maskX = smoothstep(0.0, pixel_thickness.x, mask.x);
    float maskY = smoothstep(0.0, pixel_thickness.y, mask.y);
    maskX = pow(maskX, 0.25);
    maskY = pow(maskY, 0.25);
    edge = clamp(1.0 - maskX * maskY, 0.0, 1.0);

  } else if (iShape < 1.5) {
    float2 shapeUV = uv - 0.5;
    shapeUV *= 0.67;
    edge = pow(clamp(3.0 * length(shapeUV), 0.0, 1.0), 18.0);

  } else if (iShape < 2.5) {
    float2 shapeUV = uv - 0.5;
    shapeUV *= 1.68;
    float r = length(shapeUV) * 2.0;
    float a = atan(shapeUV.y, shapeUV.x) + 0.2;
    r *= (1.0 + 0.05 * sin(3.0 * a + 2.0 * t));
    float f = abs(cos(a * 3.0));
    edge = smoothstep(f, f + 0.7, r);
    edge *= edge;

  } else if (iShape < 3.5) {
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

  float edgeSmooth = smoothstep(0.85, 0.95, edge);
  edge = mix(edgeSmooth, edge, smoothstep(0.0, 0.4, iContour));

  return edge;
}

// ============================================================================
// MAIN SHADER
// ============================================================================

half4 main(float2 fragCoord) {
  const float firstFrameOffset = 2.8;
  float t = 0.3 * (iTime + firstFrameOffset);

  float2 uv = fragCoord / iResolution;
  uv.y = 1.0 - uv.y;

  float cycleWidth = iRepetition;

  // ============================================================================
  // SENSOR-BASED ANGLE MODIFICATION
  // ============================================================================

  // Base angle from prop + sensor influence
  // Sensor values shift the reflection angle based on device tilt
  float sensorAngleOffset = (iSensorX * 45.0 + iSensorY * 30.0) * iSensorInfluence;
  float totalAngle = iAngle + sensorAngleOffset;

  float2 rotatedUV = uv - float2(0.5);
  float angle = (-totalAngle + 70.0) * PI / 180.0;
  rotatedUV = rotate(rotatedUV, angle) + float2(0.5);

  float edge = getShapeEdge(uv, t);
  float opacity = 1.0 - smoothstep(0.85, 0.95, edge);

  if (iShape < 1.5) {
    edge = 1.2 * edge;
  } else if (iShape < 4.5) {
    edge = 1.8 * pow(edge, 1.5);
  }

  // ============================================================================
  // SENSOR-INFLUENCED LIGHTING
  // ============================================================================

  // Modify diagonal gradients based on sensor data for dynamic lighting
  float sensorLightX = iSensorX * iSensorInfluence * 0.3;
  float sensorLightY = iSensorY * iSensorInfluence * 0.3;

  float diagBLtoTR = rotatedUV.x - rotatedUV.y + sensorLightX;
  float diagTLtoBR = rotatedUV.x + rotatedUV.y + sensorLightY;

  // Metal colors with sensor-influenced blue tint variation
  float3 color1 = iColorHighlight;
  float3 color2 = iColorShadow + float3(
    0.05 * sensorLightX,
    0.0,
    0.1 * smoothstep(0.7, 1.3, diagTLtoBR)
  );

  float2 grad_uv = uv - 0.5;

  // Sensor affects the perceived "center" of the reflection
  grad_uv += float2(sensorLightX, sensorLightY) * 0.2;

  float dist = length(grad_uv + float2(0.0, 0.2 * diagBLtoTR));
  grad_uv = rotate(grad_uv, (0.25 - 0.2 * diagBLtoTR) * PI);
  float direction = grad_uv.x;

  // Bump mapping with sensor influence for more dynamic 3D effect
  float bump = pow(1.8 * dist, 1.2);
  bump = 1.0 - bump;
  bump *= pow(uv.y, 0.3);
  bump += (iSensorY * 0.1) * iSensorInfluence; // Sensor affects perceived depth

  float thin_strip_1_ratio = 0.12 / cycleWidth * (1.0 - 0.4 * bump);
  float thin_strip_2_ratio = 0.07 / cycleWidth * (1.0 + 0.4 * bump);
  float wide_strip_ratio = (1.0 - thin_strip_1_ratio - thin_strip_2_ratio);

  float thin_strip_1_width = cycleWidth * thin_strip_1_ratio;
  float thin_strip_2_width = cycleWidth * thin_strip_2_ratio;

  float noise = perlinNoise(uv * 3.0 - t);

  edge += (1.0 - edge) * iDistortion * noise;

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

  // ============================================================================
  // CHROMATIC ABERRATION (sensor-enhanced)
  // ============================================================================

  float colorDispersion = clamp(1.0 - bump, 0.0, 1.0);

  // Sensor data slightly affects chromatic aberration for more dynamic effect
  float sensorChromaX = iSensorX * iSensorInfluence * 0.02;
  float sensorChromaY = iSensorY * iSensorInfluence * 0.02;

  float dispersionRed = colorDispersion;
  dispersionRed += 0.03 * bump * noise;
  dispersionRed += 5.0 * (smoothstep(-0.1, 0.2, uv.y) * (1.0 - smoothstep(0.1, 0.5, uv.y))) * (smoothstep(0.4, 0.6, bump) * (1.0 - smoothstep(0.4, 1.0, bump)));
  dispersionRed -= diagBLtoTR;
  dispersionRed += sensorChromaX;

  float dispersionBlue = colorDispersion;
  dispersionBlue *= 1.3;
  dispersionBlue += (smoothstep(0.0, 0.4, uv.y) * (1.0 - smoothstep(0.1, 0.8, uv.y))) * (smoothstep(0.4, 0.6, bump) * (1.0 - smoothstep(0.4, 0.8, bump)));
  dispersionBlue -= 0.2 * edge;
  dispersionBlue += sensorChromaY;

  dispersionRed *= (iShiftRed / 20.0);
  dispersionBlue *= (iShiftBlue / 20.0);

  float blur = iSoftness / 15.0 + 0.3 * iContour;

  float3 w = float3(thin_strip_1_width, thin_strip_2_width, wide_strip_ratio);
  w.y -= 0.02 * smoothstep(0.0, 1.0, edge + bump);

  float stripe_r = fract(direction + dispersionRed);
  float r = getColorChanges(color1.r, color2.r, stripe_r, w, blur + 0.01, bump, iColorTint.r, iColorTint.a);

  float stripe_g = fract(direction);
  float g = getColorChanges(color1.g, color2.g, stripe_g, w, blur + 0.01, bump, iColorTint.g, iColorTint.a);

  float stripe_b = fract(direction - dispersionBlue);
  float b = getColorChanges(color1.b, color2.b, stripe_b, w, blur + 0.01, bump, iColorTint.b, iColorTint.a);

  float3 color = float3(r, g, b);
  color *= opacity;

  float3 bgColor = iColorBack.rgb * iColorBack.a;
  color = color + bgColor * (1.0 - opacity);
  opacity = opacity + iColorBack.a * (1.0 - opacity);

  float dither = (fract(sin(dot(fragCoord, float2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  color += dither;

  return half4(color, opacity);
}
`;
