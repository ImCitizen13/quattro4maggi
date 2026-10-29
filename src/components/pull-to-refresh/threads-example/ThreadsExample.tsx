/**
 * ThreadsExample
 *
 * The Threads feed on its own: custom pull-to-refresh driving the Threads
 * glyph header, with each post wrapped so deleting it swallows the card into
 * the black hole.
 *
 * FLOW:
 * 1. Pull down at the top → the glyph header winds up, release refreshes
 * 2. Tap a post's trash → the card is swallowed, rows below spring up
 * 3. Refresh restores any swallowed posts
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { LinearTransition } from "react-native-reanimated";

import useCustomRefreshControl from "../hooks/useCustomRefreshControl";
import { RefreshLifecycleProvider } from "../RefreshLifecycleContext";
import { postForIndex } from "./posts";
import SwallowableThreadItem from "./SwallowableThreadItem";
import { ThreadDivider } from "./ThreadDivider";
import ThreadsView from "./ThreadsView";
import { useThreadsFeed } from "./useThreadsFeed";

// ============================================================================
// Component
// ============================================================================

export function ThreadsExample() {
  const { feedOrder, onRefresh, removePost } = useThreadsFeed();
  const { progress, phase, spin, outcome, gesture, onScrollHandler } =
    useCustomRefreshControl({ onRefresh });

  return (
    <RefreshLifecycleProvider
      progress={progress}
      phase={phase}
      spin={spin}
      outcome={outcome}
    >
      <View style={styles.container}>
        <GestureDetector gesture={gesture}>
          <Animated.FlatList
            data={feedOrder}
            keyExtractor={(item) => `${item}`}
            itemLayoutAnimation={LinearTransition.springify()}
            renderItem={({ item }) => (
              <SwallowableThreadItem
                id={item}
                post={postForIndex(item)}
                onRemoved={removePost}
              />
            )}
            ItemSeparatorComponent={ThreadDivider}
            // Index 0 is the one sticky index that survives virtualization.
            ListHeaderComponent={ThreadsView}
            stickyHeaderIndices={[0]}
            removeClippedSubviews={false}
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            onScroll={onScrollHandler}
            scrollEventThrottle={16}
          />
        </GestureDetector>
      </View>
    </RefreshLifecycleProvider>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#1a1a1a",
  },
  scroll: {
    flex: 1,
    width: "100%",
  },
  content: {
    width: "100%",
    justifyContent: "flex-start",
  },
});
