/**
 * PullToRefresh
 *
 * A custom pull-to-refresh built on a pan gesture rather than scroll
 * overscroll, so it behaves identically on iOS and Android. Android's
 * ScrollView never reports negative content offsets, which is why an
 * offset-driven pull cannot work cross-platform.
 *
 * FLOW:
 * 1. Pan down while the list is at the top → `progress` rises 0 → 1
 * 2. Release past the threshold → the pull is held open and a refresh starts
 * 3. Refresh completes → the hold springs back to 0
 *
 * KEY FEATURES:
 * - Single source of truth for progress and stage, both owned by the hook
 * - Two layout models: iOS-style inset vs Android-style floating overlay
 * - Gesture and scroll tracking both driven on the UI thread
 */

import { PressableScale } from "pressto";
import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import {
  CustomChildRefreshIndicator,
  RefreshIndicatorLayout,
} from "./CustomChildRefreshControlIndicator";
import useCustomRefreshControl, {
  RefreshOutcome,
  RefreshPhase,
} from "./hooks/useCustomRefreshControl";
import {
  RefreshLifecycleProvider,
  useRefreshLifecycle,
} from "./RefreshLifecycleContext";
import { StickyStatusHeader } from "./StickyHeader";
import ThreadItemView from "./threads-example/ThreadItemView";
import { postForIndex, reshuffle } from "./threads-example/posts";
import ThreadsView from "./threads-example/ThreadsView";
import { NEON_COLORS } from "./constants";
import NeonView from "./neon-example/NeonView";
import NeonItemView from "./neon-example/NeonItemView";

// ============================================================================
// Constants
// ============================================================================

export const ITEMS = Array.from({ length: 10 }, (_, i) => i);

/**
 * Row spacing lives here, not in a `gap` on the content container. The inset
 * indicator mounts as `ListHeaderComponent` — an extra child of the content
 * container — so `gap` would insert 10pt between it and the first row even
 * while the indicator itself is 0pt tall. A separator only renders *between*
 * rows, never after the header.
 */
export function ItemSeparator() {
  return <View style={styles.separator} />;
}

/** Full-bleed hairline between Threads post cards, like the real app's feed. */
export function ThreadDivider() {
  return <View style={styles.threadDivider} />;
}

/** How far the arc winds up over the course of the pull, in degrees. */
const PULL_SWEEP = 270;

const NEUTRAL_COLOR = "#fff";
const SUCCESS_COLOR = "#4ade80";
const ERROR_COLOR = "#f87171";

/** Flip to watch the error path: a rejected refresh exits red, not white. */
export const SIMULATE_FAILURE = false;

// ============================================================================
// Types
// ============================================================================

export type PullToRefreshProps = {
  // Add props here
};

type RefreshSpinnerProps = {
  progress: SharedValue<number>;
  phase: SharedValue<RefreshPhase>;
  spin: SharedValue<number>;
  outcome: SharedValue<RefreshOutcome>;
};

export type IndicatorType = "ios" | "android";

/**
 * What occupies the sticky header slot: nothing, the status bar, or the
 * Threads glyph. Any sticky mode forces the indicator out to `overlay`.
 */
export type StickyMode = "off" | "bar" | "threads" | "neon";

const STICKY_MODES: StickyMode[] = ["off", "bar", "threads", "neon"];

type DemoConfig = {
  indicatorType: IndicatorType;
  /** The layout actually in effect — sticky header forces `overlay`. */
  effectiveLayout: RefreshIndicatorLayout;
};

// ============================================================================
// Demo config context
// ============================================================================

/**
 * The toggle buttons live in `PullToRefresh`, but `RefreshIndicator` must stay
 * a prop-less module-level component so its identity never changes as a
 * `ListHeaderComponent` (see `RefreshLifecycleContext` for why). Context is how
 * the config reaches it without props.
 */
export const DemoConfigContext = createContext<DemoConfig | null>(null);

function useDemoConfig(): DemoConfig {
  const value = useContext(DemoConfigContext);
  if (!value) {
    throw new Error("useDemoConfig must be used inside PullToRefresh");
  }
  return value;
}

// ============================================================================
// Spinner
// ============================================================================

/**
 * A three-quarter ring that reads differently in each of the three stages:
 *
 * - stage 1 (`pulling`): winds up by `PULL_SWEEP`, scaling in from nothing
 * - stage 2 (`refreshing`): full size, rotating continuously off `spin`
 * - stage 3 (`settling`): keeps rotating while it scales back out, tinted by
 *   `outcome` so a failed refresh does not exit looking like a successful one
 *
 * One animated style covers all three, because the drivers are orthogonal:
 * `progress` owns presence (scale, opacity), `phase` decides which value feeds
 * the rotation, and `outcome` only touches colour.
 */
