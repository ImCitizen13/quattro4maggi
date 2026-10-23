import { useSharedValue, type SharedValue } from "react-native-reanimated";
import type { LensTuneData } from "./gpuTypes";

// ============================================================================
// Lens tuning knobs (plain TS, JS thread only: no worklets here)
// ============================================================================

/** Knob names, in `LensTune` struct order. */
export const LENS_KEYS = [
  "einstein",
  "falloff",
  "chroma",
  "glow",
  "disc",
  "bubble",
  "refraction",
  "shapeN",
  "edge",
  "dispersion",
  "rim",
  "specular",
  "halo",
  "spread",
] as const;

export type LensKey = (typeof LENS_KEYS)[number];

export type LensPresetName = "Gravity" | "Gargantua" | "Both";

export type LensTuneValues = Record<LensKey, SharedValue<number>>;

export type LensSpec = {
  label: string;
  min: number;
  max: number;
  decimals: number;
  group: "gravity" | "glass";
};

export const LENS_DEFAULTS: LensTuneData = {
  einstein: 1.8,
  falloff: 6,
  chroma: 0.03,
  glow: 1,
  disc: 1,
  bubble: 2.8,
  refraction: 0.5,
  shapeN: 2,
  edge: 0.1,
  dispersion: 0.9,
  rim: 0.15,
  specular: 1,
  halo: 0.15,
  spread: 0.2,
};

export const LENS_SPEC: Record<LensKey, LensSpec> = {
  einstein: { label: "Einstein ×", min: 0, max: 4, decimals: 2, group: "gravity" },
  falloff: { label: "Falloff ×", min: 1, max: 20, decimals: 1, group: "gravity" },
  chroma: { label: "Chroma", min: 0, max: 0.2, decimals: 3, group: "gravity" },
  glow: { label: "Glow", min: 0, max: 3, decimals: 2, group: "gravity" },
  disc: { label: "Disc ×", min: 0, max: 1.5, decimals: 2, group: "gravity" },
  bubble: { label: "Bubble ×", min: 0, max: 8, decimals: 2, group: "glass" },
  refraction: { label: "Refraction", min: -2, max: 2, decimals: 2, group: "glass" },
  shapeN: { label: "Shape n", min: 1, max: 16, decimals: 1, group: "glass" },
  edge: { label: "Edge", min: 0, max: 0.5, decimals: 2, group: "glass" },
  dispersion: { label: "Dispersion", min: 0, max: 2, decimals: 2, group: "glass" },
  rim: { label: "Rim", min: 0, max: 1, decimals: 2, group: "glass" },
  specular: { label: "Specular", min: 0, max: 2, decimals: 2, group: "glass" },
  halo: { label: "Halo", min: 0, max: 1, decimals: 2, group: "glass" },
  spread: { label: "Spread", min: 0, max: 1, decimals: 2, group: "glass" },
};

export const LENS_PRESETS: Record<LensPresetName, LensTuneData> = {
  Both: LENS_DEFAULTS,
  Gravity: { ...LENS_DEFAULTS, bubble: 0 },
  Gargantua: { ...LENS_DEFAULTS, einstein: 0, chroma: 0, glow: 0, disc: 0 },
};

/** One SharedValue per knob, seeded with the defaults. */
export const useLensTune = (): LensTuneValues => ({
  einstein: useSharedValue(LENS_DEFAULTS.einstein),
  falloff: useSharedValue(LENS_DEFAULTS.falloff),
  chroma: useSharedValue(LENS_DEFAULTS.chroma),
  glow: useSharedValue(LENS_DEFAULTS.glow),
  disc: useSharedValue(LENS_DEFAULTS.disc),
  bubble: useSharedValue(LENS_DEFAULTS.bubble),
  refraction: useSharedValue(LENS_DEFAULTS.refraction),
  shapeN: useSharedValue(LENS_DEFAULTS.shapeN),
  edge: useSharedValue(LENS_DEFAULTS.edge),
  dispersion: useSharedValue(LENS_DEFAULTS.dispersion),
  rim: useSharedValue(LENS_DEFAULTS.rim),
  specular: useSharedValue(LENS_DEFAULTS.specular),
  halo: useSharedValue(LENS_DEFAULTS.halo),
  spread: useSharedValue(LENS_DEFAULTS.spread),
});

/** Set every knob to a preset (plain set, JS side). */
export const applyLensPreset = (values: LensTuneValues, preset: LensPresetName) => {
  const next = LENS_PRESETS[preset];
  for (const key of LENS_KEYS) values[key].value = next[key];
};
