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
  "bubble",
  "refraction",
  "shapeN",
  "edge",
  "dispersion",
  "rim",
  "specular",
  "halo",
  "spread",
  "rimR",
  "rimG",
  "rimB",
  "haloR",
  "haloG",
  "haloB",
  "specR",
  "specG",
  "specB",
  "rainbow",
] as const;

export type LensKey = (typeof LENS_KEYS)[number];

export type LensPresetName = "Gravity" | "Gargantua" | "Both";

export type LensTuneValues = Record<LensKey, SharedValue<number>>;

export type LensSpec = {
  label: string;
  min: number;
  max: number;
  decimals: number;
  /** "color" channels have no slider: they are driven by the color strings. */
  group: "gravity" | "glass" | "color";
};

// ============================================================================
// Color strings (rim / halo / specular)
// ============================================================================

export type LensColorName = "rim" | "halo" | "spec";

export const LENS_COLOR_NAMES: readonly LensColorName[] = ["rim", "halo", "spec"];

/** Default color strings (all white, matching the original look). */
export const LENS_COLOR_DEFAULTS: Record<LensColorName, string> = {
  rim: "#ffffff",
  halo: "#ffffff",
  spec: "#ffffff",
};

const CHANNEL_KEYS: Record<LensColorName, readonly [LensKey, LensKey, LensKey]> = {
  rim: ["rimR", "rimG", "rimB"],
  halo: ["haloR", "haloG", "haloB"],
  spec: ["specR", "specG", "specB"],
};

export type Rgb = readonly [number, number, number];

/**
 * Parse "#rrggbb", "#rgb" or "(r,g,b)" (0..255, parens/spaces optional)
 * into 0..1 channels. Returns null for anything invalid.
 */
export const parseColor = (input: string): Rgb | null => {
  const text = input.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex && (text.startsWith("#") || hex[1].length === 6)) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = /^\(?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/.exec(text);
  if (!rgb) return null;
  const c = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  if (c.some((v) => v > 255)) return null;
  return [c[0] / 255, c[1] / 255, c[2] / 255];
};

const toByte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

/** 0..1 channels to "#rrggbb". */
export const rgbToHex = ([r, g, b]: Rgb): string =>
  "#" + [r, g, b].map((v) => toByte(v).toString(16).padStart(2, "0")).join("");

/**
 * Write a color string into the three channel SharedValues.
 * Returns false (and changes nothing) if the string is invalid.
 */
export const setLensColor = (
  values: LensTuneValues,
  name: LensColorName,
  input: string,
): boolean => {
  const rgb = parseColor(input);
  if (!rgb) return false;
  const keys = CHANNEL_KEYS[name];
  keys.forEach((key, i) => {
    values[key].value = rgb[i];
  });
  return true;
};

/** Current channels of a color as "#rrggbb". */
export const getLensColorHex = (values: LensTuneValues, name: LensColorName): string => {
  const [r, g, b] = CHANNEL_KEYS[name];
  return rgbToHex([values[r].value, values[g].value, values[b].value]);
};


export const LENS_DEFAULTS: LensTuneData = {
  einstein: 1.8,
  falloff: 6,
  chroma: 0.03,
  bubble: 2.8,
  refraction: 0.5,
  shapeN: 2,
  edge: 0.1,
  dispersion: 0.9,
  rim: 0.15,
  specular: 1,
  halo: 0.15,
  spread: 0.2,
  rimR: 1,
  rimG: 1,
  rimB: 1,
  haloR: 1,
  haloG: 1,
  haloB: 1,
  specR: 1,
  specG: 1,
  specB: 1,
  rainbow: 1,
};

