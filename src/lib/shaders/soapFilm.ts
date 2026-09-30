/**
 * Soap Film Shader (SkSL)
 *
 * Standalone, mesh-decoupled soap-film iridescence, split into two strictly
 * separate stages:
 *
 * 1. THICKNESS — a scalar field in [0,1], animated and flowing. Two
 *    interchangeable generators are exported: `SOAP_THICKNESS` (curl-noise,
 *    stateless advection) and `SOAP_THICKNESS_SINE` (iterative domain warp).
 * 2. COLOR — `SOAP_COLOR` maps a thickness sample to a color, either via a
 *    ramp LUT or a physically-approximated thin-film interference formula.
 *    It takes the thickness generator as a child `uniform shader`, so the
 *    two stages never share state beyond that single scalar.
 *
 * Any `Skia.RuntimeEffect.Make` failure throws (rather than returning a
 * silently-null effect) so a broken edit fails loudly at import time instead
 * of a blank canvas at runtime.
 *
 * @see src/components/soap-film/SoapFilmShader.tsx for the declarative,
 *   pipe-able component wrapping these effects.
 */

import {
  AlphaType,
  ColorType,
  Skia,
  type SkImage,
  type SkRuntimeEffect,
} from "@shopify/react-native-skia";

// ============================================================================
// HELPERS
// ============================================================================

/** Compile SkSL, throwing (naming the effect) instead of returning null. */
function makeEffect(name: string, source: string): SkRuntimeEffect {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) {
    throw new Error(`soapFilm.ts: failed to compile "${name}" SkSL effect`);
  }
  return effect;
}

// ============================================================================
// SHARED NOISE — analytic-derivative value noise, sin-free hash
// ============================================================================

/**
 * Dave-Hoskins-style bounded hash — no `sin(huge number)` precision cliff.
 * Reused verbatim by both thickness generators.
 */
const NOISE_LIB = `
float hash(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Analytic-derivative value noise (Quilez-style): returns (value, dValue/dx, dValue/dy)
float3 noised(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);

  float2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);

  float a = hash(i + float2(0.0, 0.0));
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));

  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;

  float value = k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y;
  float2 deriv = du * (float2(k1, k2) + k3 * float2(u.y, u.x));
  return float3(value, deriv.x, deriv.y);
}

float2 rotate2(float2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return float2(v.x * c - v.y * s, v.x * s + v.y * c);
}
`;

// ============================================================================
// 1a. THICKNESS — curl noise, stateless advection
// ============================================================================

