/**
 * SettingsPanel — bottom-docked settings sheet with Sim and Lens tabs.
 *
 * FLOW:
 *   gear button (navigation header, BlackHoleGpu) ─► mounts this panel through a Portal
 *   top-level tab ─► Sim (default) or Lens body (local state)
 *   Sim: Speed slider ─► SharedValue; tile / Sticky chips ─► onPickTile / onToggleSticky
 *   Lens: LensTab sliders and presets ─► SharedValues read by lensScene per frame
 *   ✕ ─► onClose (the panel covers the HUD, so it is the only way out besides the gear)
 *
 * KEY FEATURES:
 * - Docked at the screen bottom over the HUD: the stage above never resizes
 * - FadeInDown / FadeOutDown shell, header with segmented Sim | Lens tabs and ✕
 * - Sim tab: status line (tiles · encode ms), Speed × slider, tile chips (8/4/2 px), Sticky chip
 * - Lens tab: LensTab body (Gravity/Glass groups, presets, slider grid)
 * - No re-render per drag tick: sliders are UI-thread SharedValues
 */
import { Portal } from "@gorhom/portal";
import { PressableScale } from "pressto";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TuningSlider } from "@/components/liquid-metal/TuningSlider";
import { LensTab } from "./LensPanel";
import type { LensTuneValues } from "./lensTune";
import { SPEED_MAX, SPEED_MIN } from "./vortexScene";

// ============================================================================
// Types
// ============================================================================

export type SettingsPanelProps = {
  /** The lens knobs (SharedValues) for the Lens tab. */
  lensValues: LensTuneValues;
  /** Sim speed multiplier the Speed slider reads and writes. */
  speed: SharedValue<number>;
  /** Tile sizes offered as chips, px. */
  tileSizes: readonly number[];
  /** Current tile size, px. */
  tile: number;
  /** Sticky patches on. */
  sticky: boolean;
  /** Status line shown at the top of the Sim tab. */
  status: string;
  /** Screen width, px. */
  width: number;
  onPickTile: (size: number) => void;
  onToggleSticky: () => void;
  /** Called when the close button is pressed. */
  onClose: () => void;
};

type SettingsTab = "sim" | "lens";

// ============================================================================
// Constants
// ============================================================================

const TABS: readonly { id: SettingsTab; title: string }[] = [
  { id: "sim", title: "Sim" },
  { id: "lens", title: "Lens" },
];

const PADDING = 16;

// ============================================================================
// Component
// ============================================================================

export const SettingsPanel = ({
  lensValues,
  speed,
  tileSizes,
  tile,
  sticky,
  status,
  width,
  onPickTile,
  onToggleSticky,
  onClose,
}: SettingsPanelProps) => {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SettingsTab>("sim");
  const bodyWidth = width - 2 * PADDING;

  return (
    <Portal>
      <Animated.View
        style={[styles.panel, { paddingBottom: PADDING + insets.bottom }]}
        entering={FadeInDown.springify()}
        exiting={FadeOutDown}
      >
        <View style={styles.header}>
          <View style={styles.tabs}>
            {TABS.map(({ id, title }) => (
              <PressableScale
                key={id}
                style={[styles.tab, tab === id && styles.tabActive]}
                onPress={() => setTab(id)}
              >
                <Text style={[styles.tabLabel, tab === id && styles.tabLabelActive]}>
                  {title}
                </Text>
              </PressableScale>
            ))}
          </View>
          <PressableScale style={styles.close} onPress={onClose}>
            <Text style={styles.label}>✕</Text>
          </PressableScale>
        </View>
        {tab === "sim" ? (
          <View style={styles.body}>
            <Text style={styles.status}>{status}</Text>
            <TuningSlider
              label="Speed ×"
              value={speed}
              min={SPEED_MIN}
              max={SPEED_MAX}
              decimals={2}
              width={bodyWidth}
            />
            <View style={styles.row}>
              {tileSizes.map((size) => (
                <PressableScale
                  key={size}
                  style={[styles.chip, tile === size && styles.chipActive]}
                  onPress={() => onPickTile(size)}
                >
                  <Text style={styles.label}>{size} px</Text>
                </PressableScale>
              ))}
              <PressableScale
                style={[styles.chip, sticky && styles.chipActive]}
                onPress={onToggleSticky}
              >
                <Text style={styles.label}>Sticky</Text>
              </PressableScale>
            </View>
          </View>
        ) : (
          <LensTab values={lensValues} width={bodyWidth} />
        )}
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
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: "#3a3a3a" },
  tabLabel: { color: "#fff", opacity: 0.5, fontSize: 12, fontWeight: "600" },
  tabLabelActive: { opacity: 1 },
  close: {
    marginLeft: "auto",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  body: { gap: 12 },
  status: {
    color: "#fff",
    opacity: 0.7,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  row: { flexDirection: "row", gap: 12 },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  chipActive: { backgroundColor: "#4a3a8a" },
  label: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
