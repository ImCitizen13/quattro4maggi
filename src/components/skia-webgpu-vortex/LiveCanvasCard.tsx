import {
  VortexCanvas,
  type VortexCanvasHandle,
} from "@/components/black-hole-gpu/VortexCanvas";
import {
  createSkiaTexture,
  getSkiaDevice,
} from "@/components/black-hole-gpu/dev/skiaSharedTexture";
import type { RunState } from "@/components/black-hole-gpu/useVortexRun";
import type { VortexStats } from "@/components/black-hole-gpu/vortexScene";
import type { TextureSource } from "@/components/black-hole-gpu/vortexSource";
import { PressableScale } from "pressto";
import React, { useRef, useState } from "react";
import { type LayoutChangeEvent, PixelRatio, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skia } from "react-native-skia";

// ============================================================================
// Types
// ============================================================================

/** The live source: the shared texture plus the worklet that animates it. */
type Live = {
  source: TextureSource;
  drawSource: (t: number) => void;
};

// ============================================================================
// Constants
// ============================================================================

/** Orbiting dot colors. */
const DOT_COLORS = ["#ff3b6b", "#ffd23b", "#3bffb0"] as const;
/** Gradient end colors. */
const GRADIENT_COLORS = ["#2b1055", "#7597de", "#f06292"] as const;

/** Wait before destroying the texture: the canvas tears down its scene first. */
const DESTROY_DELAY_MS = 200;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build the Skia side of a live source on the JS thread: the shared texture,
 * a surface over it and every Skia object the worklet draws with. The worklet
 * captures only these (bundle mode re-evaluates module imports on the UI
 * runtime, so it must not reach for `Skia` itself).
 */
const createLive = (width: number, height: number): Live & { texture: GPUTexture } => {
  const texture = createSkiaTexture(width, height);
  const surface = Skia.Surface.MakeFromGPUTexture(texture);
  const canvas = surface.getCanvas();
  const gradient = Skia.Paint();
  gradient.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: 0, y: 0 },
      { x: width, y: height },
      GRADIENT_COLORS.map((c) => Skia.Color(c)),
      null,
      0,
    ),
  );
  const dots = DOT_COLORS.map((c) => {
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(c));
    return paint;
  });
  const radius = Math.min(width, height) * 0.12;

  // Moving gradient (the whole canvas rotates under it) and three orbiting
  // dots: obviously animated, ~free for Skia.
  const drawSource = (t: number) => {
    "worklet";
    const s = t / 1000;
    canvas.save();
    canvas.rotate(s * 25, width / 2, height / 2);
    canvas.drawPaint(gradient);
    canvas.restore();
    for (let i = 0; i < dots.length; i++) {
      const a = s * (1 + i * 0.6) + i * 2.1;
      canvas.drawCircle(
        width / 2 + Math.cos(a) * width * 0.3,
        height / 2 + Math.sin(a * 1.3) * height * 0.28,
        radius,
        dots[i],
      );
    }
    surface.flush();
  };

  return {
    texture,
    drawSource,
    source: { kind: "texture", texture, device: getSkiaDevice(), live: true },
  };
};

// ============================================================================
// Component
// ============================================================================

/**
 * FLOW: measure the stage ─► Skia texture on the shared device (physical px) ─►
 * `VortexCanvas` shows it in standby, `drawSource` animating it every frame in
 * the same UI-worklet frame. Destroy swallows the live canvas (no view swap, no
 * snapshot); Reset returns to standby. Per-window frame stats are logged and
 * shown (standby vs running) for on-device frame-time measurement.
 */
export function LiveCanvasCard() {
  const insets = useSafeAreaInsets();
  const canvas = useRef<VortexCanvasHandle>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [run, setRun] = useState<RunState>("idle");
  const [stats, setStats] = useState("");
  const current = useRef<{ texture: GPUTexture; size: string } | null>(null);

  // Stage size is known only after layout; (re)build the texture then. A new
  // size replaces the old texture, which the caller (this card) destroys.
  const onStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const dpr = PixelRatio.get();
    const px = Math.round(width * dpr);
    const py = Math.round(height * dpr);
    const key = `${px}x${py}`;
    if (px === 0 || py === 0 || current.current?.size === key) return;
    const old = current.current?.texture;
    const next = createLive(px, py);
    current.current = { texture: next.texture, size: key };
    setLive({ source: next.source, drawSource: next.drawSource });
    if (old) setTimeout(() => old.destroy(), DESTROY_DELAY_MS);
  };

  const onStats = (s: VortexStats) => {
    const ms = 1000 / s.fps;
    const line = `${s.mode} ${s.fps.toFixed(0)} fps  ${ms.toFixed(2)} ms/frame  encode ${s.encodeMs.toFixed(2)}  skia ${s.sourceMs.toFixed(2)}`;
    // console.log(`[VortexCanvas] ${line}`);
    setStats(line);
  };

  // Free the texture when the card unmounts (the canvas tears down first).
  const holder = useRef(current);
  React.useEffect(
    () => () => {
      const tex = holder.current.current?.texture;
      if (tex) setTimeout(() => tex.destroy(), DESTROY_DELAY_MS);
    },
    [],
  );

  const canDestroy = run === "idle";
  const canReset = run !== "idle";

  return (
    <View style={styles.container}>
      <View style={styles.stage} onLayout={onStageLayout}>
        {live && (
          <VortexCanvas
            ref={canvas}
            style={styles.fill}
            source={live.source}
            drawSource={live.drawSource}
            onStateChange={setRun}
            onStats={onStats}
          />
        )}
      </View>
      <Text style={styles.stats}>
        {run} {stats}
      </Text>
      <View style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}>
        <PressableScale
          style={[styles.button, !canDestroy && styles.dim]}
          enabled={canDestroy}
          onPress={() => canvas.current?.swallow().catch(() => {})}
        >
          <Text style={styles.label}>Destroy</Text>
        </PressableScale>
        <PressableScale
          style={[styles.button, !canReset && styles.dim]}
          enabled={canReset}
          onPress={() => canvas.current?.reset()}
        >
          <Text style={styles.label}>Reset</Text>
        </PressableScale>
      </View>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
  stage: { flex: 1 },
  fill: { flex: 1 },
  stats: {
    color: "#fff",
    opacity: 0.7,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  dim: { opacity: 0.4 },
  label: { color: "#fff", fontWeight: "600" },
});
