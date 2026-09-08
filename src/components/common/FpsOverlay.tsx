/**
 * FpsOverlay
 *
 * Lightweight on-screen frame-cadence readout for eyeballing perf between
 * formal trace captures. Renders one row per measured source.
 *
 * FLOW
 *   ui row   : own useFrameCallback (UI thread) accumulates into SharedValues
 *              every frame, then ~2×/sec scheduleOnRN's one setState.
 *   source   : a FrameSampler ticked by whoever owns a frame loop (see
 *   rows       `frameSampler.ts`), read via useSyncExternalStore.
 *   Either way the overlay re-renders ~twice a second, NOT per frame.
 *
 * WHY TWO KINDS OF ROW
 *   The `ui` row measures the *display link on the UI thread*. That is not the
 *   same clock as a JS-thread render loop: if the JS thread stalls, a WebGPU
 *   RAF loop drops frames while the UI row stays at a happy 120. Pass a
 *   `FrameSampler` that the render loop ticks to see what actually presented.
 *   Showing both side by side is the point — a gap between them localizes the
 *   stall to the JS thread.
 *
 * READOUT (mirrors the trace analyzers' metrics)
 *   `<label> <fps> fps · j120 <%> · j60 <%> · max <ms> [· w <ms>]`
 *   - fps  : effective fps = 1000 / mean frame interval over the window.
 *   - j120 : % of frames that missed the 120Hz budget (8.33ms × 1.5 tolerance).
 *   - j60  : % of frames that missed the 60Hz budget (16.67ms × 1.5).
 *   - max  : worst single frame interval in the window (ms).
 *   - w    : mean in-loop work per frame, only when the source reports it.
 *            `max` says whether the budget was missed; `w` says how much of it
 *            was our own work rather than everything else on the thread.
 *
 * USAGE
 *   Absolutely-positioned sibling (it's `pointerEvents:none`):
 *     {SHOW_FPS_OVERLAY && <FpsOverlay dark />}
 *
 *   With a render loop reporting its own cadence:
 *     const gpu = useFrameSampler("gpu");
 *     const canvasRef = useWebGPU(scene, [scene], canvasSize, gpu);
 *     ...
 *     <FpsOverlay dark sources={[gpu]} />
 *
 * CAVEATS
 *   - Simulators/emulators cap at 60Hz, so on-sim the 120Hz numbers are
 *     meaningless. Real numbers need a 120Hz device with
 *     `CADisableMinimumFrameDuration: true` in Info.plist.
 *   - ProMotion adaptive refresh legitimately drops the display link to a low
 *     rate on static content. Low fps there is not jank.
 *   - `present()` queues; it does not wait for the GPU. A GPU-bound stall shows
 *     up late (once swapchain back-pressure blocks) and smeared, not
 *     immediately. GPU timestamp queries are the answer for that.
 *   - Mean fps hides bimodal stutter — watch `max` and the j-percentages.
 */

import React, { useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type { FrameSampler, FrameStats } from "./frameSampler";

// ============================================================================
// Types
// ============================================================================

export type FpsOverlayProps = {
  /** Reporting cadence in ms (how often the text updates). Default 500. */
  intervalMs?: number;
  /** `true` = light text (dark backgrounds). `false` = dark text. Default false. */
  dark?: boolean;
  /** Extra frame loops to report, one row each. See `frameSampler.ts`. */
  sources?: FrameSampler[];
  /** Show the built-in UI-thread row. Default true. */
  showUiThread?: boolean;
};

// ============================================================================
// Component
// ============================================================================

const B120 = 1000 / 120; // 8.33ms
const B60 = 1000 / 60; // 16.67ms
/** See `frameSampler.ts` — vsync jitter makes an exact-budget compare useless. */
const DROP_TOLERANCE = 1.5;

export function FpsOverlay({
  intervalMs = 500,
  dark = false,
  sources,
  showUiThread = true,
}: FpsOverlayProps) {
  const color = dark ? "#fff" : "#000";

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {showUiThread && <UiThreadRow intervalMs={intervalMs} color={color} />}
      {sources?.map((s) => (
        <SourceRow key={s.label} sampler={s} color={color} />
      ))}
    </View>
  );
}

/** Reads the UI-thread display link directly via Reanimated. */
function UiThreadRow({
  intervalMs,
  color,
}: {
  intervalMs: number;
  color: string;
}) {
  const [stats, setStats] = useState<FrameStats>({
    label: "ui",
    fps: 0,
    j120: 0,
    j60: 0,
    max: 0,
    work: null,
  });

  const frames = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const over120 = useSharedValue(0);
  const over60 = useSharedValue(0);
  const maxMs = useSharedValue(0);
  const sinceReport = useSharedValue(0);

  useFrameCallback((info) => {
    "worklet";
    const dt = info.timeSincePreviousFrame ?? 0;
    if (dt <= 0) return;

    frames.value += 1;
    elapsed.value += dt;
    if (dt > B120 * DROP_TOLERANCE) over120.value += 1;
    if (dt > B60 * DROP_TOLERANCE) over60.value += 1;
    if (dt > maxMs.value) maxMs.value = dt;
    sinceReport.value += dt;

    if (sinceReport.value >= intervalMs && frames.value > 0) {
      const f = frames.value;
      scheduleOnRN(setStats, {
        label: "ui",
        fps: Math.round(1000 / (elapsed.value / f)),
        j120: Math.round((over120.value / f) * 1000) / 10,
        j60: Math.round((over60.value / f) * 1000) / 10,
        max: Math.round(maxMs.value * 10) / 10,
        work: null,
      });
      frames.value = 0;
      elapsed.value = 0;
      over120.value = 0;
      over60.value = 0;
      maxMs.value = 0;
      sinceReport.value = 0;
    }
  });

  return <Row stats={stats} color={color} />;
}

/** Reads a loop-owned sampler. No per-frame React work. */
function SourceRow({
  sampler,
  color,
}: {
  sampler: FrameSampler;
  color: string;
}) {
  const stats = useSyncExternalStore(sampler.subscribe, sampler.getSnapshot);
  return <Row stats={stats} color={color} />;
}

function Row({ stats, color }: { stats: FrameStats; color: string }) {
  return (
    <Text style={[styles.text, { color }]}>
      <Text style={styles.label}>{stats.label} </Text>
      {stats.fps} fps · j120 {stats.j120}% · j60 {stats.j60}% · max {stats.max}
      ms
      {stats.work !== null ? ` · w ${stats.work}ms` : ""}
    </Text>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 58, // clear the status bar / Dynamic Island
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 2,
    backgroundColor: "rgba(127,127,127,0.18)",
  },
  text: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  label: {
    opacity: 0.6,
  },
});
