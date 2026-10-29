import { Image } from "expo-image";
import { forwardRef } from "react";
import { StyleSheet, Text, View, type ViewProps } from "react-native";

// ============================================================================
// Types
// ============================================================================

export type DemoContentProps = Pick<ViewProps, "onLayout"> & {
  /** Fires once the image has pixels, so a snapshot can include it. */
  onImageLoad?: () => void;
};

// ============================================================================
// Component
// ============================================================================

/**
 * The view the black hole swallows: text, cards and an image, on an opaque
 * background so the snapshot has no transparent pixels.
 */
export const DemoContent = forwardRef<View, DemoContentProps>(
  ({ onLayout, onImageLoad }, ref) => (
    <View
      ref={ref}
      collapsable={false}
      onLayout={onLayout}
      style={styles.container}
    >
      <Text style={styles.title}>Event Horizon</Text>
      <Text style={styles.body}>
        Nothing escapes. Every glyph, card and pixel on this screen is about to
        be cut into tiles and pulled into the vortex, one radial wave at a
        time.
      </Text>
      <View style={styles.row}>
        <View style={[styles.card, styles.cardA]}>
          <Text style={styles.cardTitle}>Mass</Text>
          <Text style={styles.cardValue}>4.3M M☉</Text>
        </View>
        <View style={[styles.card, styles.cardB]}>
          <Text style={styles.cardTitle}>Spin</Text>
          <Text style={styles.cardValue}>0.92 a*</Text>
        </View>
      </View>
      <Image
        source={require("../../../assets/images/demo_bg.jpg")}
        style={styles.image}
        contentFit="cover"
        onLoad={onImageLoad}
      />
    </View>
  ),
);
DemoContent.displayName = "DemoContent";

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    padding: 20,
    gap: 16,
  },
  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
  },
  body: {
    color: "#ccc",
    fontSize: 17,
    lineHeight: 24,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardA: { backgroundColor: "#3b2a6b" },
  cardB: { backgroundColor: "#6b2a3b" },
  cardTitle: { color: "#fff", opacity: 0.7, fontSize: 13 },
  cardValue: { color: "#fff", fontSize: 22, fontWeight: "700" },
  image: {
    flex: 1,
    borderRadius: 12,
  },
});
