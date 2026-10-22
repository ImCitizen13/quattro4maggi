/**
 * BlackHoleGpu — a React Native view swallowed by a GPU particle vortex.
 *
 * FLOW:
 *   DemoContent (RN view, collapsable={false})
 *     └─ layout + image loaded ─► queue.drawElementImageToTexture ─► snapshot
 *     └─ Release ─► createVortexScene: one particle per tile (storage buffer)
 *          └─ per frame (JS rAF): compute `step` (N × h=1/120) ─► render
 *               bg + hole, then 6 × N instanced tiles sampling the snapshot
 *          └─ timeline: shatter (0 s) → hole grows in (0.6 s) → vortex (1.4 s)
 *     └─ Reset ─► stop loop, show the RN view again (snapshot kept)
 *
 * KEY FEATURES:
 * - All GPU: no Skia, no Atlas, no CPU readback; CPU writes a 96 B uniform
 * - Pre-captured snapshot: Release starts instantly
 * - Radial wave; per-tile forces (gravity + swirl, drag) ramp in from rest
 * - Tile chips (8/4/2 px) set the particle count
 */
import { PressableScale } from "pressto";
import { useEffect, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PixelRatio,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Canvas, useCanvasRef, useDevice } from "react-native-webgpu";
import { DemoContent } from "./DemoContent";
import { captureView, type ViewSnapshot } from "./snapshot";
import { createVortexScene, DEFAULT_VORTEX, type VortexScene } from "./vortexScene";

// ============================================================================
// Types
// ============================================================================

export type ShowMode = "rn" | "gpu";

// ============================================================================
// Constants
// ============================================================================

const TILE_SIZES = [8, 4, 2] as const;
const STATS_EVERY = 30;

// ============================================================================
// Component
// ============================================================================

export const BlackHoleGpu = () => {
  const { device } = useDevice();
  const canvasRef = useCanvasRef();
  const viewRef = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const snapshot = useRef<ViewSnapshot | null>(null);
  const scene = useRef<VortexScene | null>(null);
  const raf = useRef<number | null>(null);
  const busy = useRef(false);
  const imageLoaded = useRef(false);
  const capturing = useRef<Promise<ViewSnapshot | null> | null>(null);
  const [show, setShow] = useState<ShowMode>("rn");
  const [tile, setTile] = useState<number>(DEFAULT_VORTEX.tile);
  const [status, setStatus] = useState("idle");

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
    if (changed) dropSnapshot();
    precapture();
  };

  const onImageLoad = () => {
    imageLoaded.current = true;
    precapture();
  };

  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    scene.current?.destroy();
    scene.current = null;
  };

  const dropSnapshot = () => {
    snapshot.current?.texture.destroy();
    snapshot.current = null;
  };

  // Unmount only: stop the loop and free GPU resources.
  const teardown = useRef(() => {});
  teardown.current = () => {
    stop();
    dropSnapshot();
  };
  useEffect(() => () => teardown.current(), []);

  const release = async (tileSize: number) => {
    const context = canvasRef.current?.getContext("webgpu");
    const { width, height } = layout.current;
    if (!device || !context || width === 0 || height === 0 || busy.current) return;
    busy.current = true;
    stop();

    const { pxW, pxH } = pixelSize();
    const format = navigator.gpu.getPreferredCanvasFormat();
    const canvas = context.canvas as unknown as { width: number; height: number };
    canvas.width = pxW;
    canvas.height = pxH;
    context.configure({ device, format, alphaMode: "premultiplied" });

    // Normally pre-captured; fall back to an in-flight or fresh capture.
    const snap =
      snapshot.current ??
      (await capturing.current) ??
      (await captureView(device, viewRef, pxW, pxH));
    snapshot.current = snap;
    const s = createVortexScene(device, context, format, snap.texture, {
      ...DEFAULT_VORTEX,
      tile: tileSize,
    });
    scene.current = s;

    // First frame (dt = 0) shows every tile at home, then hide the RN view.
    s.frame(0);
    context.present();
    setShow("gpu");
    busy.current = false;

    let last = 0;
    let frames = 0;
    let encodeMs = 0;
    let statsStart = 0;
    const loop = (ts: number) => {
      if (scene.current !== s) return;
      const dt = last === 0 ? 0 : (ts - last) / 1000;
      last = ts;
      encodeMs += s.frame(dt);
      context.present();
      frames += 1;
      if (statsStart === 0) statsStart = ts;
      if (frames === STATS_EVERY) {
        const fps = (frames * 1000) / (ts - statsStart);
        setStatus(
          `${s.count.toLocaleString()} tiles · ${fps.toFixed(0)} fps · ` +
            `encode ${(encodeMs / frames).toFixed(2)} ms`,
        );
        frames = 0;
        encodeMs = 0;
        statsStart = ts;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  const reset = () => {
    stop();
    setShow("rn");
    setStatus("idle");
  };

  const pickTile = (size: number) => {
    setTile(size);
    if (scene.current) release(size);
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
