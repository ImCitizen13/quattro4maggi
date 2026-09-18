/**
 * BubbleTuningPanel — live tuning levers for the harmonic bubble.
 * Design notes: README.md → "BubbleTuningPanel.tsx".
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { PressableScale } from "pressto";

import { TuningSlider, type TuningSliderProps } from "@/components/liquid-metal/TuningSlider";

import {
  GARGANTUA_PRESET,
  type BubbleOptics,
  type BubbleOpticsValues,
} from "./hooks/useBubbleOptics";

// ============================================================================
// Types
// ============================================================================

export type BubbleTuningTab =
  | "hide"
  | "shape"
  | "refraction"
  | "surface"
  | "rim";

export type BubbleTuningPanelProps = {
  /** Mode 3/4 wobble multiplier. */
  wobble: SharedValue<number>;
  /** Default wobble value, used by "Reset all". */
  wobbleDefault: number;
  /** Optics levers from `useBubbleOptics`. */
  optics: BubbleOptics;
  /** Default optics values, used by per-slider reset and "Reset all". */
  defaults: BubbleOpticsValues;
  /** Upper bound of the Refract slider, pt. */
  refractMax: number;
  /** Tab shown on mount. @default "refraction" */
  initialTab?: BubbleTuningTab;
};

// ============================================================================
// Constants
// ============================================================================

const TABS: readonly { key: BubbleTuningTab; label: string }[] = [
  { key: "hide", label: "Hide" },
  { key: "shape", label: "Shape" },
  { key: "refraction", label: "Refraction" },
  { key: "surface", label: "Surface" },
  { key: "rim", label: "Rim" },
];

const SLIDER_TABS: readonly BubbleTuningTab[] = [
  "shape",
  "refraction",
  "surface",
  "rim",
];

// ============================================================================
// ResettableSlider
// ============================================================================

type ResettableSliderProps = Omit<TuningSliderProps, "width"> & {
  defaultValue: number;
};

function ResettableSlider({ defaultValue, ...sliderProps }: ResettableSliderProps) {
  const { value } = sliderProps;
  return (
    <View style={styles.resettableRow}>
      <TuningSlider {...sliderProps} width={250} />
      <PressableScale
        onPress={() => {
          "worklet";
          value.value = defaultValue;
        }}
        style={styles.resetButton}
      >
        <Text style={styles.resetButtonText}>↺</Text>
      </PressableScale>
    </View>
  );
}

// ============================================================================
// Component
// ============================================================================

export function BubbleTuningPanel({
  wobble,
  wobbleDefault,
  optics,
  defaults,
  refractMax,
  initialTab = "refraction",
}: BubbleTuningPanelProps) {
  const [tab, setTab] = useState<BubbleTuningTab>(initialTab);

  const resetAll = () => {
    (Object.keys(defaults) as (keyof BubbleOptics)[]).forEach((key) => {
      optics[key].value = defaults[key];
    });
    wobble.value = wobbleDefault;
  };

  const applyGargantua = () => {
    (Object.keys(GARGANTUA_PRESET) as (keyof BubbleOptics)[]).forEach((key) => {
      const presetValue = GARGANTUA_PRESET[key];
      if (presetValue !== undefined) {
        optics[key].value = presetValue;
      }
    });
  };

  return (
    <View style={styles.panel} pointerEvents="box-none">
      <View style={styles.tabs}>
        {TABS.map(({ key, label }) => (
          <PressableScale
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </PressableScale>
        ))}
      </View>

      {SLIDER_TABS.includes(tab) && (
        <View style={styles.presetRow}>
          <PressableScale onPress={resetAll} style={styles.presetButton}>
            <Text style={styles.presetButtonText}>Reset all</Text>
          </PressableScale>
          <PressableScale onPress={applyGargantua} style={styles.presetButton}>
            <Text style={styles.presetButtonText}>Gargantua</Text>
          </PressableScale>
        </View>
      )}

      {tab === "shape" && (
        <ResettableSlider
          label="Wobble"
          value={wobble}
          min={0}
          max={3}
          decimals={2}
          defaultValue={wobbleDefault}
        />
      )}

      {tab === "refraction" && (
        <>
          <ResettableSlider
            label="Refract"
            value={optics.refract}
            min={0}
            max={refractMax}
            decimals={1}
            defaultValue={defaults.refract}
          />
          <ResettableSlider
            label="Lens falloff"
            value={optics.falloff}
            min={0.25}
            max={4}
            decimals={2}
            defaultValue={defaults.falloff}
          />
          <ResettableSlider
            label="Lens"
            value={optics.lens}
            min={-1}
            max={1}
            decimals={2}
            defaultValue={defaults.lens}
          />
          <ResettableSlider
            label="Dispersion"
            value={optics.dispersion}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.dispersion}
          />
          <ResettableSlider
            label="Edge width"
            value={optics.edgeWidth}
            min={0.02}
            max={0.5}
            decimals={2}
            defaultValue={defaults.edgeWidth}
          />
        </>
      )}

      {tab === "surface" && (
        <>
          <ResettableSlider
            label="Film"
            value={optics.film}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.film}
          />
          <ResettableSlider
            label="Film bands"
            value={optics.filmScale}
            min={0}
            max={8}
            decimals={1}
            defaultValue={defaults.filmScale}
          />
          <ResettableSlider
            label="Tint"
            value={optics.tint}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.tint}
          />
          <ResettableSlider
            label="Specular"
            value={optics.specular}
            min={0}
            max={2}
            decimals={2}
            defaultValue={defaults.specular}
          />
        </>
      )}

      {tab === "rim" && (
        <>
          <ResettableSlider
            label="Rim dark"
            value={optics.rimDark}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.rimDark}
          />
          <ResettableSlider
            label="Rim width"
            value={optics.rimWidth}
            min={0.5}
            max={12}
            decimals={1}
            defaultValue={defaults.rimWidth}
          />
          <ResettableSlider
            label="Rainbow mix"
            value={optics.rainbowMix}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.rainbowMix}
          />
          <ResettableSlider
            label="Rainbow glow"
            value={optics.rainbowGlow}
            min={0}
            max={0.5}
            decimals={2}
            defaultValue={defaults.rainbowGlow}
          />
          <ResettableSlider
            label="Halo spread"
            value={optics.haloSpread}
            min={0.01}
            max={1}
            decimals={2}
            defaultValue={defaults.haloSpread}
          />
          <ResettableSlider
            label="Halo"
            value={optics.haloOpacity}
            min={-0.5}
            max={0.5}
            decimals={2}
            defaultValue={defaults.haloOpacity}
          />
        </>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 40,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,.6)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  tab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#2e2e2e",
  },
  tabActive: {
    backgroundColor: "#fff",
  },
  tabText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#1a1a1a",
  },
  presetRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  presetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#3a3a3a",
  },
  presetButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  resettableRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  resetButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2e2e2e",
    alignItems: "center",
    justifyContent: "center",
  },
  resetButtonText: {
    color: "#fff",
    fontSize: 15,
  },
});
