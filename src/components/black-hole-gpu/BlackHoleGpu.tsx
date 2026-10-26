/**
 * BlackHoleGpu — a React Native view swallowed by a GPU particle vortex.
 *
 * FLOW:
 *   push transition ends ─► snapshot texture + standby scene are built once
 *     (TypeGPU root: one particle per tile, storage buffer); nothing is drawn
 *   DemoContent (RN view, collapsable={false})
 *     └─ Destroy (idle) ─► 120 ms ─► drawElementImageToTexture INTO the scene's texture
 *          └─ `phase` SharedValue flips ─► the UI loop starts the run (sim reset,
 *             particles seeded at home, frame 0) ─► onStarted hides the RN view
 *          └─ per frame (ui-worklet, composeLayered): vortex layer = compute
 *               `step` (N × h=1/120) ─► 6 × N instanced tiles sampling the
 *               snapshot over space ─► lens layer (reads that as its backdrop):
 *               gravitational lensing + glass bubble ─► blit to the swapchain
 *               ─► writes `progress` (fraction of tiles swallowed)
 *          └─ timeline: hole grows in (0 s) → release wave (0.6 s)
 *     └─ Pause (running) ─► `paused` = true: sim frozen, frames still drawn
 *     └─ Destroy (paused) ─► `paused` = false: the run continues
 *     └─ scrub the progress bar ─► `seekTarget` seeks the run; release resumes it
 *          └─ onDone(true) ─► "done"; scrubbing back before the end ─► "running" again
 *     └─ Reset (paused / done) ─► phase = 0 (one transparent frame, then no present),
 *          show the RN view
 *
 * STATE: run = idle ─► capturing ─► running ⇄ paused, running/paused ─► done; Reset ─► idle
 *
 * KEY FEATURES:
 * - All GPU: no Skia, no Atlas; the only CPU readback is a small throttled
 *   death-histogram map (progress); CPU writes a ~120 B uniform per frame
 * - Scene pre-built after the push transition; Destroy = 120 ms + capture + phase flip
 * - No scene rebuild on Destroy/Pause/Reset/Sticky; only tile or layout size change rebuilds
 * - Snapshot captured on Destroy (after a short delay), nothing on mount — no navigation stall
 * - Two-button HUD (Destroy, Pause/Reset) under a full-width progress bar / scrubber;
 *   fixed height in every state (the stage size drives a GPU rebuild)
 * - Gear button in the navigation header toggles SettingsPanel (portal, floats over
 *   the HUD, never resizes the stage): Sim tab (status, Speed 0.25×–4×, tile chips
 *   8/4/2 px, Sticky chip) and Lens tab (14 live knobs, rim/halo/specular color
 *   lists with palette picks, three presets)
 * - Radial wave; per-tile flow field (sink + vortex, relaxed) ramps in from rest
 * - Sticky patches (value noise + per-tile jitter) release late, new pattern per run
 * - Snapshot and scene share one device (useDevice makes a new one per call)
 * - Render loop on the UI runtime (120 Hz)
 * - FpsOverlay ui row
 * - Dev: lens knobs + speed also in the DevTools Dials panel (lensDials.ts)
 */
import { Stack, useNavigation } from "expo-router";
import { PressableScale } from "pressto";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  LogBox,
  PixelRatio,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { Canvas, useDevice } from "react-native-webgpu";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FpsOverlay } from "@/components/common/FpsOverlay";
import { useWebGPUOnDevice } from "../gargantua-type-gpu/hooks/useWebGPU";
import { composeLayered } from "../gargantua-type-gpu/composeLayered";
import { DemoContent } from "./DemoContent";
import { createLensScene, type LensShared } from "./lensScene";
import { useLensDials } from "./lensDials";
import { useLensTune } from "./lensTune";
import { ProgressBar } from "./ProgressBar";
import { SettingsPanel } from "./SettingsPanel";
import { captureInto, createSnapshotTexture } from "./snapshot";
import {
  createVortexScene,
  DEFAULT_VORTEX,
  type VortexStats,
} from "./vortexScene";

