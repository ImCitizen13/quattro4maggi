/**
 * SkiaRedVortexTest - proves Skia and the vortex share one GPU device.
 *
 * FLOW: create a texture on `importDevice(Skia.getNativeDevice())` ─► Skia
 *   clears it red (MakeFromGPUTexture, zero-copy) ─► VortexSnapshot
 *   `source={{ kind: "texture" }}` ─► Swallow: red tiles fall into the hole.
 *   Red tiles = same device. Blank / GPU validation error = different devices.
 *
 * Mount it as a whole screen (plain View, not ThemeView).
 */
import { useEffect, useRef, useState } from "react";
import { PixelRatio, Pressable, StyleSheet, Text, View } from "react-native";
import { VortexSnapshot, type VortexSnapshotHandle } from "../VortexSnapshot";
import type { VortexSource } from "../vortexSource";
import { createSkiaTexture, fillSolid, getSkiaDevice } from "./skiaSharedTexture";

// ============================================================================
// Types
// ============================================================================

export type SkiaRedVortexTestProps = {
  /** Stage edge in points. Default STAGE. */
  size?: number;
};

// ============================================================================
// Constants
// ============================================================================

const STAGE = 300;

// ============================================================================
// Component
// ============================================================================

export const SkiaRedVortexTest = ({ size = STAGE }: SkiaRedVortexTestProps) => {
  const ref = useRef<VortexSnapshotHandle>(null);
  const [source, setSource] = useState<VortexSource | null>(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const px = Math.round(size * PixelRatio.get());
    const texture = createSkiaTexture(px, px);
    fillSolid(texture, "red");
    setSource({ kind: "texture", texture, device: getSkiaDevice(), live: false });
    return () => {
      setSource(null);
      // The caller owns the texture. Parent cleanups can run before the
      // vortex tears down, so destroy a beat later.
      setTimeout(() => texture.destroy(), 200);
    };
  }, [size]);

  return (
    <View style={styles.root}>
      <VortexSnapshot
        ref={ref}
        source={source ?? undefined}
        enabled={source !== null}
        prewarm
        touchOrigin={false}
        onStateChange={setStatus}
        contentStyle={{ width: size, height: size }}
      >
        <View style={[styles.stage, { width: size, height: size }]} />
      </VortexSnapshot>
      <Text style={styles.text}>{status}</Text>
      <Pressable onPress={() => ref.current?.swallow().catch(() => {})} style={styles.button}>
        <Text style={styles.text}>Swallow</Text>
      </Pressable>
      <Pressable onPress={() => ref.current?.reset()} style={styles.button}>
        <Text style={styles.text}>Reset</Text>
      </Pressable>
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: "#1a1a1a" },
  stage: { backgroundColor: "#444" },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: "#333" },
  text: { color: "#fff" },
});
