import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

const WIKI_URL = "https://en.wikipedia.org/wiki/Black_hole";

export default function Wiki() {
  const [loading, setLoading] = useState(true);

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: WIKI_URL }}
        style={styles.webview}
        containerStyle={styles.webview}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
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
});
