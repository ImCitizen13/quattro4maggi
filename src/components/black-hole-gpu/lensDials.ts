/**
 * useLensDials — the lens knobs and sim speed in the DevTools Dials panel.
 *
 * FLOW:
 *   LENS_SPEC ─► DialKit config (Sim / Gravity / Glass folders + preset actions)
 *   panel drag ─► useDialsListener ─► writes the existing SharedValues
 *     (same ones SettingsPanel drives; lensScene / vortexScene read them per frame)
 *   preset action ─► applyLensPreset ─► setDialValues pushes it back to the panel
 *
 * KEY FEATURES:
 * - Built from LENS_SPEC: ranges and step (10^-decimals) stay in one place
 * - No re-render of BlackHoleGpu per drag tick (listener writes SharedValues)
 * - Dev only: in production the hook registers nothing; SharedValues keep defaults
 * - The in-app SettingsPanel keeps working; its edits are not mirrored into the panel
 */
import type { SharedValue } from "react-native-reanimated";
import { setDialValues, useDialsListener } from "@/lib/dials";
import {
  applyLensPreset,
  LENS_DEFAULTS,
  LENS_KEYS,
  LENS_PRESETS,
  LENS_SPEC,
  type LensKey,
  type LensPresetName,
  type LensSpec,
  type LensTuneValues,
} from "./lensTune";
import { SPEED_MAX, SPEED_MIN } from "./vortexScene";

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

const LENS_DIALS = {
  sim: { speed: [1, SPEED_MIN, SPEED_MAX, 0.05] as Slider },
  gravity: sliders("gravity"),
  glass: sliders("glass"),
  presets: {
    gravity: { type: "action", label: "Gravity" },
    gargantua: { type: "action", label: "Gargantua" },
    both: { type: "action", label: "Both" },
  },
} as const;

const PRESET_ACTIONS: Record<string, LensPresetName> = {
  "presets.gravity": "Gravity",
  "presets.gargantua": "Gargantua",
  "presets.both": "Both",
};

// ============================================================================
// Hook
// ============================================================================

export const useLensDials = (lens: LensTuneValues, speed: SharedValue<number>) => {
  useDialsListener(
    "Black Hole Lens",
    LENS_DIALS,
    (values) => {
      speed.set(values.sim.speed);
      const tuned: Record<string, number> = { ...values.gravity, ...values.glass };
      for (const key of LENS_KEYS) {
        const value = tuned[key];
        if (value !== undefined) lens[key].set(value);
      }
    },
    {
      id: DIAL_ID,
      onAction: (path) => {
        const preset = PRESET_ACTIONS[path];
        if (!preset) return;
        applyLensPreset(lens, preset);
        setDialValues(DIAL_ID, {
          gravity: valuesFor("gravity", preset),
          glass: valuesFor("glass", preset),
        });
      },
    },
  );
};
