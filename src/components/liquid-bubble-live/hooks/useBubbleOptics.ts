/**
 * useBubbleOptics — live "look" levers and shader uniforms.
 * Design notes: README.md → "hooks/useBubbleOptics.ts".
 */

import {
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  DISPERSION,
  EDGE_WIDTH,
  FILM,
  FILM_REACH,
  FILM_SCALE,
  HALO_OPACITY,
  HALO_SPREAD,
  LENS,
  OPTICS_FALLOFF,
  PARAM_FLOATS,
  RAINBOW_GLOW,
  RAINBOW_MIX,
  REFRACT,
  RIM_DARK,
  RIM_WIDTH,
  SPECULAR,
  TINT,
} from "../bubbleModes";

// ============================================================================
// Types
// ============================================================================

/** Live optics levers, each written by a tuning slider. */
export type BubbleOptics = {
  /** `iRefract`: rim refraction offset along the normal, pt. */
  refract: SharedValue<number>;
  /** `iOptics.w`: optics falloff exponent (> 0). */
  falloff: SharedValue<number>;
  /** `iLens.x`: radial warp, fraction of R. + magnify, − pincushion. */
  lens: SharedValue<number>;
  /** `iLens.y`: rim chromatic aberration, fraction of R. */
  dispersion: SharedValue<number>;
  /** `iLens.z`: rim band width, fraction of radius (> 0). */
  edgeWidth: SharedValue<number>;
  /** `iFilm`: iridescence strength, 0..1. */
  film: SharedValue<number>;
  /** Soap-film overlay reach: 0 rim only · 1 whole bubble. Overlay-only, not a bubble uniform. */
  filmReach: SharedValue<number>;
  /** `iOptics.z`: thin-film band count. */
  filmScale: SharedValue<number>;
  /** `iColor.a`: tint weight, 0..1. */
  tint: SharedValue<number>;
  /** `iLens.w`: specular highlight strength. */
  specular: SharedValue<number>;
  /** `iOptics.x`: rim line darkness, 0..1. */
  rimDark: SharedValue<number>;
  /** `iOptics.y`: rim line width, pt (> 0). */
  rimWidth: SharedValue<number>;
  /** `iPrism.x`: angular rainbow mixed into the rim band. */
  rainbowMix: SharedValue<number>;
  /** `iPrism.y`: additive rainbow glow on the rim band. */
  rainbowGlow: SharedValue<number>;
  /** `iPrism.z`: halo reach outside the rim, fraction of R (> 0). */
  haloSpread: SharedValue<number>;
  /** `iPrism.w`: halo opacity, signed (− dark, + light). */
  haloOpacity: SharedValue<number>;
};

/** Plain-number snapshot of every lever (defaults, presets). */
export type BubbleOpticsValues = { [K in keyof BubbleOptics]: number };

export type UseBubbleOpticsParams = {
  /** 12-float `iParams` buffer from `useBubbleShape`. */
  paramBuffer: SharedValue<number[]>;
  /** Tint hue, rgb 0..1. The weight comes from `optics.tint`. */
  tintColor: readonly [number, number, number];
  /** Starting `iRefract`, pt. @default REFRACT */
  refract?: number;
};

/** Uniforms the Live bubble shader declares (see its `UNIFORM_NAMES`). */
export type BubbleUniforms = {
  iParams: number[];
  iColor: number[];
  iRefract: number;
  iFilm: number;
  iOptics: number[];
  iLens: number[];
  iPrism: number[];
};

export type UseBubbleOpticsResult = {
  optics: BubbleOptics;
  /** Values every lever resets to. */
  defaults: BubbleOpticsValues;
  uniforms: DerivedValue<BubbleUniforms>;
};

// ============================================================================
// Constants
// ============================================================================

const EMPTY_PARAM_BUFFER: number[] = new Array(PARAM_FLOATS).fill(0);

/**
 * The hard-coded style values of `gargantua-type-gpu/centerBubbleScene.ts`
 * (its SKSL `u_*` comments), mapped onto our levers. Only the levers that
 * scene has; everything else keeps its current value.
 */
export const GARGANTUA_PRESET: Partial<BubbleOpticsValues> = {
  lens: 0.5,
  dispersion: 0.9,
  edgeWidth: 0.1,
  specular: 1,
  rainbowMix: 0.15,
  rainbowGlow: 0.05,
  haloSpread: 0.2,
  haloOpacity: 0.15,
};

// ============================================================================
// Hook
// ============================================================================

export function useBubbleOptics({
  paramBuffer,
  tintColor,
  refract: refractDefault = REFRACT,
}: UseBubbleOpticsParams): UseBubbleOpticsResult {
  const refract = useSharedValue(refractDefault);
  const falloff = useSharedValue(OPTICS_FALLOFF);
  const lens = useSharedValue(LENS);
  const dispersion = useSharedValue(DISPERSION);
  const edgeWidth = useSharedValue(EDGE_WIDTH);
  const film = useSharedValue(FILM);
  const filmReach = useSharedValue(FILM_REACH);
  const filmScale = useSharedValue(FILM_SCALE);
  const tint = useSharedValue(TINT);
  const specular = useSharedValue(SPECULAR);
  const rimDark = useSharedValue(RIM_DARK);
  const rimWidth = useSharedValue(RIM_WIDTH);
  const rainbowMix = useSharedValue(RAINBOW_MIX);
  const rainbowGlow = useSharedValue(RAINBOW_GLOW);
  const haloSpread = useSharedValue(HALO_SPREAD);
  const haloOpacity = useSharedValue(HALO_OPACITY);

  const [red, green, blue] = tintColor;

  const uniforms = useDerivedValue(() => ({
    iParams:
      paramBuffer.value.length === PARAM_FLOATS
        ? paramBuffer.value
        : EMPTY_PARAM_BUFFER,
    iColor: [red, green, blue, tint.value],
    iRefract: refract.value,
    iFilm: film.value,
    iOptics: [rimDark.value, rimWidth.value, filmScale.value, falloff.value],
    iLens: [lens.value, dispersion.value, edgeWidth.value, specular.value],
    iPrism: [
      rainbowMix.value,
      rainbowGlow.value,
      haloSpread.value,
      haloOpacity.value,
    ],
  }));

  return {
    optics: {
      refract,
      falloff,
      lens,
      dispersion,
      edgeWidth,
      film,
      filmReach,
      filmScale,
      tint,
      specular,
      rimDark,
      rimWidth,
      rainbowMix,
      rainbowGlow,
      haloSpread,
      haloOpacity,
    },
    defaults: {
      refract: refractDefault,
      falloff: OPTICS_FALLOFF,
      lens: LENS,
      dispersion: DISPERSION,
      edgeWidth: EDGE_WIDTH,
      film: FILM,
      filmReach: FILM_REACH,
      filmScale: FILM_SCALE,
      tint: TINT,
      specular: SPECULAR,
      rimDark: RIM_DARK,
      rimWidth: RIM_WIDTH,
      rainbowMix: RAINBOW_MIX,
      rainbowGlow: RAINBOW_GLOW,
      haloSpread: HALO_SPREAD,
      haloOpacity: HALO_OPACITY,
    },
    uniforms,
  };
}