export const SOAP_THICKNESS = `
uniform float iTime;
uniform float2 iSize;
uniform float4 uLayer0; // (frequency, speed, rotationAngle, weight)
uniform float4 uLayer1;
uniform float4 uLayer2;
uniform float uSwirl;
uniform float uSeed;
uniform float uDrainage;   // 0 noise film .. 1 pure gravity bands
uniform float uBandShape;  // 0 horizontal bands, 1 rings around the apex
uniform float uGrain;      // base pattern frequency — higher = finer marbling
uniform float4 uTouch[8];   // (x, y, vx, vy) in points
uniform float uTouchAge[8]; // seconds since the impulse; large = inactive
uniform float uTouchTau;    // decay time constant, seconds
uniform float uTouchRadius; // gaussian falloff radius, normalized units
uniform float4 uVortex;    // (count 0..3, spin rad/s, radius normalized, cycle s)

${NOISE_LIB}

// ============================================================================
// LAYERED CURL VELOCITY FIELD
// ============================================================================

// curl(f) = (df/dy, -df/dx) — the perpendicular gradient of a scalar
// potential, read straight off the analytic derivative above, so curl costs
// no extra finite-difference taps.
float2 layerVelocity(float2 p, float4 layer, float t, float seed) {
  float freq = layer.x;
  float speed = layer.y;
  float angle = layer.z;
  float weight = layer.w;

  float2 rp = rotate2(p, angle) * freq + float2(seed, -seed * 1.37);
  rp += float2(t * speed, t * speed * 0.72);

  float3 n = noised(rp);
  // Chain rule back to p-space: grad_p = freq * R^T * grad_rp. Without the
  // freq factor high-frequency layers barely move; without the inverse
  // rotation the field is no longer divergence-free in p.
  float2 grad = rotate2(n.yz, -angle) * freq;
  float2 curl = float2(grad.y, -grad.x);
  return curl * weight;
}

float2 velocityField(float2 p, float t) {
  float2 v = float2(0.0);
  v += layerVelocity(p, uLayer0, t, uSeed);
  v += layerVelocity(p, uLayer1, t, uSeed);
  v += layerVelocity(p, uLayer2, t, uSeed);
  return v * uSwirl;
}

// ============================================================================
// TOUCH DISTURBANCE — added to velocity, not to thickness directly
// ============================================================================

float2 touchVelocity(float2 p, float minDim) {
  float2 v = float2(0.0);
  for (int i = 0; i < 8; i++) {
    float age = uTouchAge[i];
    float decay = exp(-age / uTouchTau);
    float4 touch = uTouch[i];
    float2 touchPos = touch.xy / minDim;
    float2 touchVel = touch.zw / minDim;

    float2 d = p - touchPos;
    float falloff = exp(-dot(d, d) / (uTouchRadius * uTouchRadius));
    float2 vortex = float2(-d.y, d.x) * length(touchVel) * 0.6;

    v += (touchVel + vortex) * falloff * decay;
  }
  return v;
}

// ============================================================================
// STATELESS ADVECTION — semi-Lagrangian backtrace, no feedback buffer
// ============================================================================

float2 advect(float2 uv, float t, float minDim) {
  const int STEPS = 5;
  const float STEP_DT = 0.09;

  float2 p = uv;
  for (int i = 0; i < STEPS; i++) {
    float ti = t - float(i) * STEP_DT;
    float2 v = velocityField(p, ti) + touchVelocity(p, minDim);
    p -= v * STEP_DT;
  }
  return p;
}

// ============================================================================
// VORTICES — differential rotation that winds up over a cycle
// ============================================================================

// Center of vortex k: slow Lissajous drift around the canvas center.
float2 vortexCenter(int k, float t, float2 extent) {
  float fk = float(k);
  float2 wobble = float2(
    sin(t * 0.07 * (fk + 1.0) + uSeed * (fk + 1.0) * 1.7),
    cos(t * 0.05 * (fk + 2.0) + uSeed * (fk + 1.0) * 2.3)
  );
  return 0.5 * extent + 0.3 * wobble;
}

// Backward-maps p through every vortex: rotation angle = spin * tau *
// gaussian(r), so the core turns faster than the rim and the pattern winds
// into spiral arms as tau grows. Alternate vortices spin opposite ways.
float2 twist(float2 p, float tau, float t, float2 extent) {
  float radius = uVortex.z;
  for (int k = 0; k < 3; k++) {
    if (float(k) < uVortex.x) {
      float2 c = vortexCenter(k, t, extent);
      float2 d = p - c;
      float dir = 1.0 - 2.0 * mod(float(k), 2.0);
      float angle = -dir * uVortex.y * tau * exp(-dot(d, d) / (radius * radius));
      p = c + rotate2(d, angle);
    }
  }
  return p;
}

float thicknessAt(float2 p, float t, float minDim) {
  // Slow drift keeps the base field from looking pinned even where the
  // advected velocity is near zero.
  float2 driftP = p * uGrain + float2(t * 0.02, -t * 0.015) + uSeed * 2.0;
  float3 n0 = noised(driftP);
  float3 n1 = noised(driftP * 2.13 + 7.0);
  float base = (0.5 + 0.5 * n0.x) + 0.25 * (0.5 + 0.5 * n1.x);
  base /= 1.25;

  // Drainage: gravity stratifies the film into thickness bands. Measured from
  // the ADVECTED position p, so the flow bends band edges into plumes; the
  // base noise roughens them further. Color wrapping turns the gradient into
  // bands. Horizontal = height (thin top, thick bottom). Rings = distance
  // from the apex — a bubble's latitude bands seen from above its thin top.
  float height = p.y * minDim / iSize.y; // 0 top .. 1 bottom
  float2 apex = 0.5 * (iSize / minDim) + float2(0.0, -0.1);
  float ring = length(p - apex) * 2.0;  // 0 apex .. 1 at half the min dim
  float profile = mix(height, ring, uBandShape);
  float bands = clamp(profile + 0.35 * (base - 0.5), 0.0, 1.0);

  return clamp(mix(base, bands, uDrainage), 0.0, 1.0);
}

half4 main(float2 fragCoord) {
  float minDim = min(iSize.x, iSize.y);
  float2 uv = fragCoord / minDim;
  float2 extent = iSize / minDim;
  float2 p = advect(uv, iTime, minDim);

  // Flow-map trick: two copies of the twist, half a cycle apart. Each one's
  // tau restarts every cycle, and its weight is 0 exactly at its restart, so
  // the winding keeps growing on screen without ever running to infinity.
  float cycle = max(uVortex.w, 0.5);
  float phase = fract(iTime / cycle);
  float phaseB = fract(phase + 0.5);
  float wA = 1.0 - abs(2.0 * phase - 1.0);

  float tA = thicknessAt(twist(p, phase * cycle, iTime, extent), iTime, minDim);
  float tB = thicknessAt(twist(p, phaseB * cycle, iTime, extent), iTime, minDim);
  float t = mix(tB, tA, wA);
  return half4(t, t, t, 1.0);
}
`;

