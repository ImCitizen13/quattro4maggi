/**
 * BlackHoleGpu — HUD + settings over `VortexSnapshot`: a React Native view
 * swallowed by a GPU particle vortex.
 *
 * FLOW:
 *   push transition ends ─► `enabled` ─► the wrapper (prewarm) builds the snapshot
 *     texture + standby scene once (see useVortexRun for the run state machine)
 *   <VortexSnapshot> around DemoContent; run state mirrored via onStateChange
 *     └─ Destroy (idle) ─► handle.swallow() (hole at the center); Destroy (paused) ─► handle.resume
 *     └─ Pause (running) ─► handle.pause
 *     └─ scrub the progress bar ─► `seekTarget`; release ─► handle.scrubEnd
 *     └─ Reset (paused / done) ─► handle.reset + status "idle"
 *     └─ tile / Sticky chips ─► wrapper props (live)
 *   onStats ─► `status` text shown in the settings panel
 *
 * KEY FEATURES:
 * - Thin UI layer: all run / GPU state lives in the wrapper (useVortexRun);
 *   `touchOrigin` off so the hole always opens in the middle
 * - Two-button HUD (Destroy, Pause/Reset) under a full-width progress bar / scrubber;
 *   fixed height in every state (the stage size drives a GPU rebuild)
 * - Gear button in the navigation header toggles SettingsPanel (portal, floats over
 *   the HUD, never resizes the stage): Sim tab (status, Speed 0.25×–4×, tile chips
 *   8/4/2 px, Sticky chip) and Lens tab (14 live knobs, rim/halo/specular color
 *   lists with palette picks, three presets)
 * - Wait for the push transition so the pre-build doesn't compete with it
 * - FpsOverlay ui row
 * - Dev: lens knobs + speed also in the DevTools Dials panel (lensDials.ts)
 */
import { Stack, useNavigation } from "expo-router";
import { PressableScale } from "pressto";
import { useEffect, useRef, useState } from "react";
import { LogBox, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FpsOverlay } from "@/components/common/FpsOverlay";
import { DemoContent } from "./DemoContent";
import { useLensDials } from "./lensDials";
import { useLensTune } from "./lensTune";
import { ProgressBar } from "./ProgressBar";
import { SettingsPanel } from "./SettingsPanel";
import type { RunState } from "./useVortexRun";
import { VortexSnapshot, type VortexSnapshotHandle } from "./VortexSnapshot";
import {
  DEFAULT_SPEED,
  DEFAULT_VORTEX,
  SPACE_COLOR,
  TILE_SIZES,
  TRANSITION_FALLBACK_MS,
} from "./vortexConstants";
import type { VortexStats } from "./vortexScene";

// ============================================================================
// Types
// ============================================================================

export type { RunState, ShowMode } from "./useVortexRun";

type TransitionNavigation = {
  addListener: (
    type: "transitionEnd",
    callback: (e: { data: { closing: boolean } }) => void,
  ) => () => void;
};

// ============================================================================
// Constants
// ============================================================================

// TypeGPU logs this once per process on the first UI-runtime transfer (no
// WeakRef in worklet runtimes → strong identity cache). Harmless, but its
// LogBox toast sits over the chip row and swallows taps.
LogBox.ignoreLogs(["WeakRef is not available in this worklet runtime"]);

// ============================================================================
// Helpers
// ============================================================================

const formatStats = ({ count, encodeMs }: VortexStats) =>
  `${count.toLocaleString()} tiles · encode ${encodeMs.toFixed(2)} ms`;

// ============================================================================
// Component
// ============================================================================

