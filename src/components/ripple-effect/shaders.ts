import { Skia } from "@shopify/react-native-skia";

// ============================================================================
// Bouncy Ripple Shader
// ============================================================================

/**
 * A water ripple shader that creates bouncy, reflective waves from a tap point.
 *
 * Uniforms:
 * - u_resolution: Canvas size in pixels [width, height]
 * - u_center: Normalized tap position [0-1, 0-1]
 * - u_time: Current time in seconds
 * - u_tapTime: Time when tap occurred in seconds
 *
 * The shader creates two wave components:
 * 1. Outward wave: Expands from tap point with sinusoidal oscillation
 * 2. Reflected wave: Bounces back from the furthest edge
 *
 * Both waves decay exponentially for natural damping.
 */
export const BouncyRippleShader = Skia.RuntimeEffect.Make(`
  uniform shader image;
  uniform float2 u_resolution;
  uniform float2 u_center;
  uniform float u_time;
  uniform float u_tapTime;

  // Calculate max distance from tap to any corner (for reflection timing)
  float maxRadius() {
    float2 toTL = float2(0.0, 0.0) - u_center;
    float2 toTR = float2(1.0, 0.0) - u_center;
    float2 toBL = float2(0.0, 1.0) - u_center;
    float2 toBR = float2(1.0, 1.0) - u_center;

    float aspect = u_resolution.x / u_resolution.y;
    toTL.x *= aspect;
    toTR.x *= aspect;
    toBL.x *= aspect;
    toBR.x *= aspect;

    return max(
      max(length(toTL), length(toTR)),
      max(length(toBL), length(toBR))
    );
  }

  half4 main(float2 fragCoord) {
    // Normalize coordinates
    float2 uv = fragCoord / u_resolution;
    float2 p = uv - u_center;

    // Aspect-correct distance calculation
    float aspect = u_resolution.x / u_resolution.y;
    float2 p_radius = float2(p.x * aspect, p.y);
    float r = length(p_radius);
    float maxR = maxRadius();

    // Time since tap
    float globalTime = max(u_time - u_tapTime, 0.0);

    // Wave parameters
    float speed = 0.65;
    float frequency = 18.0;
    float decay = 3.5;
    float amplitude = 0.05;

    // Outward wave
    float delayOut = r / speed;
    float tOut = max(globalTime - delayOut, 0.0);
    float waveOut = sin(tOut * frequency) * exp(-tOut * decay);

    // Reflected wave (from edge)
    float distFromEdge = maxR - r;
    float delayIn = distFromEdge / speed;
    float tIn = max(globalTime - delayIn, 0.0);
    float waveIn = sin(tIn * frequency + 3.14159) * exp(-tIn * decay) * 0.45;

    // Combine waves with crest sharpening
    float rawWave = waveOut + waveIn;
    float crest = pow(max(rawWave, 0.0), 1.8);
    float wave = crest + rawWave * 0.25;

    // Apply refraction
    float2 dir = (r > 0.0001) ? normalize(p) : float2(0.0);
    float2 refractUV = uv + dir * wave * amplitude;

    return image.eval(refractUV * u_resolution);
  }
`)!;

// ============================================================================
// Prism Effect Shader (Coming Soon)
// ============================================================================

/**
 * EARLY ACCESS PREVIEW
 *
 * A prismatic light dispersion shader that splits light into rainbow colors.
 * Creates chromatic aberration effects based on touch interaction.
 *
 * Features:
 * - RGB channel separation with angular dispersion
 * - Touch-reactive prism positioning
 * - Animated light beam direction
 * - Realistic refraction indices per wavelength
 *
 * Coming soon to quattro4maggi members.
 */