// ============================================================================
// 1b. THICKNESS — "Sine Puke" iterative domain warp (alternative generator)
// ============================================================================

export const SOAP_THICKNESS_SINE = `
uniform float iTime;
uniform float2 iSize;
uniform float uSineFreq;
uniform float uSineSpeedA;
uniform float uSineSpeedB;
uniform float2 uSineOffset; // simple domain offset; touch may feed this

half4 main(float2 fragCoord) {
  float minDim = min(iSize.x, iSize.y);
  float2 p = (fragCoord / minDim) * uSineFreq + uSineOffset;

  float ta = iTime * uSineSpeedA;
  float tb = iTime * uSineSpeedB;

  const int N = 10;
  for (int i = 1; i <= N; i++) {
    float fi = float(i);
    float2 newp = p;
    newp.x += (0.45 / fi) * cos(fi * p.y + ta + 0.23 * fi);
    newp.y += (0.45 / fi) * sin(fi * p.x + tb + 0.23 * (fi - 66.0));
    p = newp;
  }

  float3 col = float3(
    0.5 * sin(p.x) + 0.5,
    0.5 * sin(p.y) + 0.5,
    0.5 * sin(p.x + p.y) + 0.5
  );
  float t = clamp(dot(col, float3(0.299, 0.587, 0.114)), 0.0, 1.0);
  return half4(t, t, t, 1.0);
}
`;

// ============================================================================
// 1c. COLOR — thickness → iridescent color
// ============================================================================

/**
 * Shared thickness → color function, spliced into every shader that colors
 * a film (`SOAP_COLOR` here, the bubble's film overlay in liquid-bubble-live)
 * so the palettes can never drift apart.
 *
 * CONTRACT: the host shader must declare `uniform shader ramp;` (the 20x1
 * LUT from `getSoapFilmRampImage`) before splicing this in.
 *
 * `cosTheta` shortens the optical path (≈ thickness · cosθ) in every mode, so
 * a consumer with a real per-pixel view angle (a bubble's shell tilt) gets
 * colors that shift toward the rim. 1 = flat, face-on.
 */
export const SOAP_FILM_COLOR_FN = `
float3 soapFilmColor(float t, float mode, float scale, float cosTheta) {
  const float PI = 3.14159265359;
  float path = t * cosTheta;

  if (mode < 0.5) {
    // Ramp LUT: wrap around the 20-stop strip, sampled in the image's own
    // pixel space (repeat in x).
    float u = fract(path * scale);
    half4 rampCol = ramp.eval(float2(u * 20.0, 0.5));
    return pow(float3(rampCol.rgb), float3(0.8));
  }
  if (mode > 1.5) {
    // Bubble palette: the exact cosine film used by liquid-bubble-live.
    return 0.5 + 0.5 * cos(2.0 * PI * path * scale + float3(0.0, 2.1, 4.2));
  }
  // Physically-approximated thin-film interference: reflectance per channel
  // at lambda = (650, 532, 450) nm, film index n ~= 1.33.
  // R = sin^2(2*pi*n*d / lambda) — d = 0 goes black (the squared sine
  // already folds in the single phase flip, since sin(x + pi)^2 == sin(x)^2).
  float d = path * scale; // nm
  float3 lambda = float3(650.0, 532.0, 450.0);
  float3 R = sin((2.0 * PI * 1.33 * d) / lambda);
  return R * R;
}
`;