function RefreshSpinner({
  progress,
  phase,
  spin,
  outcome,
}: RefreshSpinnerProps) {
  const spinnerStyle = useAnimatedStyle(() => {
    // Stage 1 winds the arc up by hand; stages 2 and 3 hand it to the loop.
    // Settling stays on `spin` so the ring never freezes mid-exit.
    const rotation =
      phase.value === "pulling" || phase.value === "idle"
        ? progress.value * PULL_SWEEP
        : spin.value * 360;

    // Only stage 3 carries a result; stages 1 and 2 are always neutral.
    const tint =
      outcome.value === "error"
        ? ERROR_COLOR
        : outcome.value === "success"
          ? SUCCESS_COLOR
          : NEUTRAL_COLOR;

    return {
      opacity: progress.value,
      borderColor: tint,
      transform: [
        { scale: interpolate(progress.value, [0, 1], [0.4, 1]) },
        { rotate: `${rotation}deg` },
      ],
    };
  });

  return <Animated.View style={[styles.spinner, spinnerStyle]} />;
}

// ============================================================================
// Indicator
// ============================================================================

/**
 * The indicator, reading the lifecycle from context so it needs no props. That
 * matters for the `inset` mount: `ListHeaderComponent` re-mounts whenever its
 * identity changes, and a module-level component reference never changes.
 */
export function RefreshIndicator({
  layoutType,
}: {
  layoutType: RefreshIndicatorLayout;
}) {
  const { progress, phase, spin, outcome } = useRefreshLifecycle();
  const { indicatorType, effectiveLayout } = useDemoConfig();

  return (
    <CustomChildRefreshIndicator
      progress={progress}
      indicatorType={indicatorType}
      layout={effectiveLayout}
      revealMode="translateY"
    >
      <View
        style={{
          backgroundColor: layoutType == "overlay" ? "black" : "transparent",
          padding: 16,
          borderRadius: 999,
        }}
      >
        <RefreshSpinner
          progress={progress}
          phase={phase}
          spin={spin}
          outcome={outcome}
        />
      </View>
    </CustomChildRefreshIndicator>
  );
}

// ============================================================================
// Controls
// ============================================================================

type ConfigButtonProps = {
  label: string;
  value: string;
  onPress: () => void;
  /** Dimmed when the setting is currently overridden by another one. */
  disabled?: boolean;
};

/** One toggle: shows the setting's name and its current value, tap to cycle. */
export function ConfigButton({
  label,
  value,
  onPress,
  disabled,
}: ConfigButtonProps) {
  return (
    <PressableScale
      style={[styles.configButton, disabled && styles.configButtonDisabled]}
      onPress={onPress}
    >
      <Text style={styles.configButtonLabel}>{label}</Text>
      <Text style={styles.configButtonValue}>{value}</Text>
    </PressableScale>
  );
}

// ============================================================================
// Component
// ============================================================================