export const BouncyRipplePrismShader = Skia.RuntimeEffect.Make(`uniform shader image;
  uniform float2 u_resolution;
  uniform float2 u_center;   // normalized [0..1]
  uniform float  u_time;     // seconds since tap
  uniform float  u_tapTime;  // Tap time 


  float maxRadius() {
      float2 toTL = float2(0.0, 0.0) - u_center;
      float2 toTR = float2(1.0, 0.0) - u_center;
      float2 toBL = float2(0.0, 1.0) - u_center;
      float2 toBR = float2(1.0, 1.0) - u_center;

      toTL.x *= u_resolution.x / u_resolution.y;
      toTR.x *= u_resolution.x / u_resolution.y;
      toBL.x *= u_resolution.x / u_resolution.y;
      toBR.x *= u_resolution.x / u_resolution.y;

      return max(
          max(length(toTL), length(toTR)),
          max(length(toBL), length(toBR))
      );
  }



  half4 main(float2 fragCoord) {

      // --- UV setup
      float2 uv = fragCoord / u_resolution;
      float2 p  = uv - u_center;
      // Aspect correction
      // p.x *= u_resolution.x / u_resolution.y;
  float aspect = u_resolution.x / u_resolution.y;
  float2 p_radius = float2(p.x * aspect, p.y); // used for r
  float r = length(p_radius);
      // float r = length(p);
      float maxR = maxRadius();

          // --- GLOBAL TIME (elapsed since tap)
      float globalTime = max(u_time - u_tapTime, 0.0);

      // --- Wave parameters (tweak these)
      float speed     = 0.65;   // propagation speed
      float frequency = 18.0;   // oscillation frequency
      float decay     = 3.5;    // damping
      float amplitude = 0.05;  // refraction strength

      // --- Time delay per pixel
      float delayOut = r / speed;
      float tOut = max(globalTime - delayOut, 0.0);

      // --- Oscillating wave (THIS is the bounce)
      float waveOut =
          sin(tOut * frequency) *
          exp(-tOut * decay);

      // --- Reflected wave
      
      float distFromEdge = maxR - r;
      float delayIn = distFromEdge / speed;
      float tIn = max(globalTime - delayIn, 0.0);

      float waveIn =
          sin(tIn * frequency + 3.14159) *
          exp(-tIn * decay) *
          0.45;

      float rawWave = waveOut + waveIn;

      // UIKit-style crest sharpening
      float crest = max(rawWave, 0.0);
      crest = pow(crest, 1.8);

      float wave = crest + rawWave * 0.25;
      //============================================//
      // ----------------------------
      // CREST ENERGY (shared signal)
      // ----------------------------
      float crestEnergy = clamp(crest * exp(-r * 2.5), 0.0, 1.0);
      crestEnergy = pow(crestEnergy, 1.4);

      // ----------------------------
      // DISPERSION (prism strength)
      // ----------------------------
      float dispersion = crestEnergy * 0.018;

      // ----------------------------
      // SPECULAR MASK
      // ----------------------------
      float specular =
          smoothstep(0.12, 0.32, crestEnergy);
      specular *= exp(-r * 1.8);


      // --- Radial direction
      // --- Refraction ONLY (image stays stable)
      float2 dir = (r > 0.0001) ? normalize(p) : float2(0.0);
      // float2 refractUV = uv + dir * wave * amplitude;
      float2 refractR = uv + dir * (wave * amplitude + dispersion);
      float2 refractG = uv + dir * (wave * amplitude);
      float2 refractB = uv + dir * (wave * amplitude - dispersion);
      
      // half4 color = image.eval(refractUV * u_resolution);
      half3 refracted = half3(
          image.eval(refractR * u_resolution).r,
          image.eval(refractG * u_resolution).g,
          image.eval(refractB * u_resolution).b
);
half alpha = image.eval(refractG * u_resolution).a;


      // Thin white highlight
      half3 highlight = half3(1.0) * specular * 0.25;

      // Final composite
      half3 finalColor = refracted + highlight;

      // return half4(crestEnergy, crestEnergy, crestEnergy, 1.0);
      // return half4(specular, specular, specular, 1.0);
      // return half4(dispersion * 40.0, dispersion * 40.0, dispersion * 40.0, 1.0);

      return half4(finalColor, alpha);
      }`);

// export const PrismEffectShader = Skia.RuntimeEffect.Make(`...`)!;
