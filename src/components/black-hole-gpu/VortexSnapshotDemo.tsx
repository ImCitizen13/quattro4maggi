/**
 * VortexSnapshotDemo — test screen for `VortexSnapshot`: three cards, each
 * wrapped; tap a card to swallow it, Reset brings them back.
 *
 * FLOW:
 *   tap card N ─► handle.swallow() ─► onStart / onSwallowed / onStateChange
 *     feed the status line ─► resolve: card removed; reject: status shows why
 *   Reset ─► key bump remounts the wrappers, all cards return
 *
 * KEY FEATURES:
 * - Non-uniform colored blobs behind the cards make transparency checkable
 * - Last event per card shown in a status line
 */
import { PressableScale } from "pressto";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { VortexSnapshot, type VortexSnapshotHandle } from "./VortexSnapshot";

// ============================================================================
// Types
// ============================================================================

export type VortexSnapshotDemoCard = {
  title: string;
  body: string;
  color: string;
};

// ============================================================================
// Constants
// ============================================================================

const CARDS: readonly VortexSnapshotDemoCard[] = [
  { title: "Card 1", body: "Tap me to feed the black hole.", color: "#ff3d7f" },
  { title: "Card 2", body: "Wrapped in its own VortexSnapshot.", color: "#3dd6ff" },
  { title: "Card 3", body: "Each card swallows independently.", color: "#ffd23d" },
];

// ============================================================================
// Component
// ============================================================================

export const VortexSnapshotDemo = () => {
  const refs = useRef<(VortexSnapshotHandle | null)[]>([]);
  const [removed, setRemoved] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState<Record<number, string>>({});
  const [epoch, setEpoch] = useState(0);

  const log = (i: number, text: string) =>
    setStatus((s) => ({ ...s, [i]: `card ${i + 1}: ${text}` }));

  // swallow() call time per card, for the "start N ms" latency readout.
  const swallowAt = useRef<Record<number, number>>({});

  const swallow = (i: number) => {
    swallowAt.current[i] = performance.now();
    refs.current[i]
      ?.swallow()
      .then(() => setRemoved((r) => ({ ...r, [i]: true })))
      .catch((e: Error) => log(i, `rejected: ${e.message}`));
  };

  const onReset = () => {
    setRemoved({});
    setStatus({});
    setEpoch((e) => e + 1);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.blob, styles.blobA]} />
      <View style={[styles.blob, styles.blobB]} />
      <View style={[styles.blob, styles.blobC]} />
      <View style={styles.column}>
        {CARDS.map((card, i) =>
          removed[i] ? null : (
            <VortexSnapshot
              key={`${epoch}-${i}`}
              ref={(h) => {
                refs.current[i] = h;
              }}
              tile={4}
              onStart={() =>
                log(
                  i,
                  `start ${Math.round(performance.now() - (swallowAt.current[i] ?? 0))} ms`,
                )
              }
              onSwallowed={() => log(i, "swallowed")}
              onStateChange={(s) => log(i, s)}
            >
              <PressableScale onPress={() => swallow(i)}>
                <View style={[styles.card, { backgroundColor: card.color }]}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardBody}>{card.body}</Text>
                </View>
              </PressableScale>
            </VortexSnapshot>
          ),
        )}
      </View>
      <View style={styles.footer}>
        <PressableScale onPress={onReset} style={styles.button}>
          <Text style={styles.buttonText}>Reset</Text>
        </PressableScale>
        {CARDS.map((_, i) => (
          <Text key={i} style={styles.status}>
            {status[i] ?? `card ${i + 1}: idle`}
          </Text>
        ))}
      </View>
    </View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16, backgroundColor: "#1a1a1a" },
  column: { gap: 16 },
  card: {
    height: 120,
    borderRadius: 12,
    padding: 20,
    gap: 8,
    justifyContent: "center",
  },
  cardTitle: { color: "#1a1a1a", fontSize: 20, fontWeight: "700" },
  cardBody: { color: "#1a1a1a", fontSize: 14 },
  footer: { gap: 6 },
  button: {
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#333",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  status: { color: "#fff", fontSize: 12, opacity: 0.8 },
  blob: { position: "absolute", opacity: 0.55 },
  blobA: {
    top: 60,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#ff3d7f",
  },
  blobB: {
    top: 260,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "#3dd6ff",
  },
  blobC: {
    bottom: 80,
    left: 40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "#ffd23d",
  },
});