export const BlackHoleGpu = () => {
  // The stack's `transitionEnd` event isn't in the generic navigation typing.
  const navigation = useNavigation() as unknown as TransitionNavigation;
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const speed = useSharedValue(DEFAULT_SPEED);
  const progress = useSharedValue(0);
  const paused = useSharedValue(false);
  const seekTarget = useSharedValue(-1);
  const vortex = useRef<VortexSnapshotHandle>(null);  const lensTune = useLensTune();
  useLensDials(lensTune, speed);
  const [transitioned, setTransitioned] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [status, setStatus] = useState("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [run, setRun] = useState<RunState>("idle");
  const [tile, setTile] = useState<number>(DEFAULT_VORTEX.tile);
  const [sticky, setSticky] = useState(true);
  // A run was requested and not reset (the RN view may be hidden).
  const active = run !== "idle" && run !== "capturing";
  // Wait for the push transition so the pre-build doesn't compete with it.
  useEffect(() => {
    const unsubscribe = navigation.addListener("transitionEnd", (e) => {
      if (!e.data.closing) setTransitioned(true);
    });
    const timer = setTimeout(() => setTransitioned(true), TRANSITION_FALLBACK_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [navigation]);

  // Destroy: capture and start from idle, continue from paused.
  const destroy = () => {
    if (run === "idle") {
      // Rejects on Reset / relayout; the HUD already follows `run`.
      vortex.current?.swallow().catch(() => {});
    } else if (run === "paused") {
      vortex.current?.resume();
    }
  };

  const onReset = () => {
    vortex.current?.reset();
    setStatus("idle");
  };

  const canDestroy = run === "idle" || run === "paused";
  const canReset = run === "paused" || run === "done";
  const canPause = run === "running";
  const pauseResetEnabled = canPause || canReset;

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <VortexSnapshot
          ref={vortex}
          prewarm
          touchOrigin={false}
          background={SPACE_COLOR}
          enabled={transitioned}
          ready={imageLoaded}
          tile={tile}
          sticky={sticky}
          speed={speed}
          progress={progress}
          paused={paused}
          seekTarget={seekTarget}
          lensTune={lensTune}
          onStateChange={setRun}
          onStats={(s) => setStatus(formatStats(s))}
          style={styles.fill}
          contentStyle={styles.fill}
        >
          <DemoContent onImageLoad={() => setImageLoaded(true)} />
        </VortexSnapshot>
        <FpsOverlay dark />
      </View>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PressableScale
              style={[styles.gear, settingsOpen && styles.chipActive]}
              hitSlop={8}
              onPress={() => setSettingsOpen((open) => !open)}
            >
              <Text style={styles.gearLabel}>⚙</Text>
            </PressableScale>
          ),
        }}
      />
      {settingsOpen && (
        <SettingsPanel
          lensValues={lensTune}
          speed={speed}
          tileSizes={TILE_SIZES}
          tile={tile}
          sticky={sticky}
          status={status}
          width={winW}
          onPickTile={setTile}
          onToggleSticky={() => setSticky((s) => !s)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <View style={[styles.hud, { paddingBottom: 16 + insets.bottom }]}>
        <ProgressBar
          progress={progress}
          seekTarget={seekTarget}
          paused={paused}
          enabled={active}
          width={winW - 32}
          onScrubEnd={() => vortex.current?.scrubEnd()}
        />
        <View style={styles.row}>
          <PressableScale
            style={[styles.button, !canDestroy && styles.dim]}
            enabled={canDestroy}
            onPress={destroy}
          >
            <Text style={styles.label}>Destroy</Text>
          </PressableScale>
          <PressableScale
            style={[styles.button, !pauseResetEnabled && styles.dim]}
            enabled={pauseResetEnabled}
            onPress={canReset ? onReset : () => vortex.current?.pause()}
          >
            <Text style={styles.label}>{canReset ? "Reset" : "Pause"}</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
  stage: { flex: 1 },
  fill: { flex: 1 },
  hud: { padding: 16, gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  chipActive: { backgroundColor: "#4a3a8a" },
  dim: { opacity: 0.4 },
  gear: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  gearLabel: { color: "#fff", fontSize: 20 },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  label: { color: "#fff", fontWeight: "600" },
});
