/**
 * BlackHoleGpu — HUD + settings over `useVortexRun`: a React Native view
 * swallowed by a GPU particle vortex.
 *
 * FLOW:
 *   push transition ends ─► `enabled` ─► useVortexRun builds the snapshot texture
 *     + standby scene once (see useVortexRun for the run state machine)
 *   DemoContent (RN view, collapsable={false}) ─► `viewRef` / `onLayout` from the hook
 *     └─ Destroy (idle) ─► actions.release; Destroy (paused) ─► actions.resume
 *     └─ Pause (running) ─► actions.pause
 *     └─ scrub the progress bar ─► `seekTarget`; release ─► actions.onScrubEnd
 *     └─ Reset (paused / done) ─► actions.reset + status "idle"
 *   onStats ─► `status` text shown in the settings panel
 *
 * KEY FEATURES:
 * - Thin UI layer: all run / GPU state lives in useVortexRun
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
import { useEffect, useState } from "react";
import { LogBox, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { Canvas } from "react-native-webgpu";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FpsOverlay } from "@/components/common/FpsOverlay";
import { DemoContent } from "./DemoContent";
import { useLensDials } from "./lensDials";
import { useLensTune } from "./lensTune";
import { ProgressBar } from "./ProgressBar";
import { SettingsPanel } from "./SettingsPanel";
import { useVortexRun } from "./useVortexRun";
import { SPACE_COLOR, type VortexStats } from "./vortexScene";

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

const TILE_SIZES = [8, 4, 2] as const;

// Build the scene anyway if the push transition's `transitionEnd` never fires.
const TRANSITION_FALLBACK_MS = 1000;

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
  const speed = useSharedValue(1);
  const lensTune = useLensTune();
  useLensDials(lensTune, speed);
  const [transitioned, setTransitioned] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [status, setStatus] = useState("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    run,
    show,
    hasScene,
    canvasRef,
    viewRef,
    onLayout,
    progress,
    paused,
    seekTarget,
    tile,
    sticky,
    actions,
  } = useVortexRun({
    enabled: transitioned,
    ready: imageLoaded,
    clearColor: SPACE_COLOR,
    lensTune,
    speed,
    onStats: (s) => setStatus(formatStats(s)),
  });
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
      actions.release();
    } else if (run === "paused") {
      actions.resume();
    }
  };

  const onReset = () => {
    actions.reset();
    setStatus("idle");
  };

  const canDestroy = run === "idle" || run === "paused";
  const canReset = run === "paused" || run === "done";
  const canPause = run === "running";
  const pauseResetEnabled = canPause || canReset;

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <View style={[styles.fill, show === "gpu" && styles.hidden]}>
          <DemoContent
            ref={viewRef}
            onLayout={onLayout}
            onImageLoad={() => setImageLoaded(true)}
          />
        </View>
        <Canvas
          ref={canvasRef}
          style={[
            styles.overlay,
            show === "rn" && (hasScene ? styles.starting : styles.hidden),
          ]}
          pointerEvents="none"
        />
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
          onPickTile={actions.pickTile}
          onToggleSticky={actions.toggleSticky}
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
          onScrubEnd={actions.onScrubEnd}
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
            onPress={canReset ? onReset : actions.pause}
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
  overlay: StyleSheet.absoluteFill,
  hidden: { opacity: 0 },
  // Canvas while the standby scene exists and the RN view shows (idle, or a
  // run starting until onStarted): the scene keeps the layer composited at 0.01
  // and its idle frame is transparent. At opacity 0 Core Animation never
  // recycles drawables → the third getCurrentTexture() waits out Metal's 1 s
  // nextDrawable timeout.
  starting: { opacity: 0.01 },
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
