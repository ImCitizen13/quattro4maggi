import { StyleSheet, View } from "react-native";

/** Full-bleed hairline between Threads post cards, like the real app's feed. */
export function ThreadDivider() {
  return <View style={styles.threadDivider} />;
}

const styles = StyleSheet.create({
  threadDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    backgroundColor: "#2a2a2a",
  },
});
