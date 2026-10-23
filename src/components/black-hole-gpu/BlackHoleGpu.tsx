/**
 * BlackHoleGpu — a React Native view swallowed by a GPU particle vortex.
 *
 * FLOW:
 *   DemoContent (RN view, collapsable={false})
 *     └─ layout + image loaded ─► queue.drawElementImageToTexture ─► snapshot
 *     └─ Release ─► `run` state ─► useWebGPUOnDevice builds createVortexScene
 *          (TypeGPU root: one particle per tile, storage buffer)
 *          └─ setup presents frame 0 (tiles at home) ─► onReady hides the RN view
 *          └─ per frame (js-raf): compute `step` (N × h=1/120) ─► render
 *               bg + hole, then 6 × N instanced tiles sampling the snapshot
 *          └─ timeline: shatter (0 s) → hole grows in (0.6 s) → vortex (1.4 s)
 *     └─ Reset ─► run = null (hook tears the scene down), show the RN view
 *
 * KEY FEATURES:
 * - All GPU: no Skia, no Atlas, no CPU readback; CPU writes a 96 B uniform
 * - Pre-captured snapshot: Release starts instantly
 * - Radial wave; per-tile flow field (sink + vortex, relaxed) ramps in from rest
 * - Tile chips (8/4/2 px) set the particle count
 * - Snapshot and scene share one device (useDevice makes a new one per call)
 */
import { PressableScale } from "pressto";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PixelRatio,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Canvas, useDevice } from "react-native-webgpu";
import { useWebGPUOnDevice } from "../gargantua-type-gpu/hooks/useWebGPU";
import { DemoContent } from "./DemoContent";
import { captureView, type ViewSnapshot } from "./snapshot";
import { createVortexScene, DEFAULT_VORTEX } from "./vortexScene";

// ============================================================================
// Types
// ============================================================================

export type ShowMode = "rn" | "gpu";

/** One Release: a new id rebuilds the scene. */
export type VortexRun = { id: number; tile: number; snapshot: ViewSnapshot };

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZES = [8, 4, 2] as const;

// ============================================================================
// Component
// ============================================================================

export const BlackHoleGpu = () => {
  const { device } = useDevice();
  const viewRef = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const snapshot = useRef<ViewSnapshot | null>(null);
  const busy = useRef(false);
  const imageLoaded = useRef(false);
  const capturing = useRef<Promise<ViewSnapshot | null> | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [run, setRun] = useState<VortexRun | null>(null);
  const [show, setShow] = useState<ShowMode>("rn");
  const [tile, setTile] = useState<number>(DEFAULT_VORTEX.tile);
  const [status, setStatus] = useState("idle");

  const scene = useMemo(
    () =>
      run &&
      createVortexScene({
        snapshot: run.snapshot.texture,
        config: { ...DEFAULT_VORTEX, tile: run.tile },
        onReady: () => {
          setShow("gpu");
          busy.current = false;
        },
        onStats: setStatus,
      }),
    [run],
  );
  const canvasRef = useWebGPUOnDevice(device, scene, [scene], size);

  const pixelSize = () => {
    const dpr = PixelRatio.get();
    return {
      pxW: Math.round(layout.current.width * dpr),
      pxH: Math.round(layout.current.height * dpr),
    };
  };

  // Snapshot ahead of Release (it takes ~0.4 s on the platform UI thread), once
  // layout, device and the image are all ready. Kept across Reset; retaken
  // only when the layout size changes.
  const precapture = () => {
    const { pxW, pxH } = pixelSize();
    if (!device || pxW === 0 || !imageLoaded.current) return;
    if (snapshot.current || capturing.current) return;
    capturing.current = captureView(device, viewRef, pxW, pxH)
      .then((snap) => {
        snapshot.current = snap;
        return snap;
      })
      .catch(() => null)
      .finally(() => {
        capturing.current = null;
      });
  };

  useEffect(precapture, [device]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const changed = width !== layout.current.width || height !== layout.current.height;
    layout.current = { width, height };
    if (changed) {
      dropSnapshot();
      setSize({ width, height });
    }
    precapture();
  };

  const onImageLoad = () => {
    imageLoaded.current = true;
    precapture();
  };

  const dropSnapshot = () => {
    snapshot.current?.texture.destroy();
    snapshot.current = null;
  };

  // Unmount only: free the snapshot (the hook frees the scene).
  const teardown = useRef(() => {});
  teardown.current = dropSnapshot;
  useEffect(() => () => teardown.current(), []);

  const release = async (tileSize: number) => {
    const { width, height } = layout.current;
    if (!device || width === 0 || height === 0 || busy.current) return;
    busy.current = true;
    const { pxW, pxH } = pixelSize();
    // Normally pre-captured; fall back to an in-flight or fresh capture.
    const snap =
      snapshot.current ??
      (await capturing.current) ??
      (await captureView(device, viewRef, pxW, pxH));
    snapshot.current = snap;
    setRun((prev) => ({ id: (prev?.id ?? 0) + 1, tile: tileSize, snapshot: snap }));
  };

  const reset = () => {
    setRun(null);
    setShow("rn");
    setStatus("idle");
  };

  const pickTile = (size: number) => {
    setTile(size);
    if (run) release(size);
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
      </View>
      <View style={styles.hud}>
        <Text style={styles.status}>{status}</Text>
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
        </View>
        <View style={styles.row}>
          <PressableScale style={styles.button} onPress={() => release(tile)}>
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
  status: { color: "#fff", opacity: 0.7, fontSize: 12, fontVariant: ["tabular-nums"] },
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
