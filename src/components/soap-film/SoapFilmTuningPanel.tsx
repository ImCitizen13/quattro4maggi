/**
 * SoapFilmTuningPanel — live tuning levers for the soap-film shader.
 * Mirrors `liquid-bubble-live/BubbleTuningPanel.tsx`'s tab/reset structure.
 * Design notes: README.md → "SoapFilmTuningPanel.tsx".
 */

import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { PressableScale } from "pressto";

import {
  TuningSlider,
  type TuningSliderProps,
} from "@/components/liquid-metal/TuningSlider";

import type { SoapFilmColorUniforms, SoapFilmFlowUniforms } from "./SoapFilmShader";
import type { SoapFilmUniformDefaults } from "./hooks/useSoapFilmUniforms";
import {
  FILM_DRAINAGE_MAX,
  FILM_DRAINAGE_MIN,
  FILM_SWIRL_MAX,
  FILM_SWIRL_MIN,
  FILM_THICKNESS_SCALE_MAX,
  FILM_THICKNESS_SCALE_MIN,
  FILM_COS_THETA_MAX,
  FILM_COS_THETA_MIN,
  FILM_GRAIN_MAX,
  FILM_GRAIN_MIN,
  FILM_INTENSITY_MAX,
  FILM_INTENSITY_MIN,
  FILM_MODE_UNIFORM,
  FILM_TOUCH_TAU_MAX,
  FILM_TOUCH_TAU_MIN,
  SQUIRCLE_EXPONENT_MAX,
  SQUIRCLE_EXPONENT_MIN,
  SQUIRCLE_SCALE_MAX,
  SQUIRCLE_SCALE_MIN,
  type FilmGenerator,
  type FilmLayer,
} from "./soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

export type SoapFilmTuningTab = "hide" | "shape" | "flow" | "color";

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
  { key: "flow", label: "Flow" },
  { key: "color", label: "Color" },
];

const SLIDER_TABS: readonly SoapFilmTuningTab[] = ["shape", "flow", "color"];

/** Index into a `FilmLayer` tuple `[frequency, speed, rotationAngle, weight]`. */
type LayerFieldIndex = 0 | 1 | 2 | 3;

const LAYER_FIELDS: readonly {
  index: LayerFieldIndex;
  label: string;
  min: number;
  max: number;
  decimals: number;
}[] = [
  { index: 0, label: "Frequency", min: 0.2, max: 10, decimals: 2 },
  { index: 1, label: "Speed", min: 0, max: 1, decimals: 2 },
  { index: 2, label: "Angle", min: -3.2, max: 3.2, decimals: 2 },
  { index: 3, label: "Weight", min: 0, max: 2, decimals: 2 },
];

