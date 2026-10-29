/**
 * useUiDriver
 *
 * Runs `source.step` every frame on the UI thread via `useFrameCallback`.
 *
 * FLOW:
 * 1. Each frame: `ensureParticleBuffers(bufferKey, …)` returns the UI-runtime
 *    buffers (allocated at `capacity` + `source.init` on the first frame).
 *    Only the first `count.value` particles are stepped.
 * 2. Build plain-number StepParams from the SharedValues, time `source.step`
 *    with performance.now(), mutate `out` in place
 * 3. Bump `frame` so the renderer's mapper re-runs
 * 4. Every HUD_REPORT_INTERVAL_MS publish the mean step ms to `stepMs`
 *
 * BUFFER SHARING:
 * Buffers are allocated on the UI runtime and looked up by key (see
 * `particleBuffers.ts`), so this driver and the renderer touch the same
 * memory. No per-frame allocation: StepParams is the only per-frame object.
 */

import { useFrameCallback, useSharedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { HUD_REPORT_INTERVAL_MS } from "../constants";
import { ensureParticleBuffers } from "../particleBuffers";
import type { Bounds, PhysicsSource } from "../types";

// ============================================================================
// Types
// ============================================================================

export type UiDriverParams = {
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  mass: SharedValue<number>;
  timeScale: SharedValue<number>;
};

export type UseUiDriverOptions = {
  source: PhysicsSource;
  /** Registry key shared with the renderer */
  bufferKey: string;
  /** Buffer capacity (allocated + initialized once) */
  capacity: number;
  /** Active particle count, a prefix of capacity. Changing it keeps particles. */
  count: SharedValue<number>;
  bounds: Bounds;
  params: UiDriverParams;
  /** Optional external SharedValue to publish mean step ms into (e.g. owned by the HUD) */
  stepMs?: SharedValue<number>;
};

/** What every driver (UI, JS, worker) returns, so the renderer/HUD are agnostic */
export type PhysicsDriver = {
  /** Incremented after every step; the renderer depends on it */
  frame: SharedValue<number>;
  /** Mean step time in ms over the last report interval */
  stepMs: SharedValue<number>;
};

// ============================================================================
// Hook
// ============================================================================

export function useUiDriver({
  source,
  bufferKey,
  capacity,
  count,
  bounds,
  params,
  stepMs: externalStepMs,
}: UseUiDriverOptions): PhysicsDriver {
  const frame = useSharedValue(0);
  const ownStepMs = useSharedValue(0);
  const stepMs = externalStepMs ?? ownStepMs;
  const accMs = useSharedValue(0);
  const accFrames = useSharedValue(0);
  const sinceReport = useSharedValue(0);
  const { width, height } = bounds;

  // SharedValue writes inside worklets are the intended mutation here
  // eslint-disable-next-line react-hooks/immutability
  useFrameCallback((info) => {
    "worklet";
    const dt = (info.timeSincePreviousFrame ?? 0) / 1000;
    if (dt <= 0) return;

    const b = ensureParticleBuffers(bufferKey, source, capacity, width, height);
    const t0 = performance.now();
    source.step(
      b.state,
      b.out,
      Math.min(count.value, b.capacity),
      {
        cx: params.cx.value,
        cy: params.cy.value,
        mass: params.mass.value,
        timeScale: params.timeScale.value,
      },
      dt
    );
    accMs.value += performance.now() - t0;
    accFrames.value += 1;
    frame.value += 1;

    sinceReport.value += dt * 1000;
    if (sinceReport.value >= HUD_REPORT_INTERVAL_MS && accFrames.value > 0) {
      stepMs.value = accMs.value / accFrames.value;
      accMs.value = 0;
      accFrames.value = 0;
      sinceReport.value = 0;
    }
  });

  return { frame, stepMs };
}
