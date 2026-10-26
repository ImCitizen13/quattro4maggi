/**
 * LensTab — the Lens tab body of SettingsPanel: tunes the lens live.
 *
 * FLOW:
 *   SettingsPanel (Lens tab selected) ─► renders this body inside its own shell
 *   group tab ─► shows that group's sliders only (local state)
 *   preset chip ─► applyLensPreset writes every SharedValue
 *   TuningSlider drag ─► writes one SharedValue ─► lensScene reads it per frame
 *
 * KEY FEATURES:
 * - Body only: no Portal, no panel chrome, no close button (SettingsPanel owns them)
 * - Segmented Gravity | Glass group tabs and preset chips
 * - Active group only, three-column slider grid from LENS_SPEC
 * - No re-render per drag tick: sliders are UI-thread SharedValues
 */
import { PressableScale } from "pressto";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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

export type LensTabProps = {
  /** The lens knobs (SharedValues) the sliders read and write. */
  values: LensTuneValues;
  /** Width available to the body (panel width minus its padding), px. */
  width: number;
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

// Three slider columns, two gaps of 12.
const COLUMN_GAP = 12;
const COLUMNS = 3;

const keysOf = (group: LensGroup): LensKey[] =>
  LENS_KEYS.filter((key) => LENS_SPEC[key].group === group);

// ============================================================================
// Component
// ============================================================================

export const LensTab = ({ values, width }: LensTabProps) => {
  const [group, setGroup] = useState<LensGroup>("glass");
  const columnWidth = (width - (COLUMNS - 1) * COLUMN_GAP) / COLUMNS;

  return (
    <View style={styles.body}>
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
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  body: { gap: 12 },
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
  label: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
