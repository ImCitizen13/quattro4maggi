/**
 * CustomChildRefreshIndicator
 *
 * Presentation layer for a custom pull-to-refresh indicator. Consumes a
 * normalized 0-1 progress value and knows nothing about gestures or scroll
 * offsets, so the driving mechanism can change without touching this file.
 *
 * FLOW:
 * 1. Parent pulls -> `progress` rises from 0 to 1
 * 2. `layout` decides whether the list is pushed down or floated over
 * 3. `revealMode` decides how the child appears in the space that opens
 *
 * KEY FEATURES:
 * - Two layout models matching the two native platform behaviours
 * - Two reveal animations, both returning the same style shape
 * - Renders arbitrary children, so the indicator visual is caller-supplied
 */

import React, { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

// ============================================================================
// Constants
// ============================================================================

/** Height/diameter of the indicator, and the height of the gap it opens. */
const INDICATOR_SIZE = 66;

// ============================================================================
// Types
// ============================================================================

/**
 * How the child reveals itself as the pull progresses.
 *
 * - `opacity`: fades in as the space opens.
 * - `translateY`: slides down from above, clipped by the container.
 */
export type RefreshIndicatorRevealMode = "opacity" | "translateY";

/**
 * Where the indicator sits relative to the list.
 *
 * - `inset`: in flow inside the scroll view; its height pushes content down,
 *   mirroring iOS content-inset behaviour. Mount as the scroll view's first
 *   child.
 * - `overlay`: absolutely positioned above a list that never moves, mirroring
 *   Android's SwipeRefreshLayout. Mount as a sibling of the scroll view —
 *   mounting it inside would make it scroll away with the content.
 */
export type RefreshIndicatorLayout = "inset" | "overlay";

export type CustomChildRefreshIndicatorProps = {
  /** Normalized pull progress, 0 to 1. */
  progress: SharedValue<number>;
  children: ReactNode;
  backgroundColor?: string;
  /** Visual shape: full-width bar (`ios`) or circle (`android`). */
  indicatorType: "android" | "ios";
  /** Layout model. Defaults to `"inset"`. */
  layout?: RefreshIndicatorLayout;
  /** How the child appears. Defaults to `"opacity"`. */
  revealMode?: RefreshIndicatorRevealMode;
};

// ============================================================================
// Component
// ============================================================================

export const CustomChildRefreshIndicator = ({
  progress,
  children,
  backgroundColor = "transparent",
  indicatorType,
  layout = "inset",
  revealMode = "opacity",
}: CustomChildRefreshIndicatorProps) => {
  const isAndroid = indicatorType === "android";
  const isOverlay = layout === "overlay";

  const containerStyle = useAnimatedStyle(() => {
    // Overlay floats above the list, so the box stays a fixed size and the
    // child does all the moving. Inset makes the container itself the spacer,
    // so growing its height is what pushes list content down.
    return isOverlay
      ? { height: INDICATOR_SIZE }
      : { height: progress.value * INDICATOR_SIZE };
  }, [isOverlay]);

  const contentStyle = useAnimatedStyle(() => {
    // Both branches return the same style shape so Reanimated never has to
    // reconcile a changing set of properties when the mode is toggled.
    if (revealMode === "translateY") {
      return {
        opacity: 1,
        transform: [
          {
            translateY: interpolate(
              progress.value,
              [0, 1],
              [-INDICATOR_SIZE, 0],
            ),
          },
        ],
      };
    }

    return {
      opacity: progress.value,
      transform: [{ translateY: 0 }],
    };
  }, [revealMode]);

  return (
    <Animated.View
      // The overlay sits above the top 66pt of the list. Without this it would
      // swallow taps on the first row even when the indicator is invisible.
      pointerEvents={isOverlay ? "none" : "auto"}
      style={[styles.container, isOverlay && styles.overlay, containerStyle]}
    >
      <Animated.View
        style={[
          styles.content,
          isAndroid ? styles.androidIndicator : styles.iosIndicator,
          { backgroundColor },
          contentStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
};

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden", // clips the child during the translateY reveal
    alignItems: "center",
    justifyContent: "flex-end",
  },
  overlay: {
    position: "absolute",
    top: 0,
    zIndex: 10,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  iosIndicator: {
    width: "100%",
    height: INDICATOR_SIZE,
  },
  androidIndicator: {
    width: INDICATOR_SIZE,
    height: INDICATOR_SIZE,
    borderRadius: 120,
    shadowColor: "#ffffff",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
