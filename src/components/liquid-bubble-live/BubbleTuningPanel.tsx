/**
 * BubbleTuningPanel — live tuning levers for the harmonic bubble.
 * Design notes: README.md → "BubbleTuningPanel.tsx".
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { PressableScale } from "pressto";

import {
  TuningSlider,
  type TuningSliderProps,
} from "@/components/liquid-metal/TuningSlider";

import {
  GARGANTUA_PRESET,
  type BubbleOptics,
  type BubbleOpticsValues,
} from "./hooks/useBubbleOptics";

// ============================================================================
// Types
// ============================================================================

export type BubbleTuningTab =
  "hide" | "shape" | "refraction" | "surface" | "rim";

export type BubbleTuningPanelProps = {
  /** Mode 3/4 wobble multiplier. */
  wobble: SharedValue<number>;
  /** Default wobble value, used by "Reset all". */
  wobbleDefault: number;
  /** Per-bubble inertia multiplier (see `bubbleModes.ts` → "Per-bubble inertia and strength"). */
  inertia: SharedValue<number>;
  /** Default inertia value, used by "Reset all". */
  inertiaDefault: number;
  /** Per-bubble strength multiplier (see `bubbleModes.ts` → "Per-bubble inertia and strength"). */
  strength: SharedValue<number>;
  /** Default strength value, used by "Reset all". */
  strengthDefault: number;
  /** Bubble radius, pt. Omit to hide the Size slider. */
  size?: SharedValue<number>;
  /** Default radius, used by per-slider reset and "Reset all". */
  sizeDefault?: number;
  /** Size slider range, pt. */
  sizeMin?: number;
  sizeMax?: number;
  /** Float buoyancy multiplier (0 = drifts, never rises). Omit to hide the slider. */
  buoyancy?: SharedValue<number>;
  /** Default buoyancy value, used by "Reset all". */
  buoyancyDefault?: number;
  /** Float state (Shape tab toggle). */
  floatOn?: boolean;
  /** Flips floating on/off. Omit to hide the Float toggle. */
  onFloatToggle?: () => void;
  /** Optics levers from `useBubbleOptics`. */
  optics: BubbleOptics;
  /** Default optics values, used by per-slider reset and "Reset all". */
  defaults: BubbleOpticsValues;
  /** Upper bound of the Refract slider, pt. */
  refractMax: number;
  /** Soap-film overlay state (Surface tab toggle). */
  soapFilmOn?: boolean;
  /** Flips the soap-film overlay. Omit to hide the toggle and Film reach. */
  onSoapFilmToggle?: () => void;
  /** Film drag lever (film lags the bubble's motion). Omit to hide the slider. */
  filmDrag?: SharedValue<number>;
  /** Default film drag, used by per-slider reset and "Reset all". */
  filmDragDefault?: number;
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

function ResettableSlider({
  defaultValue,
  ...sliderProps
}: ResettableSliderProps) {
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
  inertia,
  inertiaDefault,
  strength,
  strengthDefault,
  size,
  sizeDefault,
  sizeMin = 40,
  sizeMax = 300,
  buoyancy,
  buoyancyDefault,
  floatOn,
  onFloatToggle,
  optics,
  defaults,
  refractMax,
  soapFilmOn,
  onSoapFilmToggle,
  filmDrag,
  filmDragDefault,
  initialTab = "refraction",
}: BubbleTuningPanelProps) {
  const [tab, setTab] = useState<BubbleTuningTab>(initialTab);

  const resetAll = () => {
    (Object.keys(defaults) as (keyof BubbleOptics)[]).forEach((key) => {
      optics[key].value = defaults[key];
    });
    wobble.value = wobbleDefault;
    inertia.value = inertiaDefault;
    strength.value = strengthDefault;
    if (filmDrag && filmDragDefault !== undefined) {
      filmDrag.value = filmDragDefault;
    }
    if (size && sizeDefault !== undefined) {
      size.value = sizeDefault;
    }
    if (buoyancy && buoyancyDefault !== undefined) {
      buoyancy.value = buoyancyDefault;
    }
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
        <>
          {onFloatToggle && (
            <View style={styles.presetRow}>
              <PressableScale
                onPress={onFloatToggle}
                style={styles.presetButton}
              >
                <Text style={styles.presetButtonText}>
                  Float: {floatOn ? "On" : "Off"}
                </Text>
              </PressableScale>
            </View>
          )}
          {size && sizeDefault !== undefined && (
            <ResettableSlider
              label="Size"
              value={size}
              min={sizeMin}
              max={sizeMax}
              decimals={0}
              defaultValue={sizeDefault}
            />
          )}
          {buoyancy && buoyancyDefault !== undefined && (
            <ResettableSlider
              label="Buoyancy"
              value={buoyancy}
              min={0}
              max={3}
              decimals={2}
              defaultValue={buoyancyDefault}
            />
          )}
          <ResettableSlider
            label="Wobble"
            value={wobble}
            min={0}
            max={3}
            decimals={2}
            defaultValue={wobbleDefault}
          />
          <ResettableSlider
            label="Inertia"
            value={inertia}
            min={0.3}
            max={2.5}
            decimals={2}
            defaultValue={inertiaDefault}
          />
          <ResettableSlider
            label="Strength"
            value={strength}
            min={0.3}
            max={2.5}
            decimals={2}
            defaultValue={strengthDefault}
          />
        </>
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
          {onSoapFilmToggle && (
            <View style={styles.presetRow}>
              <PressableScale
                onPress={onSoapFilmToggle}
                style={styles.presetButton}
              >
                <Text style={styles.presetButtonText}>
                  Soap film: {soapFilmOn ? "On" : "Off"}
                </Text>
              </PressableScale>
            </View>
          )}
          <ResettableSlider
            label="Film"
            value={optics.film}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.film}
          />
          {onSoapFilmToggle && (
            <ResettableSlider
              label="Film reach"
              value={optics.filmReach}
              min={0}
              max={1}
              decimals={2}
              defaultValue={defaults.filmReach}
            />
          )}
          {filmDrag && filmDragDefault !== undefined && (
            <ResettableSlider
              label="Film drag"
              value={filmDrag}
              min={0}
              max={2}
              decimals={2}
              defaultValue={filmDragDefault}
            />
          )}
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
