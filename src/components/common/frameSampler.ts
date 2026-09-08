/**
 * frameSampler
 *
 * Thread-agnostic frame-cadence accumulator. Whoever owns a frame loop calls
 * `tick()` once per frame; the sampler rolls the intervals up and pushes a
 * stats object to subscribers every `intervalMs`.
 *
 * WHY
 *   `FpsOverlay`'s built-in `useFrameCallback` measures the *display link on
 *   the UI thread*. That is not the same clock as a JS-thread `requestAnimation
 *   Frame` render loop (e.g. `useWebGPU`): if the JS thread stalls, the render
 *   drops frames while the UI-thread readout stays happily at 120. A sampler
 *   lets the loop that actually presents frames report its own cadence.
 *
 * FLOW
 *   loop → sampler.tick(workMs?) → accumulate → every intervalMs → notify()
 *                                                                    ↓
 *                              FpsOverlay ← useSyncExternalStore ← getSnapshot()
 *
 * KEY FEATURES
 *   - Plain JS numbers, no SharedValues — nothing marshals across threads, so
 *     `tick()` is a handful of adds and safe to call from a hot render loop.
 *   - `useSyncExternalStore`-shaped (`subscribe` / `getSnapshot`), so the
 *     overlay re-renders ~2×/sec, not per frame, and needs no `useEffect`.
 *   - Optional `workMs` per tick: how long the loop's own work took, reported
 *     separately from the frame interval. Interval answers "did we hit the
 *     budget"; work answers "how much of the budget was us".
 *
 * DROPPED-FRAME THRESHOLD
 *   A frame counts as dropped at `budget × DROP_TOLERANCE`, not at the exact
 *   budget. Real vsync deltas jitter around the budget, so a bare `dt > 8.333`
 *   flags roughly half of a *perfectly smooth* 120Hz stream. A genuinely
 *   missed vsync lands at ~2× budget, so 1.5× separates the two cleanly.
 */

import { useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type FrameStats = {
  /** Row label shown in the overlay. */
  label: string;
  /** Effective fps = 1000 / mean frame interval over the window. */
  fps: number;
  /** % of frames that missed the 120Hz budget (see DROP_TOLERANCE). */
  j120: number;
  /** % of frames that missed the 60Hz budget. */
  j60: number;
  /** Worst single frame interval in the window, ms. */
  max: number;
  /** Mean in-loop work per frame, ms. `null` when the loop doesn't report it. */
  work: number | null;
};

export type FrameSampler = {
  label: string;
  /**
   * Call once per frame. `workMs` is optional — the duration of the loop's own
   * work for this frame (e.g. `renderScene()` + `present()`).
   */
  tick(workMs?: number): void;
  /** Drop accumulated state. Use after a stall you don't want in the numbers. */
  reset(): void;
  /** `useSyncExternalStore` subscribe. */
  subscribe(onStoreChange: () => void): () => void;
  /** `useSyncExternalStore` snapshot — stable identity between emissions. */
  getSnapshot(): FrameStats;
};

// ============================================================================
// Sampler
// ============================================================================

const B120 = 1000 / 120; // 8.33ms
const B60 = 1000 / 60; // 16.67ms

/** Multiplier applied to a refresh budget before a frame counts as dropped. */
const DROP_TOLERANCE = 1.5;

/**
 * Intervals longer than this are treated as a gap (backgrounded app, JS bundle
 * load, scene setup) rather than a dropped frame, and dropped from the window.
 * Without this, one resume poisons `max` and skews `fps` for a whole window.
 */
const GAP_MS = 500;

export function createFrameSampler(
  label: string,
  intervalMs = 500,
): FrameSampler {
  let frames = 0;
  let elapsed = 0;
  let over120 = 0;
  let over60 = 0;
  let maxMs = 0;
  let workSum = 0;
  let workFrames = 0;
  let sinceReport = 0;
  let lastTickMs = 0;

  const listeners = new Set<() => void>();
  let snapshot: FrameStats = {
    label,
    fps: 0,
    j120: 0,
    j60: 0,
    max: 0,
    work: null,
  };

  const resetWindow = () => {
    frames = 0;
    elapsed = 0;
    over120 = 0;
    over60 = 0;
    maxMs = 0;
    workSum = 0;
    workFrames = 0;
    sinceReport = 0;
  };

  return {
    label,

    tick(workMs) {
      const now = performance.now();
      const prev = lastTickMs;
      lastTickMs = now;

      // First tick after mount or after a gap only seeds the clock.
      if (prev === 0) return;

      const dt = now - prev;
      if (dt <= 0) return;
      if (dt > GAP_MS) {
        resetWindow();
        return;
      }

      frames += 1;
      elapsed += dt;
      sinceReport += dt;
      if (dt > B120 * DROP_TOLERANCE) over120 += 1;
      if (dt > B60 * DROP_TOLERANCE) over60 += 1;
      if (dt > maxMs) maxMs = dt;
      if (workMs !== undefined) {
        workSum += workMs;
        workFrames += 1;
      }

      if (sinceReport < intervalMs || frames === 0) return;

      snapshot = {
        label,
        fps: Math.round(1000 / (elapsed / frames)),
        j120: Math.round((over120 / frames) * 1000) / 10,
        j60: Math.round((over60 / frames) * 1000) / 10,
        max: Math.round(maxMs * 10) / 10,
        work:
          workFrames > 0 ? Math.round((workSum / workFrames) * 100) / 100 : null,
      };
      resetWindow();
      for (const l of listeners) l();
    },

    reset() {
      resetWindow();
      lastTickMs = 0;
    },

    subscribe(onStoreChange) {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },

    getSnapshot() {
      return snapshot;
    },
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Stable `FrameSampler` for the lifetime of the component. Hand the same
 * instance to the loop that ticks it and to `<FpsOverlay sources={[...]} />`.
 */
export function useFrameSampler(label: string, intervalMs = 500): FrameSampler {
  return useMemo(
    () => createFrameSampler(label, intervalMs),
    [label, intervalMs],
  );
}
