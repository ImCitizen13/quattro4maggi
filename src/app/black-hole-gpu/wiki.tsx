import {
  VortexSnapshot,
  type VortexSnapshotHandle,
} from "@/components/black-hole-gpu/VortexSnapshot";
import type { RunState } from "@/components/black-hole-gpu/useVortexRun";
import { PressableScale } from "pressto";
import React, { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

// ============================================================================
// Constants
// ============================================================================

const WIKI_URL = "https://en.wikipedia.org/wiki/Black_hole";

// ============================================================================
// Component
// ============================================================================

/**
 * The article inside a `VortexSnapshot`; a floating button swallows it into
 * the black hole (Destroy) and brings it back (Reset).
 */
export default function Wiki() {
  const insets = useSafeAreaInsets();
  const vortex = useRef<VortexSnapshotHandle>(null);
  const [loading, setLoading] = useState(true);
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
        contentStyle={styles.fill}
        ready={!loading}
        onStateChange={setRun}
      >
        <WebView
          source={{ uri: WIKI_URL }}
          style={styles.webview}
          containerStyle={styles.webview}
          onLoadEnd={() => setLoading(false)}
        />
      </VortexSnapshot>
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
      <View
        style={[styles.footer, { paddingBottom: 16 + insets.bottom }]}
        pointerEvents="box-none"
      >
        <PressableScale
          style={[styles.button, (loading || busy) && styles.dim]}
          enabled={!loading && (canReset || run === "idle")}
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
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  fill: { flex: 1 },
  webview: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a1a",
  },
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
