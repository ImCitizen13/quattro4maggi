/**
 * LensTab — the Lens tab body of SettingsPanel: tunes the lens live.
 *
 * FLOW:
 *   SettingsPanel (Lens tab selected) ─► renders this body inside its own shell
 *   group tab ─► Gravity / Glass / Hole sliders, or the Colors lists (local state)
 *   preset chip ─► applyLensPreset writes every SharedValue; color lists load the
 *     preset's palette (Black hole) or reset to default, texts and picks follow
 *   Colors, per effect (rim / halo):
 *     palette dropdown ─► paletteColors ─► setLensColors fills only that list
 *       (rim palette also sets Rainbow to 0)
 *     color text ─► parseColor ─► setLensColorAt (invalid text is ignored,
 *       previous color stays)
 *     − / + ─► drop the last color / repeat it (1..LENS_MAX_COLORS)
 *   TuningSlider drag ─► writes one SharedValue ─► lensScene reads it per frame
 *
 * KEY FEATURES:
 * - Body only: no Portal, no panel chrome, no close button (SettingsPanel owns them)
 * - Segmented Gravity | Glass | Hole | Colors group tabs and preset chips
 * - Active group only, three-column grid (sliders from LENS_SPEC, color cells)
 * - No re-render per drag tick: sliders and color lists are UI-thread SharedValues
 */
import { PressableScale } from "pressto";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { TuningSlider } from "@/components/liquid-metal/TuningSlider";
import { BLACK_HOLE_PALETTES } from "@/lib/palettes";
import {
  applyLensPreset,
  getLensColors,
  LENS_COLOR_NAMES,
  LENS_KEYS,
  LENS_MAX_COLORS,
  LENS_SPEC,
  paletteColors,
  parseColor,
  presetColors,
  presetPick,
  rgbToHex,
  setLensColorAt,
  setLensColors,
  type LensColorName,
  type LensKey,
  type LensPresetName,
  type LensTuneValues,
} from "./lensTune";

// ============================================================================
// Types
// ============================================================================

export type LensTabProps = {
  /** The lens knobs (SharedValues) the sliders and color lists read and write. */
  values: LensTuneValues;
  /** Width available to the body (panel width minus its padding), px. */
  width: number;
};

type LensGroup = "gravity" | "glass" | "hole" | "colors";

type ColorTexts = Record<LensColorName, string[]>;

/** Chosen palette per effect; null = custom (edited or default). */
type PalettePicks = Record<LensColorName, number | null>;

// ============================================================================
// Constants
// ============================================================================

const PRESETS: readonly LensPresetName[] = ["Gravity", "Gargantua", "Both", "Black hole"];
const GROUPS: readonly { id: LensGroup; title: string }[] = [
  { id: "gravity", title: "Gravity" },
  { id: "glass", title: "Glass" },
  { id: "hole", title: "Hole" },
  { id: "colors", title: "Colors" },
];

// Three columns, two gaps of 12.
const COLUMN_GAP = 12;
const COLUMNS = 3;

const COLOR_LABELS: Record<LensColorName, string> = {
  rim: "Rim",
  halo: "Halo",
};

const NO_PICKS: PalettePicks = { rim: null, halo: null };

const keysOf = (group: "gravity" | "glass" | "hole"): LensKey[] =>
  LENS_KEYS.filter((key) => LENS_SPEC[key].group === group);

// ============================================================================
// Components
// ============================================================================

type SwatchRowProps = {
  colors: readonly string[];
};

/** A row of color dots (invalid strings show black). */
const SwatchRow = ({ colors }: SwatchRowProps) => (
  <View style={styles.swatchRow}>
    {colors.map((color, i) => {
      const rgb = parseColor(color);
      return (
        <View
          key={`${color}-${i}`}
          style={[styles.dot, { backgroundColor: rgb ? rgbToHex(rgb) : "#000" }]}
        />
      );
    })}
  </View>
);

type ColorCellProps = {
  text: string;
  width: number;
  onChangeText: (text: string) => void;
};

/** One color of a list: live swatch + hex / "(r,g,b)" text input. */
const ColorCell = ({ text, width, onChangeText }: ColorCellProps) => {
  const rgb = parseColor(text);
  return (
    <View style={[styles.cell, { width }]}>
      <View style={[styles.dot, { backgroundColor: rgb ? rgbToHex(rgb) : "#000" }]} />
      <TextInput
        style={[styles.input, !rgb && styles.inputInvalid]}
        value={text}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="#rrggbb"
        placeholderTextColor="#666"
      />
    </View>
  );
};

type ColorListProps = {
  label: string;
  texts: string[];
  pick: number | null;
  open: boolean;
  columnWidth: number;
  onToggleMenu: () => void;
  onPickPalette: (index: number) => void;
  onChangeAt: (index: number, text: string) => void;
  onAdd: () => void;
  onRemove: () => void;
};

