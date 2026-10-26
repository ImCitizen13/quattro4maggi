import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { BLACK_HOLE_PALETTES } from "@/lib/palettes";
import { LENS_MAX_COLORS } from "./gpuTypes";

// ============================================================================
// Lens tuning knobs (plain TS, JS thread only: no worklets here)
// ============================================================================

/** Scalar knob names, in `LensTune` struct order. */
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
  "rainbow",
  "glow",
] as const;

export type LensKey = (typeof LENS_KEYS)[number];

export type LensPresetName = "Gravity" | "Gargantua" | "Both";

export type LensColorName = "rim" | "halo" | "spec";

/**
 * One SharedValue per color list: flat rgb 0..1 triples, 1..LENS_MAX_COLORS
 * colors (count = length / 3). Always replaced whole, never mutated.
 */
export type LensColorValues = Record<LensColorName, SharedValue<number[]>>;

export type LensTuneValues = Record<LensKey, SharedValue<number>> & {
  colors: LensColorValues;
};

export type LensSpec = {
  label: string;
  min: number;
  max: number;
  decimals: number;
  group: "gravity" | "glass";
};

export type LensKnobs = Record<LensKey, number>;

export { LENS_MAX_COLORS };

// ============================================================================
// Knob defaults, ranges, presets
// ============================================================================

export const LENS_DEFAULTS: LensKnobs = {
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
  rainbow: 1,
  glow: 0,
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
  rainbow: { label: "Rainbow", min: 0, max: 1, decimals: 2, group: "glass" },
  glow: { label: "Glow", min: 0, max: 4, decimals: 2, group: "glass" },
};

export const LENS_PRESETS: Record<LensPresetName, LensKnobs> = {
  Both: LENS_DEFAULTS,
  Gravity: { ...LENS_DEFAULTS, bubble: 0 },
  Gargantua: { ...LENS_DEFAULTS, einstein: 0, chroma: 0 },
};

// ============================================================================
// Color lists (rim / halo / specular)
// ============================================================================

export const LENS_COLOR_NAMES: readonly LensColorName[] = ["rim", "halo", "spec"];

/** Default lists: one white color each (the original look). Presets reset to these. */
export const LENS_COLOR_DEFAULTS: Record<LensColorName, readonly string[]> = {
  rim: ["#ffffff"],
  halo: ["#ffffff"],
  spec: ["#ffffff"],
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

/** Flat rgb triples of a list of valid color strings (invalid ones throw). */
const flatten = (inputs: readonly string[]): number[] =>
  inputs.flatMap((input) => {
    const rgb = parseColor(input);
    if (!rgb) throw new Error(`lensTune: invalid color ${input}`);
    return [...rgb];
  });

/** Current list of a color as "#rrggbb" strings (1..LENS_MAX_COLORS). */
export const getLensColors = (values: LensTuneValues, name: LensColorName): string[] => {
  const flat = values.colors[name].value;
  const out: string[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    out.push(rgbToHex([flat[i], flat[i + 1], flat[i + 2]]));
  }
  return out;
};

/**
 * Replace a whole list (clamped to 1..LENS_MAX_COLORS colors). An invalid
 * entry keeps the previous color at that index, or is dropped if there was
 * none. Returns false (and changes nothing) if no entry is usable.
 */
export const setLensColors = (
  values: LensTuneValues,
  name: LensColorName,
  inputs: readonly string[],
): boolean => {
  const prev = values.colors[name].value;
  const next: number[] = [];
  inputs.slice(0, LENS_MAX_COLORS).forEach((input, i) => {
    const rgb = parseColor(input);
    if (rgb) next.push(...rgb);
    else if (i * 3 + 2 < prev.length) next.push(prev[i * 3], prev[i * 3 + 1], prev[i * 3 + 2]);
  });
  if (next.length === 0) return false;
  values.colors[name].value = next;
  return true;
};

/**
 * Set one color of a list. Returns false (and changes nothing) if the string
 * is invalid or the index is past the end of the list.
 */
export const setLensColorAt = (
  values: LensTuneValues,
  name: LensColorName,
  index: number,
  input: string,
): boolean => {
  const rgb = parseColor(input);
  const prev = values.colors[name].value;
  if (!rgb || index < 0 || index * 3 + 2 >= prev.length) return false;
  const next = prev.slice();
  next.splice(index * 3, 3, ...rgb);
  values.colors[name].value = next;
  return true;
};

/** The first LENS_MAX_COLORS colors of a BLACK_HOLE_PALETTES entry. */
export const paletteColors = (index: number): string[] =>
  (BLACK_HOLE_PALETTES[index] ?? BLACK_HOLE_PALETTES[0]).colors.slice(0, LENS_MAX_COLORS);

// ============================================================================
// SharedValues + presets
// ============================================================================

const DEFAULT_FLAT: Record<LensColorName, number[]> = {
  rim: flatten(LENS_COLOR_DEFAULTS.rim),
  halo: flatten(LENS_COLOR_DEFAULTS.halo),
  spec: flatten(LENS_COLOR_DEFAULTS.spec),
};

/** One SharedValue per knob and per color list, seeded with the defaults. */
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
  rainbow: useSharedValue(LENS_DEFAULTS.rainbow),
  glow: useSharedValue(LENS_DEFAULTS.glow),
  colors: {
    rim: useSharedValue(DEFAULT_FLAT.rim),
    halo: useSharedValue(DEFAULT_FLAT.halo),
    spec: useSharedValue(DEFAULT_FLAT.spec),
  },
});

/** Set every knob to a preset and every color list to its default (plain set, JS side). */
export const applyLensPreset = (values: LensTuneValues, preset: LensPresetName) => {
  const next = LENS_PRESETS[preset];
  for (const key of LENS_KEYS) values[key].value = next[key];
  for (const name of LENS_COLOR_NAMES) values.colors[name].value = DEFAULT_FLAT[name].slice();
};
