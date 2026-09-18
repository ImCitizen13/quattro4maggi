/**
 * Soap Film — builds the live `SharedValue`s behind `SoapFilmShader`'s
 * `flow`/`color` uniform groups, seeded from `soapFilmConfig.ts` defaults.
 * Design notes: README.md → "hooks/useSoapFilmUniforms.ts".
 */

import { useSharedValue, type SharedValue } from "react-native-reanimated";

import type {
  SoapFilmColorUniforms,
  SoapFilmFlowUniforms,
} from "../SoapFilmShader";
import {
  FILM_COS_THETA_DEFAULT,
  FILM_DRAINAGE_DEFAULT,
  FILM_INTENSITY_DEFAULT,
  FILM_LAYER_0_DEFAULT,
  FILM_LAYER_1_DEFAULT,
  FILM_LAYER_2_DEFAULT,
  FILM_MODE_DEFAULT,
  FILM_SEED_DEFAULT,
  FILM_SINE_FREQ_DEFAULT,
  FILM_SINE_SPEED_A_DEFAULT,
  FILM_SINE_SPEED_B_DEFAULT,
  FILM_SWIRL_DEFAULT,
  FILM_THICKNESS_SCALE_DEFAULT,
  FILM_TOUCH_RADIUS_DEFAULT,
  FILM_TOUCH_TAU_DEFAULT,
  type FilmLayer,
} from "../soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

/** Every tunable numeric default, keyed the same as the returned `SharedValue`s — used by "Reset all"/per-slider reset. */
export type SoapFilmUniformDefaults = {
  layer0: FilmLayer;
  layer1: FilmLayer;
  layer2: FilmLayer;
  swirl: number;
  seed: number;
  drainage: number;
  touchTau: number;
  touchRadius: number;
  sineFreq: number;
  sineSpeedA: number;
  sineSpeedB: number;
  mode: number;
  thicknessScale: number;
  cosTheta: number;
  intensity: number;
};

export type UseSoapFilmUniformsParams = {
  time: SharedValue<number>;
  size: SharedValue<[number, number]>;
  touch: SharedValue<number[]>;
  touchAge: SharedValue<number[]>;
};

export type UseSoapFilmUniformsReturn = {
  flow: SoapFilmFlowUniforms;
  color: SoapFilmColorUniforms;
  defaults: SoapFilmUniformDefaults;
};

// ============================================================================
// Defaults (exported so the tuning panel's "Reset all" doesn't duplicate them)
// ============================================================================

export const SOAP_FILM_DEFAULTS: SoapFilmUniformDefaults = {
  layer0: FILM_LAYER_0_DEFAULT,
  layer1: FILM_LAYER_1_DEFAULT,
  layer2: FILM_LAYER_2_DEFAULT,
  swirl: FILM_SWIRL_DEFAULT,
  seed: FILM_SEED_DEFAULT,
  drainage: FILM_DRAINAGE_DEFAULT,
  touchTau: FILM_TOUCH_TAU_DEFAULT,
  touchRadius: FILM_TOUCH_RADIUS_DEFAULT,
  sineFreq: FILM_SINE_FREQ_DEFAULT,
  sineSpeedA: FILM_SINE_SPEED_A_DEFAULT,
  sineSpeedB: FILM_SINE_SPEED_B_DEFAULT,
  mode: FILM_MODE_DEFAULT === "physical" ? 1 : 0,
  thicknessScale: FILM_THICKNESS_SCALE_DEFAULT,
  cosTheta: FILM_COS_THETA_DEFAULT,
  intensity: FILM_INTENSITY_DEFAULT,
};

// ============================================================================
// Hook
// ============================================================================

export function useSoapFilmUniforms({
  time,
  size,
  touch,
  touchAge,
}: UseSoapFilmUniformsParams): UseSoapFilmUniformsReturn {
  const layer0 = useSharedValue<FilmLayer>(SOAP_FILM_DEFAULTS.layer0);
  const layer1 = useSharedValue<FilmLayer>(SOAP_FILM_DEFAULTS.layer1);
  const layer2 = useSharedValue<FilmLayer>(SOAP_FILM_DEFAULTS.layer2);
  const swirl = useSharedValue<number>(SOAP_FILM_DEFAULTS.swirl);
  const seed = useSharedValue<number>(SOAP_FILM_DEFAULTS.seed);
  const drainage = useSharedValue<number>(SOAP_FILM_DEFAULTS.drainage);
  const touchTau = useSharedValue<number>(SOAP_FILM_DEFAULTS.touchTau);
  const touchRadius = useSharedValue<number>(SOAP_FILM_DEFAULTS.touchRadius);

  const sineFreq = useSharedValue<number>(SOAP_FILM_DEFAULTS.sineFreq);
  const sineSpeedA = useSharedValue<number>(SOAP_FILM_DEFAULTS.sineSpeedA);
  const sineSpeedB = useSharedValue<number>(SOAP_FILM_DEFAULTS.sineSpeedB);
  const sineOffset = useSharedValue<[number, number]>([0, 0]);

  const mode = useSharedValue<number>(SOAP_FILM_DEFAULTS.mode);
  const thicknessScale = useSharedValue<number>(
    SOAP_FILM_DEFAULTS.thicknessScale,
  );
  const cosTheta = useSharedValue<number>(SOAP_FILM_DEFAULTS.cosTheta);
  const intensity = useSharedValue<number>(SOAP_FILM_DEFAULTS.intensity);

  const flow: SoapFilmFlowUniforms = {
    time,
    size,
    layer0,
    layer1,
    layer2,
    swirl,
    seed,
    drainage,
    touch,
    touchAge,
    touchTau,
    touchRadius,
    sineFreq,
    sineSpeedA,
    sineSpeedB,
    sineOffset,
  };

  const color: SoapFilmColorUniforms = {
    mode,
    thicknessScale,
    cosTheta,
    intensity,
  };

  return { flow, color, defaults: SOAP_FILM_DEFAULTS };
}
