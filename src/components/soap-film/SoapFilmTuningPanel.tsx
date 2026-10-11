/**
 * SoapFilmTuningPanel — live tuning levers for the soap-film shader.
 * Mirrors `liquid-bubble-live/BubbleTuningPanel.tsx`'s tab/reset structure.
 * Design notes: README.md → "SoapFilmTuningPanel.tsx".
 */

import React, { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { type SharedValue } from "react-native-reanimated";
import { PressableScale } from "pressto";

import {
  TuningSlider,
  type TuningSliderProps,
} from "@/components/liquid-metal/TuningSlider";
import { LIVE_BORDER_PALETTES } from "@/lib/palettes";
import { SOAP_RAMP_STOPS } from "@/lib/shaders/soapFilm";

import type { SoapFilmColorUniforms, SoapFilmFlowUniforms } from "./SoapFilmShader";
import type { SoapFilmUniformDefaults } from "./hooks/useSoapFilmUniforms";
import {
  FILM_DRAINAGE_MAX,
  FILM_DRAINAGE_MIN,
  FILM_THICKNESS_SCALE_MAX,
  FILM_THICKNESS_SCALE_MIN,
  FILM_COS_THETA_MAX,
  FILM_COS_THETA_MIN,
  FILM_INTENSITY_MAX,
  FILM_INTENSITY_MIN,
  FILM_MODE_UNIFORM,
  SQUIRCLE_EXPONENT_MAX,
  SQUIRCLE_EXPONENT_MIN,
  SQUIRCLE_SCALE_MAX,
  SQUIRCLE_SCALE_MIN,
  type FilmGenerator,
} from "./soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

export type SoapFilmTuningTab = "hide" | "shape" | "color";

export type SoapFilmTuningPanelProps = {
  /** Squircle scale, driven by a spring on release. */
  scale: SharedValue<number>;
  scaleDefault: number;
  /** Squircle superellipse exponent. */
  exponent: SharedValue<number>;
  exponentDefault: number;
  /** Which thickness generator drives the film. React state (rebuild-cheap). */
  generator: FilmGenerator;
  onGeneratorChange: (generator: FilmGenerator) => void;
  /** Selected ramp palette; `null` = the default film colors. */
  palette: readonly string[] | null;
  onPaletteChange: (palette: readonly string[] | null) => void;
  flow: SoapFilmFlowUniforms;
  color: SoapFilmColorUniforms;
  defaults: SoapFilmUniformDefaults;
  /** Tab shown on mount. @default "shape" */
  initialTab?: SoapFilmTuningTab;
};

// ============================================================================
// Constants
// ============================================================================

const TABS: readonly { key: SoapFilmTuningTab; label: string }[] = [
  { key: "hide", label: "Hide" },
  { key: "shape", label: "Shape" },
  { key: "color", label: "Color" },
];

const SLIDER_TABS: readonly SoapFilmTuningTab[] = ["shape", "color"];

const SWATCH_SIZE = 36;

/** Default-film swatch: a few evenly spaced stops of the built-in ramp. */
const DEFAULT_SWATCH_COLORS = [0, 4, 8, 12, 16].map((i) => {
  const [r, g, b] = SOAP_RAMP_STOPS[i];
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}) as [string, string, ...string[]];

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
      <TuningSlider {...sliderProps} width={230} />
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

export function SoapFilmTuningPanel({
  scale,
  scaleDefault,
  exponent,
  exponentDefault,
  generator,
  onGeneratorChange,
  palette,
  onPaletteChange,
  flow,
  color,
  defaults,
  initialTab = "shape",
}: SoapFilmTuningPanelProps) {
  const [tab, setTab] = useState<SoapFilmTuningTab>(initialTab);
  // Mirrors `color.mode` (a SharedValue, written from worklets by
  // `resetAll`'s plain assignment too) so the active button can re-render —
  // reading a SharedValue in the render body doesn't subscribe to it.
  const [colorMode, setColorMode] = useState<number>(defaults.mode);

  const resetAll = () => {
    scale.value = scaleDefault;
    exponent.value = exponentDefault;
    flow.layer0.value = defaults.layer0;
    flow.layer1.value = defaults.layer1;
    flow.layer2.value = defaults.layer2;
    flow.swirl.value = defaults.swirl;
    flow.seed.value = defaults.seed;
    flow.drainage.value = defaults.drainage;
    flow.bandShape.value = defaults.bandShape;
    flow.grain.value = defaults.grain;
    flow.touchTau.value = defaults.touchTau;
    flow.touchRadius.value = defaults.touchRadius;
    flow.vortex.value = defaults.vortex;
    flow.sineFreq.value = defaults.sineFreq;
    flow.sineSpeedA.value = defaults.sineSpeedA;
    flow.sineSpeedB.value = defaults.sineSpeedB;
    color.mode.value = defaults.mode;
    color.thicknessScale.value = defaults.thicknessScale;
    color.cosTheta.value = defaults.cosTheta;
    color.intensity.value = defaults.intensity;
    color.opacity.value = defaults.opacity;
    setColorMode(defaults.mode);
    onPaletteChange(null);
  };

  const pickPalette = (next: readonly string[]) => {
    onPaletteChange(next);
    // The palette only shows in ramp mode.
    color.mode.value = FILM_MODE_UNIFORM.ramp;
    setColorMode(FILM_MODE_UNIFORM.ramp);
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
        </View>
      )}

      {tab === "shape" && (
        <>
          <ResettableSlider
            label="Scale"
            value={scale}
            min={SQUIRCLE_SCALE_MIN}
            max={SQUIRCLE_SCALE_MAX}
            decimals={2}
            defaultValue={scaleDefault}
          />
          <ResettableSlider
            label="Exponent"
            value={exponent}
            min={SQUIRCLE_EXPONENT_MIN}
            max={SQUIRCLE_EXPONENT_MAX}
            decimals={1}
            defaultValue={exponentDefault}
          />
        </>
      )}

      {tab === "color" && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.swatchScroll}
            contentContainerStyle={styles.swatchRow}
          >
            <PressableScale onPress={() => onPaletteChange(null)}>
              <LinearGradient
                colors={DEFAULT_SWATCH_COLORS}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.swatch, palette === null && styles.swatchActive]}
              />
            </PressableScale>
            {LIVE_BORDER_PALETTES.map((p) => (
              <PressableScale key={p.join()} onPress={() => pickPalette(p)}>
                <LinearGradient
                  colors={p as unknown as [string, string, ...string[]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.swatch, palette === p && styles.swatchActive]}
                />
              </PressableScale>
            ))}
          </ScrollView>

          <View style={styles.generatorRow}>
            {(["curl", "sine"] as const).map((g) => (
              <PressableScale
                key={g}
                onPress={() => onGeneratorChange(g)}
                style={[
                  styles.generatorButton,
                  generator === g && styles.generatorButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.generatorButtonText,
                    generator === g && styles.generatorButtonTextActive,
                  ]}
                >
                  {g === "curl" ? "Curl" : "Sine"}
                </Text>
              </PressableScale>
            ))}
          </View>

          <View style={styles.generatorRow}>
            {(
              [
                { label: "Bubble", value: FILM_MODE_UNIFORM.bubble },
                { label: "Ramp", value: FILM_MODE_UNIFORM.ramp },
                { label: "Physical", value: FILM_MODE_UNIFORM.physical },
              ]
            ).map((m) => (
              <PressableScale
                key={m.label}
                onPress={() => {
                  color.mode.value = m.value;
                  setColorMode(m.value);
                }}
                style={[
                  styles.generatorButton,
                  colorMode === m.value && styles.generatorButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.generatorButtonText,
                    colorMode === m.value && styles.generatorButtonTextActive,
                  ]}
                >
                  {m.label}
                </Text>
              </PressableScale>
            ))}
          </View>
          <ResettableSlider
            label="Drainage"
            value={flow.drainage}
            min={FILM_DRAINAGE_MIN}
            max={FILM_DRAINAGE_MAX}
            decimals={2}
            defaultValue={defaults.drainage}
          />
          <ResettableSlider
            label="Rings (0 horizontal · 1 rings)"
            value={flow.bandShape}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.bandShape}
          />
          <ResettableSlider
            label="Thickness scale"
            value={color.thicknessScale}
            min={FILM_THICKNESS_SCALE_MIN}
            max={FILM_THICKNESS_SCALE_MAX}
            decimals={2}
            defaultValue={defaults.thicknessScale}
          />
          <ResettableSlider
            label="Cos theta"
            value={color.cosTheta}
            min={FILM_COS_THETA_MIN}
            max={FILM_COS_THETA_MAX}
            decimals={2}
            defaultValue={defaults.cosTheta}
          />
          <ResettableSlider
            label="Intensity"
            value={color.intensity}
            min={FILM_INTENSITY_MIN}
            max={FILM_INTENSITY_MAX}
            decimals={2}
            defaultValue={defaults.intensity}
          />
          <ResettableSlider
            label="Opacity"
            value={color.opacity}
            min={0}
            max={1}
            decimals={2}
            defaultValue={defaults.opacity}
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
  generatorRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  generatorButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#2e2e2e",
  },
  generatorButtonActive: {
    backgroundColor: "#fff",
  },
  generatorButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  generatorButtonTextActive: {
    color: "#1a1a1a",
  },
  swatchScroll: {
    maxWidth: 270,
    flexGrow: 0,
  },
  swatchRow: {
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: {
    borderColor: "#fff",
  },
});
