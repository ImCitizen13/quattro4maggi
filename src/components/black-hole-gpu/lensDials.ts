/**
 * useLensDials — the lens knobs and sim speed in the DevTools Dials panel.
 *
 * FLOW:
 *   LENS_SPEC ─► DialKit config (Sim / Gravity / Glass / Hole / Color folders + preset actions)
 *   Color folder = one subfolder per effect (rim / halo):
 *     palette select + count slider (1..6) + six native color dials
 *   panel change ─► useDialsListener ─► writes the existing SharedValues
 *     (same ones SettingsPanel drives; lensScene / vortexScene read them per frame)
 *     palette changed ─► paletteColors fills only that effect's list
 *       ─► setDialValues pushes the colors + count back to the panel
 *       ─► rim palette only: rainbow set to 0 and pushed back (glass.rainbow)
 *     otherwise ─► setLensColors from the first `count` color dials
 *   preset action ─► applyLensPreset ─► setDialValues pushes the knobs, the
 *     preset's lists and their palette names (or Custom) back to the panel
 *
 * KEY FEATURES:
 * - Built from LENS_SPEC: ranges and step (10^-decimals) stay in one place
 * - DialKit has no list control: a list is a count slider over fixed color dials
 * - No re-render of BlackHoleGpu per drag tick (listener writes SharedValues)
 * - Dev only: in production the hook registers nothing; SharedValues keep defaults
 * - The in-app SettingsPanel keeps working; its edits are not mirrored into the panel
 */
import { useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import { setDialValues, useDialsListener } from "@/lib/dials";
import { BLACK_HOLE_PALETTES } from "@/lib/palettes";
import {
  applyLensPreset,
  LENS_COLOR_DEFAULTS,
  LENS_COLOR_NAMES,
  LENS_DEFAULTS,
  LENS_KEYS,
  LENS_MAX_COLORS,
  LENS_PRESETS,
  LENS_SPEC,
  type LensColorName,
  type LensKey,
  type LensPresetName,
  type LensSpec,
  type LensTuneValues,
  paletteColors,
  presetColors,
  presetPick,
  setLensColors,
} from "./lensTune";
import { DEFAULT_SPEED, SPEED_MAX, SPEED_MIN } from "./vortexConstants";

// ============================================================================
// Config
// ============================================================================

const DIAL_ID = "black-hole-gpu:lens";

type Slider = [number, number, number, number];

const slider = (key: LensKey): Slider => {
  const { min, max, decimals } = LENS_SPEC[key];
  return [LENS_DEFAULTS[key], min, max, 10 ** -decimals];
};

const keysIn = (group: LensSpec["group"]) =>
  LENS_KEYS.filter((key) => LENS_SPEC[key].group === group);

const sliders = (group: LensSpec["group"]): Record<string, Slider> =>
  Object.fromEntries(keysIn(group).map((key) => [key, slider(key)]));

const valuesFor = (group: LensSpec["group"], preset: LensPresetName) =>
  Object.fromEntries(keysIn(group).map((key) => [key, LENS_PRESETS[preset][key]]));

const CUSTOM = "Custom";
const PALETTE_OPTIONS = [CUSTOM, ...BLACK_HOLE_PALETTES.map((palette) => palette.name)];
const COLOR_SLOTS = ["c1", "c2", "c3", "c4", "c5", "c6"] as const;

/** Six color slots, filled from a list and padded with its last color. */
const slotValues = (colors: readonly string[]) =>
  Object.fromEntries(
    COLOR_SLOTS.map((slot, i) => [slot, colors[Math.min(i, colors.length - 1)]]),
  ) as Record<(typeof COLOR_SLOTS)[number], string>;

/** One effect's folder: palette select, count, six color dials. */
const colorFolder = (name: LensColorName) => {
  const slots = slotValues(LENS_COLOR_DEFAULTS[name]);
  return {
    palette: { type: "select" as const, options: PALETTE_OPTIONS, default: CUSTOM },
    count: [LENS_COLOR_DEFAULTS[name].length, 1, LENS_MAX_COLORS, 1] as Slider,
    c1: { type: "color" as const, default: slots.c1 },
    c2: { type: "color" as const, default: slots.c2 },
    c3: { type: "color" as const, default: slots.c3 },
    c4: { type: "color" as const, default: slots.c4 },
    c5: { type: "color" as const, default: slots.c5 },
    c6: { type: "color" as const, default: slots.c6 },
  };
};

/** Panel values for a list: count + slots (palette left to the caller). */
const listValues = (colors: readonly string[]) => ({
  count: colors.length,
  ...slotValues(colors),
});

const LENS_DIALS = {
  sim: { speed: [DEFAULT_SPEED, SPEED_MIN, SPEED_MAX, 0.05] as Slider },
  gravity: sliders("gravity"),
  glass: sliders("glass"),
  hole: sliders("hole"),
  color: {
    rim: colorFolder("rim"),
    halo: colorFolder("halo"),
  },
  presets: {
    gravity: { type: "action", label: "Gravity" },
    gargantua: { type: "action", label: "Gargantua" },
    both: { type: "action", label: "Both" },
    blackHole: { type: "action", label: "Black hole" },
  },
} as const;

const PRESET_ACTIONS: Record<string, LensPresetName> = {
  "presets.gravity": "Gravity",
  "presets.gargantua": "Gargantua",
  "presets.both": "Both",
  "presets.blackHole": "Black hole",
};

// ============================================================================
// Hook
// ============================================================================

export const useLensDials = (lens: LensTuneValues, speed: SharedValue<number>) => {
  // Last palette seen per effect: a change means "fill from this palette".
  // undefined until the first values message, which only records it.
  const lastPalette = useRef<Partial<Record<LensColorName, string>>>({});

  useDialsListener(
    "Black Hole Lens",
    LENS_DIALS,
    (values) => {
      speed.set(values.sim.speed);
      const tuned: Record<string, number> = {
        ...values.gravity,
        ...values.glass,
        ...values.hole,
      };
      for (const key of LENS_KEYS) {
        const value = tuned[key];
        if (value !== undefined) lens[key].set(value);
      }
      for (const name of LENS_COLOR_NAMES) {
        const folder = values.color[name];
        const prev = lastPalette.current[name];
        lastPalette.current[name] = folder.palette;
        const index = PALETTE_OPTIONS.indexOf(folder.palette) - 1;
        if (prev !== undefined && prev !== folder.palette && index >= 0) {
          const colors = paletteColors(index);
          setLensColors(lens, name, colors);
          setDialValues(DIAL_ID, { color: { [name]: listValues(colors) } });
          // A rim palette replaces the rainbow, so turn the rainbow off.
          if (name === "rim") {
            lens.rainbow.set(0);
            setDialValues(DIAL_ID, { glass: { rainbow: 0 } });
          }
          continue;
        }
        const count = Math.max(1, Math.min(LENS_MAX_COLORS, Math.round(folder.count)));
        setLensColors(lens, name, COLOR_SLOTS.slice(0, count).map((slot) => folder[slot]));
      }
    },
    {
      id: DIAL_ID,
      onAction: (path) => {
        const preset = PRESET_ACTIONS[path];
        if (!preset) return;
        applyLensPreset(lens, preset);
        const paletteOf = (name: LensColorName) => {
          const pick = presetPick(preset, name);
          return pick === null ? CUSTOM : (PALETTE_OPTIONS[pick + 1] ?? CUSTOM);
        };
        for (const name of LENS_COLOR_NAMES) lastPalette.current[name] = paletteOf(name);
        setDialValues(DIAL_ID, {
          gravity: valuesFor("gravity", preset),
          glass: valuesFor("glass", preset),
          hole: valuesFor("hole", preset),
          color: Object.fromEntries(
            LENS_COLOR_NAMES.map((name) => [
              name,
              { palette: paletteOf(name), ...listValues(presetColors(preset, name)) },
            ]),
          ),
        });
      },
    },
  );
};
