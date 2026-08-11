/**
 * useCustomRefreshControl
 *
 * Owns the pull-to-refresh state machine and every value an indicator needs to
 * animate. Renders nothing and knows nothing about the indicator's visuals.
 *
 * THREE STAGES:
 * 1. `"pulling"`   — finger down, `progress` tracks the drag 0 → 1
 * 2. `"refreshing"` — pull parked at the threshold, `spin` loops indefinitely
 * 3. `"settling"`  — refresh done, `progress` falls 1 → 0, then `"idle"`
 *
 * A pull released *below* the threshold is a cancel, not a settle: it returns
 * straight to `"idle"`. Stage 3 exists so an indicator can play a distinct exit
 * (a checkmark, a fade, a collapse) that a cancelled pull must not trigger.
 */

import {
  SPRING_REFRESH_HOLD,
  SPRING_REFRESH_SETTLE,
} from "@/lib/animations/constants";
import { useState } from "react";
import { ComposedGesture, Gesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  SharedValue,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// ============================================================================
// Constants
// ============================================================================

/** Drag distance that triggers a refresh and reads as 100% progress. */
const PULL_DISTANCE = 80;

/**
 * Hard ceiling on stage 2. A request against a dead socket can hang well past
 * any server-side timeout, and without this the control would sit in
 * `"refreshing"` indefinitely with the gesture gated off — the list becomes
 * permanently unrefreshable and the only recovery is remounting the screen.
 * Treated as an error outcome, not a silent success.
 */
const REFRESH_TIMEOUT = 15000;

/** One full cycle of the stage-2 loop. */
const SPIN_DURATION = 1000;

/**
 * Floor on how long stage 2 is visible. Without it a fast `onRefresh` (a warm
 * cache, an instant resolve) would flash the loop for two frames, which reads
 * as a glitch rather than as work being done.
 */
const MIN_REFRESH_DURATION = 900;

const SPIN_TIMING = {
  duration: SPIN_DURATION,
  easing: Easing.linear,
  reduceMotion: ReduceMotion.System,
};

// ============================================================================
// Types
// ============================================================================

/**
 * Which stage the control is in. Readable from worklets, so an indicator can
 * branch on it inside `useAnimatedStyle` without a JS round trip.
 *
 * - `idle`: at rest, or springing back from a cancelled pull
 * - `pulling`: stage 1, finger down and dragging
 * - `refreshing`: stage 2, held open while the work runs
 * - `settling`: stage 3, the post-refresh close-up
 */
export type RefreshPhase = "idle" | "pulling" | "refreshing" | "settling";

/**
 * How the last refresh ended. Set *before* stage 3 begins, so the settle
 * animation can branch on it — a failed refresh should not exit looking like a
 * successful one. Reset to `"none"` when the next pull starts.
 */
export type RefreshOutcome = "none" | "success" | "error";

export type UseCustomRefreshControlResult = {
  /** Normalized pull progress: 0 at rest, 1 fully pulled or refreshing. */
  progress: SharedValue<number>;
  /** Current stage. See {@link RefreshPhase}. */
  phase: SharedValue<RefreshPhase>;
  /**
   * Stage-2 driver: a sawtooth 0 → 1 that restarts instantly at the top, so it
   * maps to a rotation or a sweep without a reversal hitch. Parked at 0 outside
   * of `"refreshing"` and `"settling"`.
   */
  spin: SharedValue<number>;
  /** How the last refresh ended. Readable from worklets during stage 3. */
  outcome: SharedValue<RefreshOutcome>;
  isRefreshing: boolean;
  /** The error from the last failed refresh, for a banner or toast. */
  error: Error | null;
  /** Pan composed with the scroll view's own native gesture. */
  gesture: ComposedGesture;
  onScrollHandler: ReturnType<typeof useAnimatedScrollHandler>;
};

export type UseCustomRefreshControlParams = {
  /**
   * The actual work. Awaited — stage 2 lasts exactly as long as it does.
   *
   * Receives an `AbortSignal` that fires when the refresh times out. Forward it
   * to `fetch` (or your client's equivalent) so a timed-out request is actually
   * torn down rather than left running against a screen that has moved on.
   *
   * Rejecting is meaningful: it produces an `"error"` outcome, which stage 3
   * can render differently.
   */
  onRefresh: (signal: AbortSignal) => void | Promise<void>;
  /** Override the stage-2 ceiling. Defaults to 15s. */
  timeoutMs?: number;
};

// ============================================================================
// Hook
// ============================================================================

export default function useCustomRefreshControl({
  onRefresh,
  timeoutMs = REFRESH_TIMEOUT,
}: UseCustomRefreshControlParams): UseCustomRefreshControlResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const scrollY = useSharedValue(0);
  const pullY = useSharedValue(0);
  const spin = useSharedValue(0);
  const outcome = useSharedValue<RefreshOutcome>("none");
  // Worklets snapshot JS values when they are created, so the stage has to live
  // in a shared value to stay readable from the gesture callbacks. It doubles
  // as the gesture gate: anything other than idle/pulling ignores input.
  const phase = useSharedValue<RefreshPhase>("idle");

  /** Stage 3. The outcome is committed before the spring so the exit can differ. */
  const settle = (result: Exclude<RefreshOutcome, "none">) => {
    outcome.value = result;
    phase.value = "settling";
    pullY.value = withSpring(0, SPRING_REFRESH_SETTLE, () => {
      "worklet";
      // Unconditional rather than gated on `finished`: nothing else writes
      // pullY while settling, so an interrupted spring would only mean the
      // component unmounted — and leaving the phase stuck would deadlock the
      // gesture on the next mount.
      phase.value = "idle";
      cancelAnimation(spin);
      spin.value = 0;
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);

    const controller = new AbortController();
    const startedAt = Date.now();
    let failure: Error | null = null;

    // The timeout aborts the signal *and* rejects, so a client that ignores
    // the signal still can't hold the control open past the ceiling.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Refresh timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    // `Promise.resolve` normalizes a synchronous `onRefresh` that returns void.
    const work = Promise.resolve(onRefresh(controller.signal));
    // When the deadline wins the race, `work` is still in flight and will
    // almost certainly reject moments later — `fetch` rejects with AbortError
    // once the signal fires. Losing a race does not remove the need for a
    // handler, so attach a no-op one here or that rejection surfaces as an
    // unhandled promise rejection with no way to catch it downstream.
    work.catch(() => {});

    try {
      await Promise.race([work, deadline]);
    } catch (e) {
      failure = e instanceof Error ? e : new Error(String(e));
    } finally {
      clearTimeout(timer);
    }

    // Applied to failures too — an instant rejection (offline, cached 401)
    // would otherwise flash stages 2 and 3 too fast to read as anything.
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_REFRESH_DURATION) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REFRESH_DURATION - elapsed),
      );
    }

    setError(failure);
    setIsRefreshing(false);
    settle(failure ? "error" : "success");
  };

  // Tracked on the UI thread purely to answer "is the list at the top?".
  // The pull itself is driven by the pan gesture, not by scroll offset —
  // Android never reports negative offsets, so overscroll is not usable here.
  const onScrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      // Stage 1. Blocked during stages 2 and 3 so a second pull cannot start
      // on top of a refresh that is still running or closing.
      if (phase.value === "refreshing" || phase.value === "settling") return;

      if (scrollY.value <= 0 && e.translationY > 0) {
        // Clear the previous result the moment a new pull starts, so a stale
        // error state cannot bleed into this pull's stage 1.
        if (phase.value === "idle") outcome.value = "none";
        phase.value = "pulling";
        pullY.value = e.translationY;
      }
    })
    .onEnd(() => {
      if (phase.value !== "pulling") return;

      if (pullY.value > PULL_DISTANCE) {
        // Stage 2. The phase flips here on the UI thread rather than inside
        // `handleRefresh`, so a fast second pull cannot slip through in the
        // frames before `scheduleOnRN` lands on the JS thread.
        phase.value = "refreshing";
        pullY.value = withSpring(PULL_DISTANCE, SPRING_REFRESH_HOLD);
        spin.value = 0;
        spin.value = withRepeat(withTiming(1, SPIN_TIMING), -1, false);
        scheduleOnRN(handleRefresh);
      } else {
        // Cancelled, not settled — no stage 3.
        phase.value = "idle";
        pullY.value = withSpring(0, SPRING_REFRESH_SETTLE);
      }
    });

  // Runs alongside the scroll view's native gesture rather than replacing it.
  const gesture = Gesture.Simultaneous(panGesture, Gesture.Native());

  // `pullY` is held at PULL_DISTANCE for the duration of a refresh, so this
  // reaches and stays at 1 through stage 2, then falls back through stage 3.
  const progress = useDerivedValue(() =>
    interpolate(pullY.value, [0, PULL_DISTANCE], [0, 1], "clamp"),
  );

  return {
    progress,
    phase,
    spin,
    outcome,
    isRefreshing,
    error,
    gesture,
    onScrollHandler,
  };
}