/** One effect's color list: palette dropdown, − / + and the color cells. */
const ColorList = ({
  label,
  texts,
  pick,
  open,
  columnWidth,
  onToggleMenu,
  onPickPalette,
  onChangeAt,
  onAdd,
  onRemove,
}: ColorListProps) => (
  <View style={styles.list}>
    <View style={styles.header}>
      <Text style={[styles.caption, styles.listLabel]}>{label}</Text>
      <PressableScale style={[styles.chip, styles.dropdown]} onPress={onToggleMenu}>
        <Text style={styles.label}>{pick === null ? "Custom" : (BLACK_HOLE_PALETTES[pick]?.name ?? "Custom")}</Text>
        <Text style={styles.label}>{open ? "▴" : "▾"}</Text>
      </PressableScale>
      <PressableScale
        style={[styles.chip, texts.length <= 1 && styles.chipDisabled]}
        enabled={texts.length > 1}
        onPress={onRemove}
      >
        <Text style={styles.label}>−</Text>
      </PressableScale>
      <PressableScale
        style={[styles.chip, texts.length >= LENS_MAX_COLORS && styles.chipDisabled]}
        enabled={texts.length < LENS_MAX_COLORS}
        onPress={onAdd}
      >
        <Text style={styles.label}>+</Text>
      </PressableScale>
    </View>
    {open && (
      <View style={styles.menu}>
        {BLACK_HOLE_PALETTES.map(({ name, colors }, i) => (
          <PressableScale
            key={name}
            style={[styles.menuItem, i === pick && styles.tabActive]}
            onPress={() => onPickPalette(i)}
          >
            <Text style={styles.label}>{name}</Text>
            <SwatchRow colors={colors} />
          </PressableScale>
        ))}
      </View>
    )}
    <View style={styles.grid}>
      {texts.map((text, i) => (
        <ColorCell
          key={i}
          text={text}
          width={columnWidth}
          onChangeText={(next) => onChangeAt(i, next)}
        />
      ))}
    </View>
  </View>
);

export const LensTab = ({ values, width }: LensTabProps) => {
  const [group, setGroup] = useState<LensGroup>("glass");
  const [menu, setMenu] = useState<LensColorName | null>(null);
  const [picks, setPicks] = useState<PalettePicks>(NO_PICKS);
  // The texts are the source of truth for the inputs; seeded from the lists.
  const [texts, setTexts] = useState<ColorTexts>(() => ({
    rim: getLensColors(values, "rim"),
    halo: getLensColors(values, "halo"),
  }));
  const columnWidth = (width - (COLUMNS - 1) * COLUMN_GAP) / COLUMNS;

  const setList = (name: LensColorName, list: string[], pick: number | null) => {
    setTexts((prev) => ({ ...prev, [name]: list }));
    setPicks((prev) => ({ ...prev, [name]: pick }));
  };

  // Invalid text is shown but never applied: the previous color stays.
  const changeAt = (name: LensColorName, index: number, text: string) => {
    setList(name, texts[name].map((t, i) => (i === index ? text : t)), null);
    setLensColorAt(values, name, index, text);
  };

  // − / + work on the applied list, so an invalid text never reaches the shader.
  const addColor = (name: LensColorName) => {
    const applied = getLensColors(values, name);
    const next = [...applied, applied[applied.length - 1]];
    if (setLensColors(values, name, next)) setList(name, next, null);
  };

  const removeColor = (name: LensColorName) => {
    const next = getLensColors(values, name).slice(0, -1);
    if (setLensColors(values, name, next)) setList(name, next, null);
  };

  const pickPalette = (name: LensColorName, index: number) => {
    const colors = paletteColors(index);
    setMenu(null);
    if (setLensColors(values, name, colors)) {
      setList(name, colors, index);
      // A rim palette replaces the rainbow, so turn the rainbow off.
      if (name === "rim") values.rainbow.value = 0;
    }
  };

  const pickPreset = (preset: LensPresetName) => {
    applyLensPreset(values, preset);
    setTexts({
      rim: presetColors(preset, "rim"),
      halo: presetColors(preset, "halo"),
    });
    setPicks({ rim: presetPick(preset, "rim"), halo: presetPick(preset, "halo") });
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
          <PressableScale key={name} style={styles.chip} onPress={() => pickPreset(name)}>
            <Text style={styles.label}>{name}</Text>
          </PressableScale>
        ))}
      </View>
      {group === "colors" ? (
        <View style={styles.colors}>
          {LENS_COLOR_NAMES.map((name) => (
            <ColorList
              key={name}
              label={COLOR_LABELS[name]}
              texts={texts[name]}
              pick={picks[name]}
              open={menu === name}
              columnWidth={columnWidth}
              onToggleMenu={() => setMenu((open) => (open === name ? null : name))}
              onPickPalette={(index) => pickPalette(name, index)}
              onChangeAt={(index, text) => changeAt(name, index, text)}
              onAdd={() => addColor(name)}
              onRemove={() => removeColor(name)}
            />
          ))}
        </View>
      ) : (
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
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  chipDisabled: { opacity: 0.35 },
  label: { color: "#fff", fontSize: 12, fontWeight: "600" },
  colors: { gap: 12 },
  list: { gap: 8 },
  listLabel: { width: 64 },
  dropdown: { flex: 1, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  menu: { gap: 4, padding: 4, borderRadius: 12, backgroundColor: "#0d0d0d" },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 8,
    borderRadius: 10,
  },
  swatchRow: { flexDirection: "row", gap: 4 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#ffffff40",
  },
  cell: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3a3a3a",
    backgroundColor: "#0d0d0d",
  },
  inputInvalid: { borderColor: "#ff5a5a" },
});