export function PullToRefresh({}: PullToRefreshProps) {
  /** Flip these to compare the two platform behaviours on a single device. */
  const [indicatorType, setIndicatorType] = useState<IndicatorType>("ios");
  const [indicatorLayout, setIndicatorLayout] =
    useState<RefreshIndicatorLayout>("inset");

  /** Pin a status header to the top of the list, driven by the same lifecycle. */
  const [stickyMode, setStickyMode] = useState<StickyMode>("off");
  const useStickyHeader = stickyMode !== "off";

  /**
   * The feed's row order. A successful refresh reshuffles it, so the list
   * reveals a reordered feed as the indicator settles — the illusion that new
   * content just arrived. Rows keep stable keys, so FlatList reorders the
   * existing cells rather than remounting them.
   */
  const [feedOrder, setFeedOrder] = useState(ITEMS);

  /**
   * The header slot holds the sticky status bar *or* the inset indicator, never
   * both — so a sticky header forces the indicator out to the overlay mount.
   * Making the `inset` indicator sticky is not an option: its height is the
   * animation, and an animating sticky header moves the list's sticky offset
   * every frame.
   */
  const effectiveLayout: RefreshIndicatorLayout = useStickyHeader
    ? "overlay"
    : indicatorLayout;

  const demoConfig = useMemo(
    () => ({ indicatorType, effectiveLayout }),
    [indicatorType, effectiveLayout],
  );

  // Stands in for a real fetch. The real version forwards `signal`:
  //   await fetch(url, { signal }).then((r) => r.json())
  // so a timed-out request is actually torn down instead of left running.
  const onRefresh = async (signal: AbortSignal) => {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          SIMULATE_FAILURE
            ? reject(new Error("Network request failed"))
            : resolve(null),
        2000,
      );
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      });
    });

    // Success only — a rejected refresh throws above and never reaches here, so
    // a failed pull leaves the existing order untouched. Reshuffling now (while
    // the indicator is still held open) means the settle reveals the new feed.
    // setFeedOrder(reshuffle);
  };

  const { progress, phase, spin, outcome, gesture, onScrollHandler } =
    useCustomRefreshControl({ onRefresh });

  const getListHeader = () => {
    if (stickyMode === "bar") {
      return StickyStatusHeader;
    } else if (stickyMode === "threads") {
      return ThreadsView;
    } else if (stickyMode === "neon") {
      return NeonView;
    }
    if (effectiveLayout === "inset") {
      return RefreshIndicator;
    }
    return null;
  };

  return (
    <RefreshLifecycleProvider
      progress={progress}
      phase={phase}
      spin={spin}
      outcome={outcome}
    >
      <DemoConfigContext.Provider value={demoConfig}>
        <View
          style={[
            styles.container,
            { backgroundColor: stickyMode === "neon" ? "black" : "#1a1a1a" },
          ]}
        >
          {/* Overlay mounts outside the scroll view so it stays pinned to the
              viewport instead of scrolling away with the content. */}
          {!useStickyHeader && effectiveLayout === "overlay" && (
            <RefreshIndicator layoutType="overlay" />
          )}

          <GestureDetector gesture={gesture}>
            <Animated.FlatList
              data={feedOrder}
              keyExtractor={(item) => `${item}`}
              // In Threads mode each row is a real post card; otherwise the
              // demo's placeholder box, so the pull mechanics stay the focus.
              renderItem={({ item, index }) => {
                const borderColor = NEON_COLORS[index % NEON_COLORS.length];
                if (stickyMode === "threads") {
                  return <ThreadItemView post={postForIndex(item)} />;
                } else if (stickyMode === "neon") {
                  return <NeonItemView index={index} />;
                } else
                  return (
                    <View
                      style={[styles.itemStyle, { borderColor: borderColor }]}
                    />
                  );
              }}
              // Threads cards carry their own internal padding and thread line,
              // so they only need a hairline divider between rows.
              ItemSeparatorComponent={
                stickyMode === "threads" ? ThreadDivider : ItemSeparator
              }
              // With `ListHeaderComponent` present it is child 0 of the underlying
              // ScrollView, so index 0 is the one sticky index that survives
              // virtualization. Row indices do not — VirtualizedList inserts
              // spacer views as you scroll, which shifts them out from under you.
              ListHeaderComponent={getListHeader()}
              stickyHeaderIndices={useStickyHeader ? [0] : undefined}
              // Android defaults this to true, and its subview clipping wrongly
              // culls a stuck `stickyHeaderIndices` header — the header mounts
              // but never paints. iOS defaults it off, which is why the bug is
              // Android-only. The list is 10 rows; clipping buys nothing here.
              removeClippedSubviews={false}
              style={[styles.scroll]}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.scrollStyle,
                {
                  backgroundColor:
                    stickyMode === "neon" ? "black" : "transparent",
                },
              ]}
              onScroll={onScrollHandler}
              scrollEventThrottle={16}
            />
          </GestureDetector>

          <View style={styles.controls}>
            <ConfigButton
              label="Type"
              value={indicatorType}
              onPress={() =>
                setIndicatorType((t) => (t === "ios" ? "android" : "ios"))
              }
            />
            <ConfigButton
              label="Layout"
              value={effectiveLayout}
              // Sticky header owns the header slot, so the layout is forced to
              // `overlay` while it's on — the button reflects that and no-ops.
              disabled={useStickyHeader}
              onPress={() => {
                if (useStickyHeader) return;
                setIndicatorLayout((l) =>
                  l === "inset" ? "overlay" : "inset",
                );
              }}
            />
            <ConfigButton
              label="Sticky"
              value={stickyMode}
              onPress={() =>
                setStickyMode(
                  (m) =>
                    STICKY_MODES[
                      (STICKY_MODES.indexOf(m) + 1) % STICKY_MODES.length
                    ],
                )
              }
            />
          </View>
        </View>
      </DemoConfigContext.Provider>
    </RefreshLifecycleProvider>
  );
}

// ============================================================================
// Styles
// ============================================================================

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Load-bearing: the overlay indicator's `width: "100%"` resolves against
    // this box, and `alignItems: "center"` would otherwise shrink-wrap it.
    width: "100%",
    height: "100%",
    // backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: {
    flex: 1,
    width: "100%",
  },
  scrollStyle: {
    // Load-bearing: without an explicit width the content container shrinks to
    // its widest *determinate* child, and every percentage-sized child (rows,
    // the bar header, the inset indicator) collapses with it.
    width: "100%",
    justifyContent: "flex-start",
    backgroundColor: "#1a1a1a",
    // No `alignItems: "center"` here. FlatList wraps every row in a cell view,
    // and centering makes those cells width-auto — which leaves the rows' own
    // `width: "80%"` resolving against an undefined parent, i.e. zero. Rows
    // stretch instead, and each row centres itself via `alignSelf`.
    // No `gap` either — the header counts as a child, see `ItemSeparator`.
  },
  separator: {
    height: 10,
  },
  threadDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    backgroundColor: "#2a2a2a",
  },
  itemStyle: {
    width: "90%",
    // borderRadius: 16,
    backgroundColor: "black",
    borderWidth: 2,

    height: 100,
    alignSelf: "center",
    // backgroundColor: "purple",
  },

  controls: {
    flexDirection: "row",
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  configButton: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    paddingVertical: 10,
    gap: 2,
  },
  configButtonDisabled: {
    opacity: 0.4,
  },
  configButtonLabel: {
    color: "#888",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  configButtonValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#fff",
    // The transparent quarter is what makes the rotation legible — a full ring
    // would look static no matter how fast it spun.
    borderTopColor: "transparent",
  },
});
