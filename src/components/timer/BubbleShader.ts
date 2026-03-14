import { Skia } from "@shopify/react-native-skia";




export const BubbleShader = Skia.RuntimeEffect.Make(`uniform shader image;
    uniform float2 u_resolution;         // canvas size in pixels
    uniform float2 u_center;             // ripple origin, normalized [0..1]
    uniform float  u_time;               // current time in seconds
    uniform float  u_tapTime;            // time when reveal started (-1 if not started)
    uniform float  u_revealEdge;         // soft edge width for reveal/collapse transition (seconds)
    uniform float  u_speed;              // wave propagation speed (higher = faster)
    uniform float  u_collapseStartTime;  // time when collapse started (-1 if not started)
    uniform float  u_dispersionStrength; // chromatic aberration / prism strength (e.g. 0.035)
    uniform float  u_amplitude;          // wave refraction displacement strength (e.g. 0.01)
    uniform float3 u_prismTint;          // additive color tint at wave front (RGB 0-1)
    uniform float3 u_background;         // background color when hidden (RGB 0-1)


    // Calculate maximum radius from center to farthest corner (aspect-corrected)
    // Used to determine when the wave has fully covered/uncovered the canvas
    float maxRadius() {
        float2 toTL = float2(0.0, 0.0) - u_center;
        float2 toTR = float2(1.0, 0.0) - u_center;
        float2 toBL = float2(0.0, 1.0) - u_center;
        float2 toBR = float2(1.0, 1.0) - u_center;

        // Apply aspect correction so circles look circular
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
        // ============================================================
        // UV AND POSITION SETUP
        // ============================================================
        float2 uv = fragCoord / u_resolution;  // normalized pixel position [0..1]
        float2 p  = uv - u_center;             // vector from center to current pixel

        // Aspect correction: make circles look circular on non-square canvases
        float aspect = u_resolution.x / u_resolution.y;
        float2 p_radius = float2(p.x * aspect, p.y);
        float r = length(p_radius);  // distance from center (aspect-corrected)
        float maxR = maxRadius();    // max distance to any corner

        // ============================================================
        // EARLY EXIT: Not started yet (image fully hidden)
        // ============================================================
        if (u_tapTime < 0.0) {
            return half4(half3(u_background), 1.0);
        }

        // ============================================================
        // WAVE PARAMETERS
        // ============================================================
        float globalTime = u_time - u_tapTime;       // time since reveal started
        float speed      = max(u_speed, 0.01);       // wave speed (avoid div by zero)
        float frequency  = 18.0;                     // oscillation frequency (bounces)
        float decay      = 3.5;                      // how fast oscillation dies out
        float amplitude  = u_amplitude;              // refraction displacement strength

        // ============================================================
        // OUTWARD WAVE (CENTER → EDGES) - REVEAL
        // ============================================================
        // delayOut: time for wave to reach this pixel (farther = later)
        float delayOut = r / speed;
        float tOut = max(globalTime - delayOut, 0.0);  // local time since wave arrived

        // Reveal mask: 0 = hidden, 1 = revealed (soft edge via smoothstep)
        float reveal = smoothstep(delayOut - u_revealEdge, delayOut + u_revealEdge, globalTime);

        // Front band: restricts effects to the wave front only
        // Gaussian-like falloff from the wave position
        float bandSharpness = 8.0;
        float frontBand = exp(-abs(globalTime - delayOut) * bandSharpness);

        // Oscillating outward wave (bouncy ripple)
        float waveOut = sin(tOut * frequency) * exp(-tOut * decay);

        // ============================================================
        // INWARD TIMING (for collapse, computed here for reuse)
        // ============================================================
        // delayIn: time for inward wave to reach this pixel from edges
        float distFromEdge = maxR - r;
        float delayIn = distFromEdge / speed;

        // ============================================================
        // WAVE SHAPING (UIKit-style crest sharpening)
        // ============================================================
        float rawWave = waveOut;
        float crest = pow(max(rawWave, 0.0), 1.8);  // sharpen positive crests
        float wave = crest + rawWave * 0.25;       // blend sharp + smooth

        // ============================================================
        // CREST ENERGY (drives dispersion, specular, prism tint)
        // ============================================================
        // Stronger near center, fades with distance
        float crestEnergy = clamp(crest * exp(-r * 2.5), 0.0, 1.0);
        crestEnergy = pow(crestEnergy, 1.1);

        // ============================================================
        // DISPERSION (chromatic aberration / prism refraction)
        // ============================================================
        float dispersion = crestEnergy * u_dispersionStrength;

        // ============================================================
        // SPECULAR HIGHLIGHT (white glint at wave front)
        // ============================================================
        float specular = smoothstep(0.12, 0.32, crestEnergy);
        specular *= exp(-r * 1.8);    // fade with distance
        specular *= frontBand;         // only at wave front

        // ============================================================
        // REFRACTION (sample image at offset UVs for ripple effect)
        // ============================================================
        // dir: outward radial direction from center
        float waveEffective = wave * frontBand;
        float2 dir = (r > 0.0001) ? normalize(p) : float2(0.0);

        // Offset R/G/B channels differently for chromatic aberration
        float2 refractR = clamp(uv + dir * (waveEffective * amplitude + dispersion * frontBand), 0.0, 1.0);
        float2 refractG = clamp(uv + dir * (waveEffective * amplitude), 0.0, 1.0);
        float2 refractB = clamp(uv + dir * (waveEffective * amplitude - dispersion * frontBand), 0.0, 1.0);

        // Sample each color channel at its offset position
        half3 refracted = half3(
            image.eval(refractR * u_resolution).r,
            image.eval(refractG * u_resolution).g,
            image.eval(refractB * u_resolution).b
        );
        half3 cleanColor = image.eval(uv * u_resolution).rgb;  // unrefracted image

        // ============================================================
        // REVEAL FOREGROUND COMPOSITE
        // ============================================================
        half3 highlight = half3(1.0) * specular * 0.25;                    // white specular
        half3 prismTintReveal = half3(u_prismTint) * crestEnergy * frontBand;  // color tint

        // Blend: clean image far from front, refracted at front, plus highlights
        half3 foregroundReveal = mix(cleanColor, refracted, frontBand) + highlight + prismTintReveal;
        half3 background = half3(u_background);

        // ============================================================
        // COLLAPSE (EDGES → CENTER) - INWARD WAVE
        // ============================================================
        if (u_collapseStartTime >= 0.0) {
            float globalCollapseTime = u_time - u_collapseStartTime;  // time since collapse started

            // Hidden mask: 0 = visible, 1 = hidden (inward from edges)
            // Offset so the wave front (refraction/prism) is visible BEFORE we hide;
            // otherwise the region would go to background before the ripple is seen.
            float collapseVisibleOffset = 0.12;  // seconds the wave front stays visible before hide
            float hidden = smoothstep(
                delayIn + collapseVisibleOffset - u_revealEdge,
                delayIn + collapseVisibleOffset + u_revealEdge,
                globalCollapseTime
            );
            float visible = reveal * (1.0 - hidden);  // combine reveal and collapse masks

            // Collapse front band: where the inward wave currently is
            float tInCollapse = max(globalCollapseTime - delayIn, 0.0);
            float frontBandCollapse = exp(-abs(globalCollapseTime - delayIn) * bandSharpness);

            // Inward oscillating wave (same formula as outward, but timed to edges)
            float waveInCollapse = sin(tInCollapse * frequency) * exp(-tInCollapse * decay);
            float rawWaveCollapse = waveInCollapse;
            float crestCollapse = pow(max(rawWaveCollapse, 0.0), 1.8);
            float waveCollapse = crestCollapse + rawWaveCollapse * 0.25;

            // Crest energy for collapse (stronger near edges for inward wave)
            float crestEnergyCollapse = pow(clamp(crestCollapse * exp(-(maxR - r) * 2.5), 0.0, 1.0), 1.1);

            // Dispersion and specular for collapse front
            float dispersionCollapse = crestEnergyCollapse * u_dispersionStrength;
            float specularCollapse = smoothstep(0.12, 0.32, crestEnergyCollapse) * exp(-(maxR - r) * 1.8) * frontBandCollapse;

            // Refraction direction: INWARD (-dir) since wave travels toward center
            float waveEffectiveCollapse = waveCollapse * frontBandCollapse;
            float2 dirCollapse = -dir;  // inward direction (opposite of reveal)

            // Offset R/G/B for inward chromatic aberration
            float2 refractR_c = clamp(uv + dirCollapse * (waveEffectiveCollapse * amplitude + dispersionCollapse * frontBandCollapse), 0.0, 1.0);
            float2 refractG_c = clamp(uv + dirCollapse * (waveEffectiveCollapse * amplitude), 0.0, 1.0);
            float2 refractB_c = clamp(uv + dirCollapse * (waveEffectiveCollapse * amplitude - dispersionCollapse * frontBandCollapse), 0.0, 1.0);

            // Sample refracted collapse colors
            half3 refractedCollapse = half3(
                image.eval(refractR_c * u_resolution).r,
                image.eval(refractG_c * u_resolution).g,
                image.eval(refractB_c * u_resolution).b
            );

            // Collapse specular and prism tint
            half3 highlightCollapse = half3(1.0) * specularCollapse * 0.25;
            half3 prismTintCollapse = half3(u_prismTint) * crestEnergyCollapse * frontBandCollapse;

            // Collapse foreground composite
            half3 collapseForeground = mix(cleanColor, refractedCollapse, frontBandCollapse) + highlightCollapse + prismTintCollapse;

            // Final blend: show collapse foreground (refraction/prism) at the wave front;
            // use frontBandCollapse so the ripple is visible before hidden pulls in background
            half3 foreground = mix(foregroundReveal, collapseForeground, frontBandCollapse);
            half3 finalColor = mix(background, foreground, visible);
            return half4(finalColor, visible);
        }

        // ============================================================
        // OUTPUT (reveal only, no collapse)
        // ============================================================
        half3 finalColor = mix(background, foregroundReveal, reveal);
        return half4(finalColor, reveal);
        }`)!;