export const SOAP_COLOR = `
uniform shader thickness;
uniform shader ramp;
uniform float uMode;          // 0 = ramp LUT, 1 = physical thin-film, 2 = bubble palette
uniform float uThicknessScale;
uniform float uCosTheta;
uniform float uIntensity;
uniform float uOpacity;       // film alpha, 0..1 (output is premultiplied)

${SOAP_FILM_COLOR_FN}

half4 main(float2 fragCoord) {
  float t = float(thickness.eval(fragCoord).r);
  float3 color = soapFilmColor(t, uMode, uThicknessScale, uCosTheta) * uIntensity;

  // Premultiplied: Skia shaders output premul alpha, so scale rgb too.
  float a = clamp(uOpacity, 0.0, 1.0);
  return half4(clamp(color, 0.0, 1.0) * a, a);
}
`;

// ============================================================================
// COMPILED EFFECTS
// ============================================================================

export const soapThicknessEffect = makeEffect("SOAP_THICKNESS", SOAP_THICKNESS);
export const soapThicknessSineEffect = makeEffect(
  "SOAP_THICKNESS_SINE",
  SOAP_THICKNESS_SINE,
);
export const soapColorEffect = makeEffect("SOAP_COLOR", SOAP_COLOR);

// ============================================================================
// 1d. RAMP IMAGE — 20x1 LUT, memoized
// ============================================================================

/** Iridescent ramp stops, RGB in [0,1], wraps back to the first entry. */
export const SOAP_RAMP_STOPS: readonly [number, number, number][] = [
  [0.33, 0.49, 0.5],
  [0.27, 0.33, 0.48],
  [0.74, 0.77, 0.81],
  [0.81, 0.58, 0.21],
  [0.37, 0.44, 0.13],
  [0.0, 0.18, 0.72],
  [0.27, 0.74, 0.59],
  [0.87, 0.67, 0.16],
  [0.89, 0.12, 0.43],
  [0.11, 0.13, 0.8],
  [0.0, 0.6, 0.28],
  [0.55, 0.68, 0.15],
  [1.0, 0.24, 0.62],
  [0.53, 0.15, 0.59],
  [0.0, 0.48, 0.21],
  [0.18, 0.62, 0.38],
  [0.8, 0.37, 0.59],
  [0.77, 0.23, 0.39],
  [0.27, 0.38, 0.32],
  [0.1, 0.53, 0.5],
];

let cachedRampImage: SkImage | null = null;

/**
 * Builds (and memoizes) the 20x1 RGBA8 ramp image used by `SOAP_COLOR`'s
 * ramp mode. Safe to call from a React component body — the module-level
 * cache means only the first call ever allocates.
 */
export function getSoapFilmRampImage(): SkImage {
  if (cachedRampImage) return cachedRampImage;

  const width = SOAP_RAMP_STOPS.length;
  const bytes = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const [r, g, b] = SOAP_RAMP_STOPS[i];
    bytes[i * 4] = Math.round(r * 255);
    bytes[i * 4 + 1] = Math.round(g * 255);
    bytes[i * 4 + 2] = Math.round(b * 255);
    bytes[i * 4 + 3] = 255;
  }

  const image = Skia.Image.MakeImage(
    {
      width,
      height: 1,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    },
    Skia.Data.fromBytes(bytes),
    width * 4,
  );
  if (!image) {
    throw new Error("soapFilm.ts: failed to build the soap-film ramp image");
  }

  cachedRampImage = image;
  return image;
}
