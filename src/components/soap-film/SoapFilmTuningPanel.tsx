/**
 * SoapFilmTuningPanel — live tuning levers for the soap-film shader.
 * Mirrors `liquid-bubble-live/BubbleTuningPanel.tsx`'s tab/reset structure.
 * Design notes: README.md → "SoapFilmTuningPanel.tsx".
 */

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { type SharedValue } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "pressto";

import { TuningSlider } from "@/components/liquid-metal/TuningSlider";

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
  /** Reset target only; the palette itself is picked in `SoapFilmPaletteBar`. */
  onPaletteChange: (palette: readonly string[] | null) => void;
  /** Active color mode (mirror of `color.mode`, owned by the parent). */
  colorMode: number;
  onColorModeChange: (mode: number) => void;
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

const SLIDER_WIDTH = 266;

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
  onPaletteChange,
  colorMode,
  onColorModeChange,
  flow,
  color,
  defaults,
  initialTab = "shape",
}: SoapFilmTuningPanelProps) {
  const [tab, setTab] = useState<SoapFilmTuningTab>(initialTab);

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
    onColorModeChange(defaults.mode);
    onPaletteChange(null);
  };

  return (
    <View style={styles.panel} pointerEvents="box-none">
      {SLIDER_TABS.includes(tab) && (
        <PressableScale
          onPress={resetAll}
          accessibilityLabel="Reset all"
          hitSlop={8}
          style={styles.resetAll}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
        </PressableScale>
      )}

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

      {tab === "shape" && (
        <>
          <TuningSlider
            label="Scale"
            value={scale}
            min={SQUIRCLE_SCALE_MIN}
            max={SQUIRCLE_SCALE_MAX}
            decimals={2}
            width={SLIDER_WIDTH}
          />
          <TuningSlider
            label="Exponent"
            value={exponent}
            min={SQUIRCLE_EXPONENT_MIN}
            max={SQUIRCLE_EXPONENT_MAX}
            decimals={1}
            width={SLIDER_WIDTH}
          />
        </>
      )}

      {tab === "color" && (
        <>
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
              ]
            ).map((m) => (
              <PressableScale
                key={m.label}
                onPress={() => onColorModeChange(m.value)}
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
          <TuningSlider
            label="Drainage"
            value={flow.drainage}
            min={FILM_DRAINAGE_MIN}
            max={FILM_DRAINAGE_MAX}
            decimals={2}
            width={SLIDER_WIDTH}
          />
          <TuningSlider
            label="Rings (0 horizontal · 1 rings)"
            value={flow.bandShape}
            min={0}
            max={1}
            decimals={2}
            width={SLIDER_WIDTH}
          />
          <TuningSlider
            label="Thickness scale"
            value={color.thicknessScale}
            min={FILM_THICKNESS_SCALE_MIN}
            max={FILM_THICKNESS_SCALE_MAX}
            decimals={2}
            width={SLIDER_WIDTH}
          />
          <TuningSlider
            label="Cos theta"
            value={color.cosTheta}
            min={FILM_COS_THETA_MIN}
            max={FILM_COS_THETA_MAX}
            decimals={2}
            width={SLIDER_WIDTH}
          />
          <TuningSlider
            label="Intensity"
            value={color.intensity}
            min={FILM_INTENSITY_MIN}
            max={FILM_INTENSITY_MAX}
            decimals={2}
            width={SLIDER_WIDTH}
          />
          <TuningSlider
            label="Opacity"
            value={color.opacity}
            min={0}
            max={1}
            decimals={2}
            width={SLIDER_WIDTH}
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
    // Keep tabs clear of the absolute reset-all icon (32pt + 12 inset).
    paddingHorizontal: 28,
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
  resetAll: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2e2e2e",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
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
});
