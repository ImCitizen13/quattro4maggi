/**
 * BlackHoleGpu — a React Native view swallowed by a GPU particle vortex.
 *
 * FLOW:
 *   DemoContent (RN view, collapsable={false})
 *     └─ Release ─► 120 ms ─► drawElementImageToTexture ─► snapshot ─► run
 *          └─ `run` state ─► useWebGPUOnDevice builds createVortexScene
 *          (TypeGPU root: one particle per tile, storage buffer)
 *          └─ setup presents frame 0 (tiles at home) ─► onReady hides the RN view
 *          └─ per frame (ui-worklet): compute `step` (N × h=1/120) ─► render
 *               bg + hole, then 6 × N instanced tiles sampling the snapshot
 *          └─ timeline: hole grows in (0 s) → release wave (0.6 s)
 *     └─ Reset ─► run = null (hook tears the scene down), show the RN view
 *
 * KEY FEATURES:
 * - All GPU: no Skia, no Atlas, no CPU readback; CPU writes a 96 B uniform
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
import { DemoContent } from "./DemoContent";
import { captureView, type ViewSnapshot } from "./snapshot";
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

/** One Release: a new id rebuilds the scene. */
export type VortexRun = {
  id: number;
  tile: number;
  /** Sticky patches on. */
  sticky: boolean;
  snapshot: ViewSnapshot;
  /** Stickiness seed, new each run. */
  seed: number;
};

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZES = [8, 4, 2] as const;

// Pause between the Release press and the capture: drawElementImageToTexture
// blocks the platform UI thread ~0.4 s, so let the press animation settle first.
const RELEASE_DELAY_MS = 120;

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
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const speed = useSharedValue(1);
  const viewRef = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const busy = useRef(false);
  const imageLoaded = useRef(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [run, setRun] = useState<VortexRun | null>(null);
  const [show, setShow] = useState<ShowMode>("rn");
  const [tile, setTile] = useState<number>(DEFAULT_VORTEX.tile);
  const [sticky, setSticky] = useState(true);
  const [status, setStatus] = useState("idle");

  const scene = useMemo(
    () =>
      run &&
      createVortexScene({
        snapshot: run.snapshot.texture,
        config: {
          ...DEFAULT_VORTEX,
          tile: run.tile,
          sticky: run.sticky ? DEFAULT_VORTEX.sticky : 0,
        },
        seed: run.seed,
        speed,
        onReady: () => {
          setShow("gpu");
          busy.current = false;
        },
        onStats: (s: VortexStats) => setStatus(formatStats(s)),
      }),
    [run],
  );
  const canvasRef = useWebGPUOnDevice(device, scene, [scene], size, {
    mode: RENDER_MODE,
  });

  const pixelSize = () => {
    const dpr = PixelRatio.get();
    return {
      pxW: Math.round(layout.current.width * dpr),
      pxH: Math.round(layout.current.height * dpr),
    };
  };

  // Snapshot ownership. `live` is the running scene's texture; reset or a run
  // on a new snapshot moves it to `retired`. React runs every passive cleanup
  // (the hook's included, which cancels the loop) before any setup, so the
  // scene is gone when this effect destroys the retired textures.
  const live = useRef<GPUTexture | null>(null);
  const retired = useRef<GPUTexture[]>([]);
  // Bumped by reset and unmount: an in-flight capture checks it and bails.
  const epoch = useRef(0);
  useEffect(() => {
    retired.current.forEach((t) => t.destroy());
    retired.current = [];
  }, [run]);
  useEffect(
    () => () => {
      epoch.current += 1;
      live.current?.destroy();
      retired.current.forEach((t) => t.destroy());
    },
    [],
  );

  const retire = () => {
    if (live.current) retired.current.push(live.current);
    live.current = null;
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const changed = width !== layout.current.width || height !== layout.current.height;
    layout.current = { width, height };
    if (changed) {
      // reset retires the texture; the effect above destroys it.
      if (run) reset();
      setSize({ width, height });
    }
  };

  const onImageLoad = () => {
    imageLoaded.current = true;
  };

  const startRun = (snapshot: ViewSnapshot, tileSize: number, stickyOn: boolean) => {
    if (live.current !== snapshot.texture) {
      retire();
      live.current = snapshot.texture;
    }
    setRun((prev) => ({
      id: (prev?.id ?? 0) + 1,
      tile: tileSize,
      sticky: stickyOn,
      snapshot,
      seed: Math.floor(Math.random() * 1e6),
    }));
  };

  // Rebuild the running scene with new options, reusing its snapshot (the RN
  // view is hidden while a scene runs, so a recapture would be blank).
  const restart = (opts: { tile: number; sticky: boolean }) => {
    if (!run || busy.current) return;
    busy.current = true;
    startRun(run.snapshot, opts.tile, opts.sticky);
  };

  // Fresh capture on every press. busy is cleared by onReady, or here on failure.
  const release = async () => {
    const { width, height } = layout.current;
    if (!device || width === 0 || height === 0 || !imageLoaded.current || busy.current) {
      return;
    }
    if (run) {
      restart({ tile, sticky });
      return;
    }
    busy.current = true;
    const myEpoch = epoch.current;
    await new Promise((r) => setTimeout(r, RELEASE_DELAY_MS));
    // Reset or unmount during the delay (reset already cleared busy).
    if (epoch.current !== myEpoch) return;
    const { pxW, pxH } = pixelSize();
    let snap: ViewSnapshot;
    try {
      snap = await captureView(device, viewRef, pxW, pxH);
    } catch {
      busy.current = false;
      return;
    }
    // Reset/unmount during the capture, or the layout changed (wrong size).
    const now = pixelSize();
    if (epoch.current !== myEpoch || now.pxW !== pxW || now.pxH !== pxH) {
      snap.texture.destroy();
      if (epoch.current === myEpoch) busy.current = false;
      return;
    }
    startRun(snap, tile, sticky);
  };

  const reset = () => {
    epoch.current += 1;
    retire();
    busy.current = false;
    setRun(null);
    setShow("rn");
    setStatus("idle");
  };

  const pickTile = (size: number) => {
    setTile(size);
    if (run) restart({ tile: size, sticky });
  };

  const toggleSticky = () => {
    const next = !sticky;
    setSticky(next);
    if (run) restart({ tile, sticky: next });
  };

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <View style={[styles.fill, show === "gpu" && styles.hidden]}>
          <DemoContent ref={viewRef} onLayout={onLayout} onImageLoad={onImageLoad} />
        </View>
        <Canvas
          ref={canvasRef}
          style={[styles.overlay, show === "rn" && styles.hidden]}
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
