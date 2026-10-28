/**
 * VortexCanvas — a WebGPU canvas that shows a live texture, and swallows it on demand.
 *
 * FLOW (one UI-worklet frame, one present):
 *   drawSource(t) ─► vortex layer ─► lens layer ─► blit to the swapchain
 *   standby (idle):  drawSource redraws the shared texture (e.g. Skia + flush),
 *                    the vortex layer draws it 1:1 (one fullscreen pass, no
 *                    compute, no histogram readback), the lens passes it through
 *   handle.swallow(at?) ─► phase flips ─► the NEXT frame is the run's frame 0:
 *                    tiles at home sampling the same texture (identical pixels,
 *                    no pop) ─► tiles fall into the hole, drawSource keeps feeding
 *                    live content ─► every tile swallowed ─► the promise resolves
 *   handle.reset() ─► phase 0 ─► standby again (the content is back, no view swap)
 *
 * KEY FEATURES:
 * - Same handle and callbacks as `VortexSnapshot` (`VortexSnapshotHandle`)
 * - No RN children and no snapshot: the canvas itself is the content
 * - Texture source only: the caller owns the texture (never destroyed here), makes
 *   it on the shared device, and sizes it to this canvas in physical px
 *   (layout size × PixelRatio)
 * - `drawSource` is a worklet; Skia objects it uses must be created on the JS
 *   thread and captured (bundle mode re-evaluates imports on the UI runtime)
 * - Standby `onStats` reports `mode: "standby"`, running reports `"running"`
 *
 * Mount it as a whole screen area (plain View, not ThemeView).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { Canvas } from "react-native-webgpu";
import { type LensTuneValues, useLensTune } from "./lensTune";
import { type RunState, useVortexRun } from "./useVortexRun";
import { DEFAULT_VORTEX, SPACE_COLOR } from "./vortexConstants";
import type { VortexStats } from "./vortexScene";
import type { TextureSource } from "./vortexSource";
import type { Point, VortexSnapshotHandle } from "./VortexSnapshot";

// ============================================================================
// Types
// ============================================================================

/** Same imperative handle as `VortexSnapshot`. */
export type VortexCanvasHandle = VortexSnapshotHandle;

export type VortexCanvasProps = {
  /** The live texture to show and swallow. Caller-owned, sized to this canvas in physical px. */
  source: TextureSource;
  /**
   * Worklet called first in every frame with the frame timestamp (ms), in
   * standby and while running. Redraw the source texture here and flush.
   * Read at scene build: keep it stable (memoize it).
   */
  drawSource?: (t: number) => void;
  /** Tile size in px. Default DEFAULT_VORTEX.tile; changes rebuild the scene. */
  tile?: number;
  /** Sticky patches. Default true. */
  sticky?: boolean;
  /** Default hole center as a 0..1 fraction of the canvas. Read at scene build. */
  center?: Point;
  /** Premultiplied clear color behind the tiles. Default SPACE_COLOR. Read at scene build. */
  background?: readonly [number, number, number, number];
  /** Gate: nothing is built and swallow() rejects until true. Default true. */
  enabled?: boolean;
  speed?: SharedValue<number>;
  /** Written every frame: fraction of tiles swallowed. */
  progress?: SharedValue<number>;
  /** -1 = none; 0..1 seeks the run to that progress while held. */
  seekTarget?: SharedValue<number>;
  /** True freezes the sim. */
  paused?: SharedValue<boolean>;
  /** Default: the canvas calls `useLensTune()` itself. */
  lensTune?: LensTuneValues;
  onStateChange?: (s: RunState) => void;
  /** The run's first frame was presented. */
  onStart?: () => void;
  /** The run reached done. */
  onSwallowed?: () => void;
  /** Throttled frame stats (every STATS_EVERY frames), for standby and running. */
  onStats?: (s: VortexStats) => void;
  style?: StyleProp<ViewStyle>;
};

type Pending = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
};

