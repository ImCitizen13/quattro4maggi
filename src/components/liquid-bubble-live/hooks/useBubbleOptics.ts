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
  PRISM_PALETTE,
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
  /** `iPalette`: prism colors, 0 = hue wheel · 1 = poster bands. */
  palette: SharedValue<number>;
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
  /**
   * Per-demo starting values, overriding the shared `bubbleModes` defaults for
   * the levers named. They seed BOTH the live shared values AND the returned
   * `defaults`, so a tuning panel's Reset returns to THIS demo's look rather
   * than the global one. Omit it and nothing changes. `overrides.refract`
   * WINS over the standalone `refract` param when both are given.
   */
  overrides?: Partial<BubbleOpticsValues>;
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
  iPalette: number;
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
  overrides,
}: UseBubbleOpticsParams): UseBubbleOpticsResult {
  const refractInitial = overrides?.refract ?? refractDefault;
  const falloffInitial = overrides?.falloff ?? OPTICS_FALLOFF;
  const lensInitial = overrides?.lens ?? LENS;
  const dispersionInitial = overrides?.dispersion ?? DISPERSION;
  const edgeWidthInitial = overrides?.edgeWidth ?? EDGE_WIDTH;
  const filmInitial = overrides?.film ?? FILM;
  const filmReachInitial = overrides?.filmReach ?? FILM_REACH;
  const filmScaleInitial = overrides?.filmScale ?? FILM_SCALE;
  const tintInitial = overrides?.tint ?? TINT;
  const specularInitial = overrides?.specular ?? SPECULAR;
  const rimDarkInitial = overrides?.rimDark ?? RIM_DARK;
  const rimWidthInitial = overrides?.rimWidth ?? RIM_WIDTH;
  const rainbowMixInitial = overrides?.rainbowMix ?? RAINBOW_MIX;
  const rainbowGlowInitial = overrides?.rainbowGlow ?? RAINBOW_GLOW;
  const haloSpreadInitial = overrides?.haloSpread ?? HALO_SPREAD;
  const haloOpacityInitial = overrides?.haloOpacity ?? HALO_OPACITY;
  const paletteInitial = overrides?.palette ?? PRISM_PALETTE;

  const refract = useSharedValue(refractInitial);
  const falloff = useSharedValue(falloffInitial);
  const lens = useSharedValue(lensInitial);
  const dispersion = useSharedValue(dispersionInitial);
  const edgeWidth = useSharedValue(edgeWidthInitial);
  const film = useSharedValue(filmInitial);
  const filmReach = useSharedValue(filmReachInitial);
  const filmScale = useSharedValue(filmScaleInitial);
  const tint = useSharedValue(tintInitial);
  const specular = useSharedValue(specularInitial);
  const rimDark = useSharedValue(rimDarkInitial);
  const rimWidth = useSharedValue(rimWidthInitial);
  const rainbowMix = useSharedValue(rainbowMixInitial);
  const rainbowGlow = useSharedValue(rainbowGlowInitial);
  const haloSpread = useSharedValue(haloSpreadInitial);
  const haloOpacity = useSharedValue(haloOpacityInitial);
  const palette = useSharedValue(paletteInitial);

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
    iPalette: palette.value,
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
      palette,
    },
    defaults: {
      refract: refractInitial,
      falloff: falloffInitial,
      lens: lensInitial,
      dispersion: dispersionInitial,
      edgeWidth: edgeWidthInitial,
      film: filmInitial,
      filmReach: filmReachInitial,
      filmScale: filmScaleInitial,
      tint: tintInitial,
      specular: specularInitial,
      rimDark: rimDarkInitial,
      rimWidth: rimWidthInitial,
      rainbowMix: rainbowMixInitial,
      rainbowGlow: rainbowGlowInitial,
      haloSpread: haloSpreadInitial,
      haloOpacity: haloOpacityInitial,
      palette: paletteInitial,
    },
    uniforms,
  };
}
