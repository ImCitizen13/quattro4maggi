/**
 * SoapFilmShader
 *
 * Reusable, mesh-decoupled soap-film iridescence as a Skia declarative
 * shader tree. Pipe-able two ways:
 * - as the paint shader child of any shape (`<Path>`, `<Fill>`, ...)
 * - as the child `uniform shader` of ANOTHER `<Shader>` (e.g. a future
 *   bubble shader taking `uniform shader film;`), because this component's
 *   root element is itself a `<Shader>`, not a `<Fill>`/`<Path>` wrapper.
 *
 * FLOW:
 * 1. `generator` picks the thickness stage: `SOAP_THICKNESS` (curl-noise,
 *    stateless advection) or `SOAP_THICKNESS_SINE` (iterative domain warp).
 * 2. `output="thickness"` returns that stage alone (raw scalar field, useful
 *    for debugging or for a consumer that wants to apply its own color).
 * 3. `output="color"` (default) wraps it in `SOAP_COLOR`, which also takes
 *    the 20x1 ramp image as a child shader.
 * 4. Every numeric uniform is a `SharedValue`, combined into `useDerivedValue`
 *    uniform objects — dragging a tuning slider never triggers a React
 *    re-render.
 *
 * KEY FEATURES:
 * - Thickness and color are structurally separate stages (two SkSL effects),
 *   matching the shader module's own split — see `src/lib/shaders/soapFilm.ts`.
 * - Ramp image is built once and memoized module-wide.
 */

import {
  FilterMode,
  ImageShader,
  MipmapMode,
  Shader,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import {
  useDerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  getSoapFilmRampImage,
  soapColorEffect,
  soapThicknessEffect,
  soapThicknessSineEffect,
} from "@/lib/shaders/soapFilm";

import {
  FILM_COS_THETA_DEFAULT,
  FILM_INTENSITY_DEFAULT,
  FILM_OPACITY_DEFAULT,
  FILM_THICKNESS_SCALE_DEFAULT,
  type FilmGenerator,
} from "./soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

/** Uniforms for both thickness generators (curl-noise + sine), all live. */
export type SoapFilmFlowUniforms = {
  /** Elapsed seconds, e.g. from a UI-thread clock. */
  time: SharedValue<number>;
  /** Canvas/shape size in points, `[width, height]`. */
  size: SharedValue<[number, number]>;
  /** Curl layer 0 `(frequency, speed, rotationAngle, weight)`. */
  layer0: SharedValue<[number, number, number, number]>;
  /** Curl layer 1. */
  layer1: SharedValue<[number, number, number, number]>;
  /** Curl layer 2. */
  layer2: SharedValue<[number, number, number, number]>;
  /** Global velocity-field multiplier. */
  swirl: SharedValue<number>;
  /** Domain offset. */
  seed: SharedValue<number>;
  /** Gravity: thins the film near the top. */
  drainage: SharedValue<number>;
  /** Flat `[x, y, vx, vy] * 8` touch ring buffer, points. */
  touch: SharedValue<number[]>;
  /** Flat `age * 8`, seconds since each impulse. */
  touchAge: SharedValue<number[]>;
  /** Touch decay time constant, seconds. */
  touchTau: SharedValue<number>;
  /** Touch gaussian falloff radius, normalized units. */
  touchRadius: SharedValue<number>;
  /** Band geometry: 0 horizontal, 1 rings around the apex. */
  bandShape: SharedValue<number>;
  /** Base pattern frequency; higher = finer marbling. */
  grain: SharedValue<number>;
  /** Vortices `(count, spin, radius, cycle)`. */
  vortex: SharedValue<[number, number, number, number]>;
  /** Sine generator: domain frequency multiplier. */
  sineFreq: SharedValue<number>;
  /** Sine generator: x-warp time speed. */
  sineSpeedA: SharedValue<number>;
  /** Sine generator: y-warp time speed. */
  sineSpeedB: SharedValue<number>;
  /** Sine generator: simple domain offset (may be driven by touch). */
  sineOffset: SharedValue<[number, number]>;
};

/** Uniforms for `SOAP_COLOR`. Omit entirely when `output="thickness"`. */
export type SoapFilmColorUniforms = {
  /** 0 = ramp LUT, 1 = physical thin-film, 2 = bubble palette. */
  mode: SharedValue<number>;
  /** Ramp wrap count (ramp mode) or film thickness in nm (physical mode). */
  thicknessScale: SharedValue<number>;
  /** View-angle cosine; 1 = flat screen. */
  cosTheta: SharedValue<number>;
  intensity: SharedValue<number>;
  /** Film alpha 0..1; output is premultiplied. */
  opacity: SharedValue<number>;
};

export type SoapFilmShaderProps = {
  /** Which thickness field drives the film. */
  generator: FilmGenerator;
  /** `"color"` (default) returns the full iridescent shader; `"thickness"` returns the raw scalar field. */
  output?: "color" | "thickness";
  flow: SoapFilmFlowUniforms;
  /** Required unless `output="thickness"`. */
  color?: SoapFilmColorUniforms;
};

// ============================================================================
// Component
// ============================================================================

export function SoapFilmShader({
  generator,
  output = "color",
  flow,
  color,
}: SoapFilmShaderProps) {
  const curlUniforms = useDerivedValue(() => ({
    iTime: flow.time.value,
    iSize: flow.size.value,
    uLayer0: flow.layer0.value,
    uLayer1: flow.layer1.value,
    uLayer2: flow.layer2.value,
    uSwirl: flow.swirl.value,
    uSeed: flow.seed.value,
    uDrainage: flow.drainage.value,
    uTouch: flow.touch.value,
    uTouchAge: flow.touchAge.value,
    uTouchTau: flow.touchTau.value,
    uTouchRadius: flow.touchRadius.value,
    uVortex: flow.vortex.value,
    uBandShape: flow.bandShape.value,
    uGrain: flow.grain.value,
  }));

  const sineUniforms = useDerivedValue(() => ({
    iTime: flow.time.value,
    iSize: flow.size.value,
    uSineFreq: flow.sineFreq.value,
    uSineSpeedA: flow.sineSpeedA.value,
    uSineSpeedB: flow.sineSpeedB.value,
    uSineOffset: flow.sineOffset.value,
  }));

  const colorUniforms = useDerivedValue(() => ({
    uMode: color ? color.mode.value : 0,
    uThicknessScale: color
      ? color.thicknessScale.value
      : FILM_THICKNESS_SCALE_DEFAULT,
    uCosTheta: color ? color.cosTheta.value : FILM_COS_THETA_DEFAULT,
    uIntensity: color ? color.intensity.value : FILM_INTENSITY_DEFAULT,
    uOpacity: color ? color.opacity.value : FILM_OPACITY_DEFAULT,
  }));

  const ramp = useMemo(() => getSoapFilmRampImage(), []);

  const thicknessEffect =
    generator === "sine" ? soapThicknessSineEffect : soapThicknessEffect;
  const thicknessUniforms = generator === "sine" ? sineUniforms : curlUniforms;

  if (output === "thickness") {
    return <Shader source={thicknessEffect} uniforms={thicknessUniforms} />;
  }

  return (
    <Shader source={soapColorEffect} uniforms={colorUniforms}>
      <Shader source={thicknessEffect} uniforms={thicknessUniforms} />
      <ImageShader
        image={ramp}
        tx="repeat"
        ty="clamp"
        fit="none"
        sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
      />
    </Shader>
  );
}