// ============================================================================
// Types
// ============================================================================

export type ShowMode = "rn" | "gpu";

/**
 * Run lifecycle. idle ─► capturing (Destroy pressed, snapshot in flight) ─►
 * running ⇄ paused; running / paused ─► done (all tiles swallowed); Reset ─► idle.
 */
export type RunState = "idle" | "capturing" | "running" | "paused" | "done";

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

// Pause between the Release press and the capture: drawElementImageToTexture
// blocks the platform UI thread ~0.4 s, so let the press animation settle first.
const RELEASE_DELAY_MS = 120;

// Build the scene anyway if the push transition's `transitionEnd` never fires.
const TRANSITION_FALLBACK_MS = 1000;

// UI-thread loop only for now (user decision 2026-10-23). The hook still
// supports "js-raf" (gargantua uses it); restore a toggle here if needed.
const RENDER_MODE = "ui-worklet" as const;

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
  const { device } = useDevice();
  // The stack's `transitionEnd` event isn't in the generic navigation typing.
  const navigation = useNavigation() as unknown as TransitionNavigation;
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const speed = useSharedValue(1);
  // Read by the UI-runtime loop: phase 0 = idle, a new non-zero value = start a run.
  const phase = useSharedValue(0);
  // Written every frame by the render worklet: fraction of tiles swallowed.
  const progress = useSharedValue(0);
  // True freezes the sim (frames still drawn).
  const paused = useSharedValue(false);
  // -1 = none; 0..1 = the scene seeks the run to that progress while held.
  const seekTarget = useSharedValue(-1);
  const seedSv = useSharedValue(0);
  const stickySv = useSharedValue(DEFAULT_VORTEX.sticky);
  const lensTune = useLensTune();
  useLensDials(lensTune, speed);
  const runId = useRef(0);
  const viewRef = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const busy = useRef(false);
  const imageLoaded = useRef(false);
  // Bumped by reset, layout change and unmount: an in-flight Release bails.
  const epoch = useRef(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [transitioned, setTransitioned] = useState(false);
  const [run, setRun] = useState<RunState>("idle");
  const [show, setShow] = useState<ShowMode>("rn");
  const [tile, setTile] = useState<number>(DEFAULT_VORTEX.tile);
  const [sticky, setSticky] = useState(true);
  const [status, setStatus] = useState("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  useEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );

  const dpr = PixelRatio.get();
  const pxW = size ? Math.round(size.width * dpr) : 0;
  const pxH = size ? Math.round(size.height * dpr) : 0;

  // The scene's snapshot texture, owned here and refilled by every Release.
  const snapTex = useMemo(
    () =>
      device && transitioned && pxW > 0 && pxH > 0
        ? createSnapshotTexture(device, pxW, pxH)
        : null,
    [device, transitioned, pxW, pxH],
  );

  const onStarted = () => {
    setShow("gpu");
    busy.current = false;
  };

  // "All tiles swallowed" flipped. Functional setState: the scene memo captures
  // this callback once, so it must not read `run` from a stale closure.
  const onDone = (done: boolean) =>
    setRun((r) => {
      if (done) return r === "running" || r === "paused" ? "done" : r;
      return r === "done" ? "running" : r;
    });

  // Two layers: the vortex (tiles over space) then the lens, which reads it as
  // its backdrop. `shared` is the vortex-to-lens handoff, fresh per scene.
  const scene = useMemo(() => {
    if (!snapTex) return null;
    const shared: LensShared = {};
    return composeLayered([
      {
        scene: createVortexScene({
          snapshot: snapTex,
          config: { ...DEFAULT_VORTEX, tile },
          speed,
          phase,
          progress,
          paused,
          seekTarget,
          seed: seedSv,
          sticky: stickySv,
          shared,
          onStarted,
          onDone,
          onStats: (s: VortexStats) => setStatus(formatStats(s)),
        }),
      },
      { scene: createLensScene(shared, lensTune), readsBackdrop: true },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapTex, tile]);
  const canvasRef = useWebGPUOnDevice(device, scene, [scene], size, {
    mode: RENDER_MODE,
  });

  // Declared after the hook's effect: on a texture change React runs the hook's
  // cleanup first (it cancels the UI loop and tears the scene down), so the
  // texture is destroyed only once nothing samples it.
  useEffect(() => () => snapTex?.destroy(), [snapTex]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const changed = width !== layout.current.width || height !== layout.current.height;
    layout.current = { width, height };
    if (changed) {
      // Texture and scene rebuild from the new size; stop any run / capture on
      // the old one.
      reset();
      setSize({ width, height });
    }
  };

  const onImageLoad = () => {
    imageLoaded.current = true;
  };

  // Begin a run on the current texture: busy until the loop reports onStarted.
  const startPhase = (stickyOn: boolean) => {
    busy.current = true;
    seedSv.value = Math.floor(Math.random() * 1e6);
    stickySv.value = stickyOn ? DEFAULT_VORTEX.sticky : 0;
    paused.value = false;
    seekTarget.value = -1;
    runId.current += 1;
    phase.value = runId.current;
  };

  // Destroy from idle: fresh capture of the RN view into the scene's texture,
  // then the run starts. (Once a run exists the RN view is hidden, so a
  // recapture would be blank: Destroy is disabled until Reset.)
  const release = async () => {
    if (!device || !scene || !snapTex || !imageLoaded.current || busy.current) {
      return;
    }
    busy.current = true;
    setRun("capturing");
    const myEpoch = epoch.current;
    await new Promise((r) => setTimeout(r, RELEASE_DELAY_MS));
    // Reset, relayout or unmount during the delay (reset already cleared busy).
    if (epoch.current !== myEpoch) return;
    try {
      await captureInto(device, viewRef, snapTex);
    } catch {
      if (epoch.current === myEpoch) {
        busy.current = false;
        setRun("idle");
      }
      return;
    }
    if (epoch.current !== myEpoch) return;
    startPhase(sticky);
    setRun("running");
  };

  // Destroy: capture and start from idle, continue from paused.
  const destroy = () => {
    if (run === "idle") {
      release();
    } else if (run === "paused") {
      paused.value = false;
      setRun("running");
    }
  };

  const pause = () => {
    if (run !== "running") return;
    paused.value = true;
    setRun("paused");
  };

  const reset = () => {
    epoch.current += 1;
    busy.current = false;
    phase.value = 0;
    paused.value = false;
    seekTarget.value = -1;
    progress.value = 0;
    setRun("idle");
    setShow("rn");
    setStatus("idle");
  };

  // The scrub already cleared `paused` on the UI thread; follow it in state.
  const onScrubEnd = () => setRun((r) => (r === "paused" ? "running" : r));

  // The tile change rebuilds the scene (setTile → useMemo dep). While a run is
  // active `phase` still holds its non-zero id and the new scene starts with
  // lastPhase = -1, so its first frame starts a run on the same texture by
  // itself; busy just covers that frame until onStarted clears it.
  const pickTile = (size: number) => {
    if (size === tile) return;
    if (active) {
      busy.current = true;
      paused.value = false;
      seekTarget.value = -1;
      setRun("running");
    }
    setTile(size);
  };

  const toggleSticky = () => {
    const next = !sticky;
    setSticky(next);
    if (active && !busy.current) {
      startPhase(next);
      setRun("running");
    }
  };

  const canDestroy = run === "idle" || run === "paused";
  const canReset = run === "paused" || run === "done";
  const canPause = run === "running";
  const pauseResetEnabled = canPause || canReset;

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <View style={[styles.fill, show === "gpu" && styles.hidden]}>
          <DemoContent ref={viewRef} onLayout={onLayout} onImageLoad={onImageLoad} />
        </View>
        <Canvas
          ref={canvasRef}
          style={[
            styles.overlay,
            show === "rn" && (scene ? styles.starting : styles.hidden),
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
          onPickTile={pickTile}
          onToggleSticky={toggleSticky}
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
          onScrubEnd={onScrubEnd}
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
            onPress={canReset ? reset : pause}
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
