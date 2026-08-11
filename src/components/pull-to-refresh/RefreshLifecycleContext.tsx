/**
 * RefreshLifecycleContext
 *
 * Publishes the refresh lifecycle to any descendant — a sticky header, a nested
 * banner, a footer — without prop drilling.
 *
 * WHY A CONTEXT AND NOT PROPS:
 * `ListHeaderComponent` re-mounts whenever its identity changes. Passing an
 * inline element (`ListHeaderComponent={<Header progress={progress} />}`) makes
 * a new element every render, and a re-mounting *sticky* header visibly flickers
 * because it loses its pinned position for a frame. Reading from context lets
 * the header be a module-level component with no props at all, so its reference
 * is stable forever and nothing re-mounts.
 *
 * WHY THIS COSTS NOTHING:
 * Every value here is a `SharedValue`. Their identities never change, so the
 * context value never changes, so consumers never re-render — the header
 * animates entirely on the UI thread off the same values the indicator uses.
 */

import React, { createContext, ReactNode, useContext, useMemo } from "react";
import { SharedValue } from "react-native-reanimated";
import { RefreshOutcome, RefreshPhase } from "./hooks/useCustomRefreshControl";

// ============================================================================
// Types
// ============================================================================

export type RefreshLifecycle = {
  /** Normalized pull progress, 0 to 1. Drives stages 1 and 3. */
  progress: SharedValue<number>;
  /** Current stage of the refresh. */
  phase: SharedValue<RefreshPhase>;
  /** Sawtooth 0 → 1 loop, running only during stages 2 and 3. */
  spin: SharedValue<number>;
  /** How the last refresh ended. */
  outcome: SharedValue<RefreshOutcome>;
};

export type RefreshLifecycleProviderProps = RefreshLifecycle & {
  children: ReactNode;
};

// ============================================================================
// Context
// ============================================================================

const RefreshLifecycleContext = createContext<RefreshLifecycle | null>(null);

export function RefreshLifecycleProvider({
  progress,
  phase,
  spin,
  outcome,
  children,
}: RefreshLifecycleProviderProps) {
  // Shared values are stable references, so this memo never invalidates and no
  // consumer ever re-renders because of it.
  const value = useMemo(
    () => ({ progress, phase, spin, outcome }),
    [progress, phase, spin, outcome],
  );

  return (
    <RefreshLifecycleContext.Provider value={value}>
      {children}
    </RefreshLifecycleContext.Provider>
  );
}

/**
 * Read the refresh lifecycle. Throws outside a provider rather than returning
 * `null`, so a header mounted in the wrong subtree fails loudly instead of
 * silently never animating.
 */
export function useRefreshLifecycle(): RefreshLifecycle {
  const value = useContext(RefreshLifecycleContext);

  if (!value) {
    throw new Error(
      "useRefreshLifecycle must be used inside a <RefreshLifecycleProvider>",
    );
  }

  return value;
}
