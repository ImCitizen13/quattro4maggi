/**
 * LensTab — the Lens tab body of SettingsPanel: tunes the lens live.
 *
 * FLOW:
 *   SettingsPanel (Lens tab selected) ─► renders this body inside its own shell
 *   group tab ─► shows that group's sliders only (local state)
 *   preset chip ─► applyLensPreset writes every SharedValue, color texts reset
 *   color text / swatch / palette ─► parseColor ─► writes the rim/halo/spec
 *     channel SharedValues (invalid text is ignored, previous color stays)
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
import { StyleSheet, Text, TextInput, View } from "react-native";
import { TuningSlider } from "@/components/liquid-metal/TuningSlider";
import { LIVE_BORDER_PALETTES } from "@/lib/palettes";
import {
  applyLensPreset,
  getLensColorHex,
  LENS_COLOR_DEFAULTS,
  LENS_COLOR_NAMES,
  LENS_KEYS,
  LENS_SPEC,
  parseColor,
  rgbToHex,
  setLensColor,
  type LensColorName,
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

const COLOR_LABELS: Record<LensColorName, string> = {
  rim: "Rim",
  halo: "Halo",
  spec: "Specular",
};

const keysOf = (group: LensGroup): LensKey[] =>
  LENS_KEYS.filter((key) => LENS_SPEC[key].group === group);

// ============================================================================
// Components
// ============================================================================

type SwatchRowProps = {
  colors: readonly string[];
  onPick?: (color: string) => void;
};

/** A row of color dots; tappable when onPick is given. */
const SwatchRow = ({ colors, onPick }: SwatchRowProps) => (
  <View style={styles.swatchRow}>
    {colors.map((color, i) => (
      <PressableScale
        key={`${color}-${i}`}
        enabled={!!onPick}
        style={[styles.swatch, { backgroundColor: color }]}
        onPress={() => onPick?.(color)}
      />
    ))}
  </View>
);

type ColorFieldProps = {
  label: string;
  text: string;
  /** Colors of the chosen palette, offered as swatches. */
  palette: readonly string[];
  onChangeText: (text: string) => void;
};

/** Color text input with a live swatch and the palette's swatch picker. */
const ColorField = ({ label, text, palette, onChangeText }: ColorFieldProps) => {
  const rgb = parseColor(text);
  const valid = rgb !== null;
  return (
    <View style={styles.field}>
      <Text style={styles.caption}>{label}</Text>
      <View style={styles.fieldRow}>
        <View style={[styles.swatch, { backgroundColor: rgb ? rgbToHex(rgb) : "#000" }]} />
        <TextInput
          style={[styles.input, !valid && styles.inputInvalid]}
          value={text}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#rrggbb or (r,g,b)"
          placeholderTextColor="#666"
        />
        <SwatchRow colors={palette} onPick={onChangeText} />
      </View>
    </View>
  );
};

export const LensTab = ({ values, width }: LensTabProps) => {
  const [group, setGroup] = useState<LensGroup>("glass");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The text is the source of truth; seeded from the current channels.
  const [texts, setTexts] = useState<Record<LensColorName, string>>(() => ({
    rim: getLensColorHex(values, "rim"),
    halo: getLensColorHex(values, "halo"),
    spec: getLensColorHex(values, "spec"),
  }));
  const columnWidth = (width - (COLUMNS - 1) * COLUMN_GAP) / COLUMNS;
  const palette = LIVE_BORDER_PALETTES[paletteIndex];

  // Invalid text is shown but never applied: the previous color stays.
  const changeColor = (name: LensColorName, text: string) => {
    setTexts((prev) => ({ ...prev, [name]: text }));
    setLensColor(values, name, text);
  };

  const pickPalette = (index: number) => {
    const colors = LIVE_BORDER_PALETTES[index];
    setPaletteIndex(index);
    setPaletteOpen(false);
    LENS_COLOR_NAMES.forEach((name, i) => changeColor(name, colors[i % colors.length]));
  };

  const pickPreset = (name: LensPresetName) => {
    applyLensPreset(values, name);
    setTexts({ ...LENS_COLOR_DEFAULTS });
  };

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
            onPress={() => pickPreset(name)}
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
      {group === "glass" && (
        <View style={styles.colors}>
          <View style={styles.header}>
            <Text style={styles.caption}>Palette</Text>
            <PressableScale
              style={[styles.chip, styles.dropdown]}
              onPress={() => setPaletteOpen((open) => !open)}
            >
              <Text style={styles.label}>Palette {paletteIndex + 1}</Text>
              <SwatchRow colors={palette} />
              <Text style={styles.label}>{paletteOpen ? "▴" : "▾"}</Text>
            </PressableScale>
          </View>
          {paletteOpen && (
            <View style={styles.menu}>
              {LIVE_BORDER_PALETTES.map((colors, i) => (
                <PressableScale
                  key={i}
                  style={[styles.menuItem, i === paletteIndex && styles.tabActive]}
                  onPress={() => pickPalette(i)}
                >
                  <Text style={styles.label}>Palette {i + 1}</Text>
                  <SwatchRow colors={colors} />
                </PressableScale>
              ))}
            </View>
          )}
          {LENS_COLOR_NAMES.map((name) => (
            <ColorField
              key={name}
              label={COLOR_LABELS[name]}
              text={texts[name]}
              palette={palette}
              onChangeText={(text) => changeColor(name, text)}
            />
          ))}
        </View>
      )}
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
  colors: { gap: 8 },
  dropdown: { flexDirection: "row", alignItems: "center", gap: 8 },
  menu: { gap: 4, padding: 4, borderRadius: 12, backgroundColor: "#0d0d0d" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 8,
    borderRadius: 10,
  },
  swatchRow: { flexDirection: "row", gap: 4 },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#ffffff40",
  },
  field: { gap: 4 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    backgroundColor: "#0d0d0d",
  },
  inputInvalid: { borderColor: "#ff5a5a" },
});
