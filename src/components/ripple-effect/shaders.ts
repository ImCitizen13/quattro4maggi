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
// export const PrismEffectShader = Skia.RuntimeEffect.Make(`...`)!;
