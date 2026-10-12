/**
 * TextTuningPanel — live controls for the greeting text and its bubble.
 * (The bubble's own look and size live in `BubbleTuningPanel`.)
 * Design notes: README.md → "TextTuningPanel.tsx".
 *
 * FLOW:
 *   each slider writes a SharedValue on the UI thread (TuningSlider)
 *   ↺ writes that value's default back; "Reset all" writes every default
 *
 * KEY FEATURES:
 * - No React re-render while dragging: the text's transform, underline and
 *   the pinned bubble all read these SharedValues in derived values.
 * - Render it AFTER the canvas so nothing under it steals the touches.
 */

import { PressableScale } from "pressto";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import {
  TuningSlider,
  type TuningSliderProps,
} from "@/components/liquid-metal/TuningSlider";

import {
  TEXT_BUBBLE_X_DEFAULT,
  TEXT_BUBBLE_Y_DEFAULT,
  TEXT_SIZE_DEFAULT,
  TEXT_Y_DEFAULT,
  UNDERLINE_GAP_DEFAULT,
  UNDERLINE_WIDTH_DEFAULT,
} from "./multiBubbleConfig";

// ============================================================================
// Types
// ============================================================================

export type TextControls = {
  /** Font size, pt (scales the text group). */
  size: SharedValue<number>;
  /** Vertical offset from the screen center, pt. */
  y: SharedValue<number>;
  /** Underline thickness, pt (0 hides it). */
  underlineWidth: SharedValue<number>;
  /** Underline gap below the baseline, pt. */
  underlineGap: SharedValue<number>;
  /** Pinned bubble offset from the paragraph's center, pt. */
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
};

export type TextTuningPanelProps = {
  controls: TextControls;
  /** Canvas size, pt — bounds the bubble X/Y sliders. */
  width: number;
  height: number;
};

type ResettableSliderProps = Omit<TuningSliderProps, "width"> & {
  defaultValue: number;
};

// ============================================================================
// Component
// ============================================================================

function ResettableSlider({ defaultValue, ...sliderProps }: ResettableSliderProps) {
  const { value } = sliderProps;
  return (
    <View style={styles.row}>
      <TuningSlider {...sliderProps} width={250} />
      <PressableScale
        onPress={() => {
          "worklet";
          value.value = defaultValue;
        }}
        style={styles.resetButton}
      >
        <Text style={styles.resetText}>↺</Text>
      </PressableScale>
    </View>
  );
}

export function TextTuningPanel({
  controls,
  width,
  height,
}: TextTuningPanelProps) {
  const halfW = Math.round(width / 2);
  const halfH = Math.round(height / 2);

  const resetAll = () => {
    "worklet";
    controls.size.value = TEXT_SIZE_DEFAULT;
    controls.y.value = TEXT_Y_DEFAULT;
    controls.underlineWidth.value = UNDERLINE_WIDTH_DEFAULT;
    controls.underlineGap.value = UNDERLINE_GAP_DEFAULT;
    controls.bubbleX.value = TEXT_BUBBLE_X_DEFAULT;
    controls.bubbleY.value = TEXT_BUBBLE_Y_DEFAULT;
  };

  return (
    <View style={styles.panel}>
      <ResettableSlider
        label="Size"
        value={controls.size}
        min={12}
        max={72}
        defaultValue={TEXT_SIZE_DEFAULT}
      />
      <ResettableSlider
        label="Vertical"
        value={controls.y}
        min={-300}
        max={300}
        defaultValue={TEXT_Y_DEFAULT}
      />
      <ResettableSlider
        label="Underline width"
        value={controls.underlineWidth}
        min={0}
        max={16}
        decimals={1}
        defaultValue={UNDERLINE_WIDTH_DEFAULT}
      />
      <ResettableSlider
        label="Underline gap"
        value={controls.underlineGap}
        min={0}
        max={24}
        decimals={1}
        defaultValue={UNDERLINE_GAP_DEFAULT}
      />
      <ResettableSlider
        label="Bubble X"
        value={controls.bubbleX}
        min={-halfW}
        max={halfW}
        defaultValue={TEXT_BUBBLE_X_DEFAULT}
      />
      <ResettableSlider
        label="Bubble Y"
        value={controls.bubbleY}
        min={-halfH}
        max={halfH}
        defaultValue={TEXT_BUBBLE_Y_DEFAULT}
      />
      <PressableScale onPress={resetAll} style={styles.resetAll}>
        <Text style={styles.resetAllText}>Reset all</Text>
      </PressableScale>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    padding: 16,
    gap: 12,
    borderRadius: 12,
    backgroundColor: "rgba(26, 26, 26, 0.92)",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  resetButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2E2E2E",
  },
  resetText: {
    color: "#fff",
    fontSize: 16,
  },
  resetAll: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#2E2E2E",
  },
  resetAllText: {
    color: "#fff",
    fontWeight: "600",
  },
});