export const LENS_SPEC: Record<LensKey, LensSpec> = {
  einstein: { label: "Einstein ×", min: 0, max: 4, decimals: 2, group: "gravity" },
  falloff: { label: "Falloff ×", min: 1, max: 20, decimals: 1, group: "gravity" },
  chroma: { label: "Chroma", min: 0, max: 0.2, decimals: 3, group: "gravity" },
  bubble: { label: "Bubble ×", min: 0, max: 8, decimals: 2, group: "glass" },
  refraction: { label: "Refraction", min: -2, max: 2, decimals: 2, group: "glass" },
  shapeN: { label: "Shape n", min: 1, max: 16, decimals: 1, group: "glass" },
  edge: { label: "Edge", min: 0, max: 0.5, decimals: 2, group: "glass" },
  dispersion: { label: "Dispersion", min: 0, max: 2, decimals: 2, group: "glass" },
  rim: { label: "Rim", min: 0, max: 1, decimals: 2, group: "glass" },
  specular: { label: "Specular", min: 0, max: 2, decimals: 2, group: "glass" },
  halo: { label: "Halo", min: 0, max: 1, decimals: 2, group: "glass" },
  spread: { label: "Spread", min: 0, max: 1, decimals: 2, group: "glass" },
  rimR: { label: "Rim R", min: 0, max: 1, decimals: 2, group: "color" },
  rimG: { label: "Rim G", min: 0, max: 1, decimals: 2, group: "color" },
  rimB: { label: "Rim B", min: 0, max: 1, decimals: 2, group: "color" },
  haloR: { label: "Halo R", min: 0, max: 1, decimals: 2, group: "color" },
  haloG: { label: "Halo G", min: 0, max: 1, decimals: 2, group: "color" },
  haloB: { label: "Halo B", min: 0, max: 1, decimals: 2, group: "color" },
  specR: { label: "Spec R", min: 0, max: 1, decimals: 2, group: "color" },
  specG: { label: "Spec G", min: 0, max: 1, decimals: 2, group: "color" },
  specB: { label: "Spec B", min: 0, max: 1, decimals: 2, group: "color" },
  rainbow: { label: "Rainbow", min: 0, max: 1, decimals: 2, group: "glass" },
};

export const LENS_PRESETS: Record<LensPresetName, LensTuneData> = {
  Both: LENS_DEFAULTS,
  Gravity: { ...LENS_DEFAULTS, bubble: 0 },
  Gargantua: { ...LENS_DEFAULTS, einstein: 0, chroma: 0 },
};

/** One SharedValue per knob, seeded with the defaults. */
export const useLensTune = (): LensTuneValues => ({
  einstein: useSharedValue(LENS_DEFAULTS.einstein),
  falloff: useSharedValue(LENS_DEFAULTS.falloff),
  chroma: useSharedValue(LENS_DEFAULTS.chroma),
  bubble: useSharedValue(LENS_DEFAULTS.bubble),
  refraction: useSharedValue(LENS_DEFAULTS.refraction),
  shapeN: useSharedValue(LENS_DEFAULTS.shapeN),
  edge: useSharedValue(LENS_DEFAULTS.edge),
  dispersion: useSharedValue(LENS_DEFAULTS.dispersion),
  rim: useSharedValue(LENS_DEFAULTS.rim),
  specular: useSharedValue(LENS_DEFAULTS.specular),
  halo: useSharedValue(LENS_DEFAULTS.halo),
  spread: useSharedValue(LENS_DEFAULTS.spread),
  rimR: useSharedValue(LENS_DEFAULTS.rimR),
  rimG: useSharedValue(LENS_DEFAULTS.rimG),
  rimB: useSharedValue(LENS_DEFAULTS.rimB),
  haloR: useSharedValue(LENS_DEFAULTS.haloR),
  haloG: useSharedValue(LENS_DEFAULTS.haloG),
  haloB: useSharedValue(LENS_DEFAULTS.haloB),
  specR: useSharedValue(LENS_DEFAULTS.specR),
  specG: useSharedValue(LENS_DEFAULTS.specG),
  specB: useSharedValue(LENS_DEFAULTS.specB),
  rainbow: useSharedValue(LENS_DEFAULTS.rainbow),
});

/** Set every knob to a preset (plain set, JS side). */
export const applyLensPreset = (values: LensTuneValues, preset: LensPresetName) => {
  const next = LENS_PRESETS[preset];
  for (const key of LENS_KEYS) values[key].value = next[key];
};
