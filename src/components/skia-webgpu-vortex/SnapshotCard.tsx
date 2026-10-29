import {
  VortexSnapshot,
  type VortexSnapshotHandle,
} from "@/components/black-hole-gpu/VortexSnapshot";
import type { RunState } from "@/components/black-hole-gpu/useVortexRun";
import { PressableScale } from "pressto";
import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ============================================================================
// Component
// ============================================================================

/**
 * FLOW: a plain RN card sits inside `VortexSnapshot` (the default snapshot
 * path, kept as a regression check); Destroy swallows it into the black hole,
 * Reset brings it back.
 */
export function SnapshotCard() {
  const insets = useSafeAreaInsets();
  const vortex = useRef<VortexSnapshotHandle>(null);
  const [run, setRun] = useState<RunState>("idle");

  // Anything but idle means a run was requested and not reset.
  const canReset = run !== "idle" && run !== "capturing";
  const busy = run === "capturing" || run === "running";

  const onPress = () => {
    if (canReset) {
      vortex.current?.reset();
    } else {
      // Rejects on Reset / relayout; the button already follows `run`.
      vortex.current?.swallow().catch(() => {});
    }
  };

  return (
    <View style={styles.container}>
      <VortexSnapshot
        ref={vortex}
        style={styles.fill}
        contentStyle={styles.content}
        onStateChange={setRun}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Snapshot card</Text>
          <Text style={styles.body}>
            A plain React Native view captured to a texture and swallowed by the
            vortex.
          </Text>
        </View>
      </VortexSnapshot>
      <View
        style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}
        pointerEvents="box-none"
      >
        <PressableScale
          style={[styles.button, busy && styles.dim]}
          enabled={canReset || run === "idle"}
          onPress={onPress}
        >
          <Text style={styles.label}>{canReset ? "Reset" : "Destroy"}</Text>
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
  fill: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    alignSelf: "stretch",
    gap: 8,
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  body: { color: "#fff", opacity: 0.7, fontSize: 15, lineHeight: 21 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  button: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#2a2a2a",
  },
  dim: { opacity: 0.4 },
  label: { color: "#fff", fontWeight: "600" },
});
