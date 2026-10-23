/**
 * BlackHoleGpu — a React Native view swallowed by a GPU particle vortex.
 *
 * FLOW:
 *   push transition ends ─► snapshot texture + standby scene are built once
 *     (TypeGPU root: one particle per tile, storage buffer); nothing is drawn
 *   DemoContent (RN view, collapsable={false})
 *     └─ Release ─► 120 ms ─► drawElementImageToTexture INTO the scene's texture
 *          └─ `phase` SharedValue flips ─► the UI loop starts the run (sim reset,
 *             particles seeded at home, frame 0) ─► onStarted hides the RN view
 *          └─ per frame (ui-worklet, composeLayered): vortex layer = compute
 *               `step` (N × h=1/120) ─► 6 × N instanced tiles sampling the
 *               snapshot over space ─► lens layer (reads that as its backdrop):
 *               gravitational lensing + glow + black disc ─► blit to the swapchain
 *          └─ timeline: hole grows in (0 s) → release wave (0.6 s)
 *     └─ Reset ─► phase = 0 (one transparent frame, then no present), show the RN view
 *
 * KEY FEATURES:
 * - All GPU: no Skia, no Atlas, no CPU readback; CPU writes a 96 B uniform
 * - Scene pre-built after the push transition; Release = 120 ms + capture + phase flip
 * - No scene rebuild on Release/Reset/Sticky; only tile or layout size change rebuilds
 * - Snapshot captured on Release (after a short delay), nothing on mount — no navigation stall
 * - Sticky toggle (chip)
 * - Radial wave; per-tile flow field (sink + vortex, relaxed) ramps in from rest
 * - Sticky patches (value noise + per-tile jitter) release late, new pattern per run
 * - Tile chips (8/4/2 px) set the particle count
 * - Snapshot and scene share one device (useDevice makes a new one per call)
 * - Render loop on the UI runtime (120 Hz)
 * - FpsOverlay ui row
 * - Speed slider 0.25×–4× (SharedValue, live, no rebuild)
 */
import { useNavigation } from "expo-router";
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
import { TuningSlider } from "@/components/liquid-metal/TuningSlider";
import { composeLayered } from "../gargantua-type-gpu/composeLayered";
import { DemoContent } from "./DemoContent";
import { createLensScene, type LensShared } from "./lensScene";
import { captureInto, createSnapshotTexture } from "./snapshot";
import {
  createVortexScene,
  DEFAULT_VORTEX,
  SPEED_MAX,
  SPEED_MIN,
  type VortexStats,
} from "./vortexScene";

// ============================================================================
// Types
// ============================================================================

export type ShowMode = "rn" | "gpu";

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
  const seedSv = useSharedValue(0);
  const stickySv = useSharedValue(DEFAULT_VORTEX.sticky);
  const runId = useRef(0);
  const viewRef = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const busy = useRef(false);
  const imageLoaded = useRef(false);
  // Bumped by reset, layout change and unmount: an in-flight Release bails.
  const epoch = useRef(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [transitioned, setTransitioned] = useState(false);
  // A run was requested and not reset.
  const [active, setActive] = useState(false);
  const [show, setShow] = useState<ShowMode>("rn");
  const [tile, setTile] = useState<number>(DEFAULT_VORTEX.tile);
  const [sticky, setSticky] = useState(true);
  const [status, setStatus] = useState("idle");

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
          seed: seedSv,
          sticky: stickySv,
          shared,
          onStarted,
          onStats: (s: VortexStats) => setStatus(formatStats(s)),
        }),
      },
      { scene: createLensScene(shared), readsBackdrop: true },
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
    runId.current += 1;
    phase.value = runId.current;
  };

  // Fresh capture on the first press; while a run is active the RN view is
  // hidden (a recapture would be blank), so it restarts on the same texture.
  const release = async () => {
    if (!device || !scene || !snapTex || !imageLoaded.current || busy.current) {
      return;
    }
    if (active) {
      startPhase(sticky);
      return;
    }
    busy.current = true;
    const myEpoch = epoch.current;
    await new Promise((r) => setTimeout(r, RELEASE_DELAY_MS));
    // Reset, relayout or unmount during the delay (reset already cleared busy).
    if (epoch.current !== myEpoch) return;
    try {
      await captureInto(device, viewRef, snapTex);
    } catch {
      if (epoch.current === myEpoch) busy.current = false;
      return;
    }
    if (epoch.current !== myEpoch) return;
    setActive(true);
    startPhase(sticky);
  };

  const reset = () => {
    epoch.current += 1;
    busy.current = false;
    phase.value = 0;
    setActive(false);
    setShow("rn");
    setStatus("idle");
  };

  // The tile change rebuilds the scene (setTile → useMemo dep). While a run is
  // active `phase` still holds its non-zero id and the new scene starts with
  // lastPhase = -1, so its first frame starts a run on the same texture by
  // itself; busy just covers that frame until onStarted clears it.
  const pickTile = (size: number) => {
    if (size === tile) return;
    if (active) busy.current = true;
    setTile(size);
  };

  const toggleSticky = () => {
    const next = !sticky;
    setSticky(next);
    if (active && !busy.current) startPhase(next);
  };

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
      <View style={[styles.hud, { paddingBottom: 16 + insets.bottom }]}>
        <Text style={styles.status}>{status}</Text>
        <TuningSlider
          label="Speed ×"
          value={speed}
          min={SPEED_MIN}
          max={SPEED_MAX}
          decimals={2}
          width={winW - 32}
        />
        <View style={styles.row}>
          {TILE_SIZES.map((size) => (
            <PressableScale
              key={size}
              style={[styles.chip, tile === size && styles.chipActive]}
              onPress={() => pickTile(size)}
            >
              <Text style={styles.label}>{size} px</Text>
            </PressableScale>
          ))}
          <PressableScale
            style={[styles.chip, sticky && styles.chipActive]}
            onPress={toggleSticky}
          >
            <Text style={styles.label}>Sticky</Text>
          </PressableScale>
        </View>
        <View style={styles.row}>
          <PressableScale style={styles.button} onPress={release}>
            <Text style={styles.label}>Release</Text>
          </PressableScale>
          <PressableScale style={styles.button} onPress={reset}>
            <Text style={styles.label}>Reset</Text>
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
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  label: { color: "#fff", fontWeight: "600" },
});
