/**
 * useThreadsFeed
 *
 * The feed state shared by every screen that lists Threads posts: the row
 * order, the swallow-on-delete removal, and the simulated refresh that brings
 * deleted posts back.
 */

import { useState } from "react";

// ============================================================================
// Constants
// ============================================================================

export const ITEMS = Array.from({ length: 10 }, (_, i) => i);

/** Flip to watch the error path: a rejected refresh exits red, not white. */
export const SIMULATE_FAILURE = false;

// ============================================================================
// Hook
// ============================================================================

export function useThreadsFeed() {
  const [feedOrder, setFeedOrder] = useState(ITEMS);

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

    // Success only — a rejected refresh throws above and never reaches here.
    // Bring back posts deleted into the black hole (no-op when none were).
    setFeedOrder((order) => (order.length === ITEMS.length ? order : ITEMS));
  };

  /** A Threads post finished its swallow: drop it, the rows below spring up. */
  const removePost = (id: number) =>
    setFeedOrder((order) => order.filter((i) => i !== id));

  return { feedOrder, onRefresh, removePost };
}
