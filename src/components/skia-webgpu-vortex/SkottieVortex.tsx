/**
 * SkottieVortex — the Skottie tab: a scrollable Skia/Skottie list that the
 * vortex swallows whole, with the Black Hole GPU HUD and settings.
 *
 * FLOW:
 *   stage onLayout (pt) ─► useSkottieListSource: Skia draws the list into a
 *     shared GPU texture ─► <VortexCanvas source drawSource> shows it (standby)
 *   standby: pan scrolls the list (scrollEnabled true)
 *   Destroy ─► scrollEnabled false ─► handle.swallow() (hole at the center);
 *     tiles keep animating (drawSource still runs) unless "Freeze content on
 *     Destroy" is on; Destroy while paused ─► handle.resume
 *   Pause (running) ─► handle.pause; scrub ProgressBar ─► seekTarget / scrubEnd
 *   Reset (paused / done) ─► handle.reset ─► standby, scrollEnabled true
 *   gear ─► SettingsPanel (Sim + Lens tabs, Black hole lens preset by default)
 *
 * KEY FEATURES:
 * - Reuses ProgressBar, SettingsPanel, useLensTune from black-hole-gpu
 * - Gesture split: list pan only in standby; the scrubber owns touches otherwise
 * - Freeze toggle: the drawSource wrapper skips drawing once a run is active
 * - Timing: logs `[SkottieVortex] tap→first running frame N ms` per Destroy,
 *   plus the `[VortexCanvas]` standby / running stats lines
 * - Teardown: unmount (tab switch) tears the canvas down first; the hook
 *   destroys the texture 200 ms later
 */
import { ProgressBar } from "@/components/black-hole-gpu/ProgressBar";
import { SettingsPanel } from "@/components/black-hole-gpu/SettingsPanel";
import type { RunState } from "@/components/black-hole-gpu/useVortexRun";
import {
  VortexCanvas,
  type VortexCanvasHandle,
} from "@/components/black-hole-gpu/VortexCanvas";
import { useLensTune } from "@/components/black-hole-gpu/lensTune";
import {
  DEFAULT_SPEED,
  DEFAULT_VORTEX,
  TILE_SIZES,
} from "@/components/black-hole-gpu/vortexConstants";
import type { VortexStats } from "@/components/black-hole-gpu/vortexScene";
import { PressableScale } from "pressto";
import { useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { cancelAnimation, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type SkottieStage, useSkottieListSource } from "./useSkottieListSource";

// ============================================================================
// Types
// ============================================================================

export type SkottieVortexProps = {
  /** Initial tile size in px. Default DEFAULT_VORTEX.tile. */
  initialTile?: number;
};

// ============================================================================
// Component
// ============================================================================

export const SkottieVortex = ({ initialTile }: SkottieVortexProps) => {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const vortex = useRef<VortexCanvasHandle>(null);
  const lensTune = useLensTune();
  const speed = useSharedValue(DEFAULT_SPEED);
  const progress = useSharedValue(0);
  const paused = useSharedValue(false);
  const seekTarget = useSharedValue(-1);
  // UI-thread flags read by the drawSource wrapper.
  const freezeSv = useSharedValue(false);
  const activeSv = useSharedValue(false);

  const [stage, setStage] = useState<SkottieStage>(null);
  const [run, setRun] = useState<RunState>("idle");
  const [status, setStatus] = useState("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tile, setTile] = useState<number>(initialTile ?? DEFAULT_VORTEX.tile);
  const [sticky, setSticky] = useState(true);
  const [freeze, setFreeze] = useState(false);
  const tapAt = useRef<number | null>(null);

  const list = useSkottieListSource(stage);

  // Freeze: once a run is active, stop feeding the texture new content.
  const base = list.drawSource;
  const drawSource = useMemo(() => {
    if (!base) return null;
    return (t: number) => {
      "worklet";
      if (freezeSv.value && activeSv.value) return;
      base(t);
    };
  }, [base, freezeSv, activeSv]);

  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setStage((s) => (s?.width === width && s.height === height ? s : { width, height }));
    }
  };

  const onStateChange = (s: RunState) => {
    setRun(s);
    const idle = s === "idle";
    list.scrollEnabled.value = idle;
    activeSv.value = !idle;
    if (idle) setStatus("idle");
  };

  const onStart = () => {
    if (tapAt.current === null) return;
    const ms = performance.now() - tapAt.current;
    tapAt.current = null;
    console.log(`[SkottieVortex] tap→first running frame ${ms.toFixed(0)} ms`);
  };

  const onStats = (s: VortexStats) => {
    const ms = 1000 / s.fps;
    const line = `${s.mode} ${s.fps.toFixed(0)} fps  ${ms.toFixed(2)} ms/frame  encode ${s.encodeMs.toFixed(2)}  skia ${s.sourceMs.toFixed(2)}`;
    // console.log(`[VortexCanvas] ${line}`);
    setStatus(`${line}  ·  ${s.count.toLocaleString()} tiles`);
  };

  const destroy = () => {
    if (run === "idle") {
      // Freeze scrolling at once, before the state callback lands.
      list.scrollEnabled.value = false;
      cancelAnimation(list.offset);
      tapAt.current = performance.now();
      vortex.current?.swallow().catch(() => {});
    } else if (run === "paused") {
      vortex.current?.resume();
    }
  };

  const onReset = () => {
    vortex.current?.reset();
    setStatus("idle");
  };

  const toggleFreeze = () => {
    setFreeze((f) => {
      freezeSv.value = !f;
      return !f;
    });
  };

  const active = run !== "idle";
  const canDestroy = run === "idle" || run === "paused";
  const canReset = run === "paused" || run === "done";
  const canPause = run === "running";
  const pauseResetEnabled = canPause || canReset;

  return (
    <View style={styles.container}>
      <View style={styles.stage} onLayout={onStageLayout}>
        {list.source && drawSource && list.gesture && (
          <GestureDetector gesture={list.gesture}>
            <VortexCanvas
              ref={vortex}
              style={styles.fill}
              source={list.source}
              drawSource={drawSource}
              tile={tile}
              sticky={sticky}
              speed={speed}
              progress={progress}
              paused={paused}
              seekTarget={seekTarget}
              lensTune={lensTune}
              onStateChange={onStateChange}
              onStart={onStart}
              onStats={onStats}
            />
          </GestureDetector>
        )}
      </View>
      {settingsOpen && (
        <SettingsPanel
          lensValues={lensTune}
          speed={speed}
          tileSizes={TILE_SIZES}
          tile={tile}
          sticky={sticky}
          status={status}
          width={winW}
          freezeContent={freeze}
          onToggleFreeze={toggleFreeze}
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
          <PressableScale
            style={[styles.gear, settingsOpen && styles.chipActive]}
            onPress={() => setSettingsOpen((open) => !open)}
          >
            <Text style={styles.gearLabel}>⚙</Text>
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
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  label: { color: "#fff", fontWeight: "600" },
  gear: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  gearLabel: { color: "#fff", fontSize: 20 },
});
