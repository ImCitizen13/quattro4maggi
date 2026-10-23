/**
 * LensPanel — bottom-docked panel that tunes the lens live.
 *
 * FLOW:
 *   Lens button (BlackHoleGpu) ─► mounts this panel through a Portal
 *   group tab ─► shows that group's sliders only (local state)
 *   preset chip ─► applyLensPreset writes every SharedValue
 *   TuningSlider drag ─► writes one SharedValue ─► lensScene reads it per frame
 *   ✕ ─► onClose (the panel covers the HUD, so it is the only way out)
 *
 * KEY FEATURES:
 * - Docked at the screen bottom over the HUD: the hole above stays uncovered
 * - Header: segmented group tabs, preset chips, close button
 * - Active group only, three-column slider grid from LENS_SPEC
 * - No re-render per drag tick: sliders are UI-thread SharedValues
 */
import { Portal } from "@gorhom/portal";
import { PressableScale } from "pressto";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TuningSlider } from "@/components/liquid-metal/TuningSlider";
import {
  applyLensPreset,
  LENS_KEYS,
  LENS_SPEC,
  type LensKey,
  type LensPresetName,
  type LensTuneValues,
} from "./lensTune";

// ============================================================================
// Types
// ============================================================================

export type LensPanelProps = {
  /** The lens knobs (SharedValues) the sliders read and write. */
  values: LensTuneValues;
  /** Screen width, px. */
  width: number;
  /** Called when the close button is pressed. */
  onClose: () => void;
};

type LensGroup = "gravity" | "glass";

// ============================================================================
// Constants
// ============================================================================

const PRESETS: readonly LensPresetName[] = ["Gravity", "Gargantua", "Both"];
const GROUPS: readonly { id: LensGroup; title: string }[] = [
  { id: "gravity", title: "Gravity" },
  { id: "glass", title: "Glass" },
];

// Panel padding (16) both sides; three columns, two gaps of 12.
const COLUMN_GAP = 12;
const PADDING = 16;
const COLUMNS = 3;

const keysOf = (group: LensGroup): LensKey[] =>
  LENS_KEYS.filter((key) => LENS_SPEC[key].group === group);

// ============================================================================
// Component
// ============================================================================

export const LensPanel = ({ values, width, onClose }: LensPanelProps) => {
  const insets = useSafeAreaInsets();
  const [group, setGroup] = useState<LensGroup>("glass");
  const columnWidth =
    (width - 2 * PADDING - (COLUMNS - 1) * COLUMN_GAP) / COLUMNS;

  return (
    <Portal>
      <Animated.View
        style={[styles.panel, { paddingBottom: 16 + insets.bottom }]}
        entering={FadeInDown.springify()}
        exiting={FadeOutDown}
      >
        <View style={styles.header}>
          <View style={styles.tabs}>
            {GROUPS.map(({ id, title }) => (
              <PressableScale
                key={id}
                style={[styles.tab, group === id && styles.tabActive]}
                onPress={() => setGroup(id)}
              >
                <Text style={[styles.tabLabel, group === id && styles.tabLabelActive]}>
                  {title}
                </Text>
              </PressableScale>
            ))}
          </View>
          <PressableScale style={styles.close} onPress={onClose}>
            <Text style={styles.label}>✕</Text>
          </PressableScale>
        </View>
        <View style={styles.header}>
          <Text style={styles.caption}>Preset</Text>
          {PRESETS.map((name) => (
            <PressableScale
              key={name}
              style={styles.chip}
              onPress={() => applyLensPreset(values, name)}
            >
              <Text style={styles.label}>{name}</Text>
            </PressableScale>
          ))}
        </View>
        <View style={styles.grid}>
          {keysOf(group).map((key) => {
            const spec = LENS_SPEC[key];
            return (
              <View key={key} style={{ width: columnWidth }}>
                <TuningSlider
                  label={spec.label}
                  value={values[key]}
                  min={spec.min}
                  max={spec.max}
                  decimals={spec.decimals}
                  width={columnWidth}
                />
              </View>
            );
          })}
        </View>
      </Animated.View>
    </Portal>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: PADDING,
    gap: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: "#1a1a1a",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  tabs: {
    flexDirection: "row",
    padding: 2,
    borderRadius: 12,
    backgroundColor: "#0d0d0d",
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: "#3a3a3a" },
  tabLabel: { color: "#fff", opacity: 0.5, fontSize: 12, fontWeight: "600" },
  tabLabelActive: { opacity: 1 },
  caption: {
    color: "#fff",
    opacity: 0.5,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginRight: 4,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: COLUMN_GAP },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  close: {
    marginLeft: "auto",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  label: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