// ============================================================================
// Component
// ============================================================================

export const VortexCanvas = forwardRef<VortexCanvasHandle, VortexCanvasProps>(
  (
    {
      source,
      drawSource,
      tile = DEFAULT_VORTEX.tile,
      sticky = true,
      center,
      background = SPACE_COLOR,
      enabled = true,
      speed,
      progress,
      seekTarget,
      paused,
      lensTune,
      onStateChange,
      onStart,
      onSwallowed,
      onStats,
      style,
    },
    ref,
  ) => {
    const ownLensTune = useLensTune();
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;
    const onStartRef = useRef(onStart);
    onStartRef.current = onStart;
    const onSwallowedRef = useRef(onSwallowed);
    onSwallowedRef.current = onSwallowed;
    const pending = useRef<Pending | null>(null);
    const prevRun = useRef<RunState>("idle");
    const layout = useRef({ width: 0, height: 0 });

    const vortex = useVortexRun({
      enabled,
      prewarm: true,
      source,
      standby: "source",
      drawSource,
      ready: true,
      initialTile: tile,
      initialSticky: sticky,
      clearColor: background,
      center,
      lensTune: lensTune ?? ownLensTune,
      speed,
      progress,
      seekTarget,
      paused,
      onStats,
      onStarted: () => onStartRef.current?.(),
    });
    const { run, canvasRef, viewRef, onLayout, actions } = vortex;

    // Settle / reject the pending swallow on run transitions.
    useEffect(() => {
      const prev = prevRun.current;
      prevRun.current = run;
      onStateChangeRef.current?.(run);
      const p = pending.current;
      if (run === "done") {
        if (p) {
          pending.current = null;
          p.resolve();
        }
        onSwallowedRef.current?.();
      } else if (run === "idle" && prev !== "idle" && p) {
        pending.current = null;
        p.reject(new Error("VortexCanvas: swallow cancelled"));
      }
    }, [run]);

    // Unmount: reject a pending swallow.
    useEffect(
      () => () => {
        const p = pending.current;
        if (p) {
          pending.current = null;
          p.reject(new Error("VortexCanvas: unmounted"));
        }
      },
      [],
    );

    // Live props.
    useEffect(() => {
      if (tile !== vortex.tile) actions.pickTile(tile);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tile]);
    useEffect(() => {
      if (sticky !== vortex.sticky) actions.toggleSticky();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sticky]);

    const handleLayout = (e: LayoutChangeEvent) => {
      layout.current = e.nativeEvent.layout;
      onLayout(e);
    };

    useImperativeHandle(ref, () => ({
      swallow: (at?: Point) => {
        if (pending.current) return pending.current.promise;
        if (run !== "idle") {
          return Promise.reject(new Error(`VortexCanvas: cannot swallow while ${run}`));
        }
        let resolve!: () => void;
        let reject!: (e: Error) => void;
        const promise = new Promise<void>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        // Callers may ignore the promise: keep a handled copy.
        promise.catch(() => {});
        const mine: Pending = { promise, resolve, reject };
        pending.current = mine;
        const { width, height } = layout.current;
        const origin = at && width > 0 && height > 0 ? { x: at.x / width, y: at.y / height } : undefined;
        actions.release(origin).then((started) => {
          if (!started && pending.current === mine) {
            pending.current = null;
            reject(new Error("VortexCanvas: could not start the run"));
          }
        });
        return promise;
      },
      pause: actions.pause,
      resume: actions.resume,
      reset: actions.reset,
      scrubEnd: actions.onScrubEnd,
    }));

    return (
      <View ref={viewRef} collapsable={false} onLayout={handleLayout} style={[styles.root, style]}>
        <Canvas ref={canvasRef} pointerEvents="none" style={StyleSheet.absoluteFill} />
      </View>
    );
  },
);

VortexCanvas.displayName = "VortexCanvas";

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  root: { overflow: "hidden" },
});
