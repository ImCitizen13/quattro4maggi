/**
 * BlackHoleGpu — snapshot a React Native view into WebGPU (spike 11a).
 *
 * FLOW:
 *   DemoContent (RN view, collapsable={false})
 *     └─ Capture ─► queue.drawElementImageToTexture ─► rgba8unorm texture
 *                     └─ drawSnapshot: full-screen pass, textureLoad 1:1
 *                          └─ Canvas laid exactly over DemoContent
 *
 * KEY FEATURES:
 * - No Skia: the snapshot and the draw both live on the WebGPU device
 * - "Show" toggles RN view vs GPU copy, for a screenshot diff (≈0 = pixel-exact)
 *
 * Next (11c/11d): the texture becomes the tile source for compute particles.
 */
import { PressableScale } from "pressto";
import { useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  PixelRatio,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Canvas, useCanvasRef, useDevice } from "react-native-webgpu";
import { drawSnapshot } from "./blit";
import { DemoContent } from "./DemoContent";
import { captureView, type ViewSnapshot } from "./snapshot";

// ============================================================================
// Types
// ============================================================================

export type ShowMode = "rn" | "gpu";

// ============================================================================
// Component
// ============================================================================

export const BlackHoleGpu = () => {
  const { device } = useDevice();
  const canvasRef = useCanvasRef();
  const viewRef = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const snapshot = useRef<ViewSnapshot | null>(null);
  const [show, setShow] = useState<ShowMode>("rn");
  const [status, setStatus] = useState("idle");

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layout.current = { width, height };
  };

  const capture = async () => {
    const context = canvasRef.current?.getContext("webgpu");
    const { width, height } = layout.current;
    if (!device || !context || width === 0 || height === 0) return;

    const dpr = PixelRatio.get();
    const pxW = Math.round(width * dpr);
    const pxH = Math.round(height * dpr);
    const format = navigator.gpu.getPreferredCanvasFormat();
    const canvas = context.canvas as unknown as { width: number; height: number };
    canvas.width = pxW;
    canvas.height = pxH;
    context.configure({ device, format, alphaMode: "premultiplied" });

    const t0 = performance.now();
    const next = await captureView(device, viewRef, pxW, pxH);
    const ms = performance.now() - t0;
    snapshot.current?.texture.destroy();
    snapshot.current = next;

    drawSnapshot(device, context, format, next.texture);
    context.present();
    setStatus(`${pxW}×${pxH} @${dpr}x · ${format} · ${ms.toFixed(1)} ms`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.stage}>
        <View style={[styles.fill, show === "gpu" && styles.hidden]}>
          <DemoContent ref={viewRef} onLayout={onLayout} />
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
          <PressableScale style={styles.button} onPress={capture}>
            <Text style={styles.label}>Capture</Text>
          </PressableScale>
          <PressableScale
            style={styles.button}
            onPress={() => setShow((s) => (s === "rn" ? "gpu" : "rn"))}
          >
            <Text style={styles.label}>Show: {show.toUpperCase()}</Text>
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
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  label: { color: "#fff", fontWeight: "600" },
});