/** Fields of the `FilmVortex` tuple `[count, spin, radius, cycle]`. */
const VORTEX_FIELDS: typeof LAYER_FIELDS = [
  { index: 0, label: "Count", min: 0, max: 3, decimals: 0 },
  { index: 1, label: "Spin", min: -4, max: 4, decimals: 2 },
  { index: 2, label: "Radius", min: 0.05, max: 0.6, decimals: 2 },
  { index: 3, label: "Cycle", min: 1, max: 15, decimals: 1 },
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
// TupleTuningSlider — writes one component of a `FilmLayer` tuple in place
// ============================================================================

const THUMB = 22;
const TRACK_H = 6;
const TRACK_W = 230;

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type TupleTuningSliderProps = {
  label: string;
  layer: SharedValue<FilmLayer>;
  index: LayerFieldIndex;
  min: number;
  max: number;
  decimals: number;
  defaultValue: number;
};

/**
 * Same drag-to-set contract as `TuningSlider`, but reads/writes one slot of
 * a `FilmLayer` tuple `SharedValue` (immutably: slice, mutate the copy,
 * reassign) instead of a plain scalar — so a curl layer's four fields can
 * each get their own slider without splitting the tuple into four separate
 * `SharedValue`s (which `uLayer0`/`1`/`2` are wired to as single `float4`s).
 */
function TupleTuningSlider({
  label,
  layer,
  index,
  min,
  max,
  decimals,
  defaultValue,
}: TupleTuningSliderProps) {
  const usable = TRACK_W - THUMB;

  const setFromX = (x: number) => {
    "worklet";
    const t = Math.min(Math.max((x - THUMB / 2) / usable, 0), 1);
    const next = layer.value.slice() as FilmLayer;
    next[index] = min + t * (max - min);
    layer.value = next;
  };

  const pan = Gesture.Pan()
    .onBegin((e) => setFromX(e.x))
    .onChange((e) => setFromX(e.x));

  const thumbStyle = useAnimatedStyle(() => {
    const t = (layer.value[index] - min) / (max - min);
    return { transform: [{ translateX: t * usable }] };
  });

  const fillStyle = useAnimatedStyle(() => {
    const t = (layer.value[index] - min) / (max - min);
    return { width: t * usable + THUMB / 2 };
  });

  const readoutProps = useAnimatedProps(() => {
    const text = layer.value[index].toFixed(decimals);
    return { text, defaultValue: text } as { text: string; defaultValue: string };
  });

  return (
    <View style={styles.resettableRow}>
      <View style={styles.row}>
        <View style={styles.header}>
          <Text style={styles.label}>{label}</Text>
          <AnimatedTextInput
            style={styles.readout}
            editable={false}
            animatedProps={readoutProps}
          />
        </View>

        <GestureDetector gesture={pan}>
          <View style={[styles.track, { width: TRACK_W }]} hitSlop={16}>
            <View style={[styles.trackBase, { width: TRACK_W }]} />
            <Animated.View style={[styles.fill, fillStyle]} />
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </GestureDetector>
      </View>
      <PressableScale
        onPress={() => {
          "worklet";
          const next = layer.value.slice() as FilmLayer;
          next[index] = defaultValue;
          layer.value = next;
        }}
        style={styles.resetButton}
      >
        <Text style={styles.resetButtonText}>↺</Text>
      </PressableScale>
    </View>
  );
}

// ============================================================================
// LayerSliders — one curl layer's (frequency, speed, angle, weight)
// ============================================================================

type LayerSlidersProps = {
  label: string;
  layer: SharedValue<FilmLayer>;
  layerDefault: FilmLayer;
  /** Tuple field specs. @default LAYER_FIELDS */
  fields?: typeof LAYER_FIELDS;
};

function LayerSliders({
  label,
  layer,
  layerDefault,
  fields = LAYER_FIELDS,
}: LayerSlidersProps) {
  return (
    <View style={styles.layerGroup}>
      <Text style={styles.layerLabel}>{label}</Text>
      {fields.map((field) => (
        <TupleTuningSlider
          key={field.index}
          label={field.label}
          layer={layer}
          index={field.index}
          min={field.min}
          max={field.max}
          decimals={field.decimals}
          defaultValue={layerDefault[field.index]}
        />
      ))}
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
  flow,
  color,
  defaults,
  initialTab = "shape",
}: SoapFilmTuningPanelProps) {
  const [tab, setTab] = useState<SoapFilmTuningTab>(initialTab);
  // 0-2 = curl layers, 3 = vortices.
  const [selectedLayer, setSelectedLayer] = useState<0 | 1 | 2 | 3>(0);
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
    flow.vortex.value = defaults.vortex;    flow.sineFreq.value = defaults.sineFreq;
    flow.sineSpeedA.value = defaults.sineSpeedA;
    flow.sineSpeedB.value = defaults.sineSpeedB;
    color.mode.value = defaults.mode;
    color.thicknessScale.value = defaults.thicknessScale;
    color.cosTheta.value = defaults.cosTheta;
    color.intensity.value = defaults.intensity;
    color.opacity.value = defaults.opacity;
    setColorMode(defaults.mode);
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

      {tab === "flow" && (
        <>
          {generator === "curl" ? (
            <>
              <View style={styles.generatorRow}>
                {([0, 1, 2, 3] as const).map((i) => (
                  <PressableScale
                    key={i}
                    onPress={() => setSelectedLayer(i)}
                    style={[
                      styles.generatorButton,
                      selectedLayer === i && styles.generatorButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.generatorButtonText,
                        selectedLayer === i && styles.generatorButtonTextActive,
                      ]}
                    >
                      {i === 3 ? "Vortex" : `Layer ${i}`}
                    </Text>
                  </PressableScale>
                ))}
              </View>

              {selectedLayer === 0 && (
                <LayerSliders
                  label="Layer 0"
                  layer={flow.layer0}
                  layerDefault={defaults.layer0}
                />
              )}
              {selectedLayer === 1 && (
                <LayerSliders
                  label="Layer 1"
                  layer={flow.layer1}
                  layerDefault={defaults.layer1}
                />
              )}
              {selectedLayer === 2 && (
                <LayerSliders
                  label="Layer 2"
                  layer={flow.layer2}
                  layerDefault={defaults.layer2}
                />
              )}
              {selectedLayer === 3 && (
                <LayerSliders
                  label="Vortices"
                  layer={flow.vortex}
                  layerDefault={defaults.vortex}
                  fields={VORTEX_FIELDS}
                />
              )}

              <ResettableSlider
                label="Swirl"
                value={flow.swirl}
                min={FILM_SWIRL_MIN}
                max={FILM_SWIRL_MAX}
                decimals={2}
                defaultValue={defaults.swirl}
              />
              <ResettableSlider
                label="Grain"
                value={flow.grain}
                min={FILM_GRAIN_MIN}
                max={FILM_GRAIN_MAX}
                decimals={1}
                defaultValue={defaults.grain}
              />
              <ResettableSlider
                label="Seed"
                value={flow.seed}
                min={0}
                max={10}
                decimals={2}
                defaultValue={defaults.seed}
              />
              <ResettableSlider
                label="Touch decay"
                value={flow.touchTau}
                min={FILM_TOUCH_TAU_MIN}
                max={FILM_TOUCH_TAU_MAX}
                decimals={2}
                defaultValue={defaults.touchTau}
              />            </>
          ) : (
            <>
              <ResettableSlider
                label="Sine freq"
                value={flow.sineFreq}
                min={0.5}
                max={6}
                decimals={2}
                defaultValue={defaults.sineFreq}
              />
              <ResettableSlider
                label="Sine speed A"
                value={flow.sineSpeedA}
                min={0}
                max={1.5}
                decimals={2}
                defaultValue={defaults.sineSpeedA}
              />
              <ResettableSlider
                label="Sine speed B"
                value={flow.sineSpeedB}
                min={0}
                max={1.5}
                decimals={2}
                defaultValue={defaults.sineSpeedB}
              />
            </>
          )}
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
  layerGroup: {
    gap: 8,
    paddingBottom: 4,
  },
  layerLabel: {
    color: "#8a8a8a",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
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
  row: {
    flex: 1,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  readout: {
    color: "#8a8a8a",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    padding: 0,
    minWidth: 44,
    textAlign: "right",
  },
  track: {
    height: THUMB,
    justifyContent: "center",
  },
  trackBase: {
    position: "absolute",
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: "#2E2E2E",
  },
  fill: {
    position: "absolute",
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: "#6a6a6a",
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#fff",
  },
});
