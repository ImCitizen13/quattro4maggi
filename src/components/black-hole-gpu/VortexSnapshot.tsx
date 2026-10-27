/**
 * VortexSnapshot — wraps any view; `swallow()` pulls it into the GPU black hole.
 *
 * FLOW:
 *   mount ─► children laid out ─► nothing on the GPU (lazy, default); with
 *     `prewarm` the snapshot texture + standby scene are built now at the
 *     children's layout size
 *   swallow ─► (lazy) texture + scene built during the 120 ms press delay
 *   handle.swallow(at?) (idle) ─► origin: `at` (points) | the last touch inside
 *     the wrapper (< 1 s ago, `touchOrigin`) | `center` ─► actions.release(origin):
 *     capture children into the texture ─► run starts, hole opens at the origin ─► first GPU frame hides the children (onStart)
 *     ─► every tile swallowed ─► run = "done" ─► the promise resolves (onSwallowed)
 *   handle.reset() / relayout / unmount before done ─► the promise rejects
 *   handle.reset() ─► children are shown again
 *
 * KEY FEATURES:
 * - Imperative handle: swallow / pause / resume / reset
 * - The destruction starts where the user touched (a tap that triggers
 *   swallow), or at an explicit point, else at `center` (default middle)
 * - The inner view sizes to its children (the snapshot is taken at that size);
 *   the canvas overlays it exactly, so the root must carry no padding
 * - Canvas stays at opacity 0.01 while a scene exists but the children show
 *   (opacity 0 stalls Core Animation for 1 s)
 * - Live props: `tile` (rebuilds the scene), `sticky` (restarts an active run)
 * - `center` and `background` are read at scene build
 * - Lens knobs come from `lensTune`, or the wrapper's own `useLensTune()`
 * - Rejections never surface as unhandled for callers that ignore the promise
 */
import {
  type ReactNode,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { Canvas } from "react-native-webgpu";
import { type LensTuneValues, useLensTune } from "./lensTune";
import { type RunState, useVortexRun } from "./useVortexRun";
import { DEFAULT_VORTEX, type VortexStats } from "./vortexScene";

// ============================================================================
// Types
// ============================================================================

export type Point = { x: number; y: number };

export type VortexSnapshotHandle = {
  /**
   * Capture the children and run. Resolves when every tile is swallowed;
   * rejects if the run can't start, or on reset / relayout / unmount before
   * done. Calling while a swallow is pending returns the same promise.
   * `at` (points, relative to the wrapper) is where the hole opens; omitted =
   * the last touch inside the wrapper (see `touchOrigin`), else `center`.
   */
  swallow: (at?: Point) => Promise<void>;
  pause: () => void;
  resume: () => void;
  /** Stop and show the children again (rejects a pending swallow). */
  reset: () => void;
};

export type VortexSnapshotProps = {
  children: ReactNode;
  /** Tile size in px. Default DEFAULT_VORTEX.tile; changes rebuild the scene. */
  tile?: number;
  /** Sticky patches. Default true; changes restart an active run. */
  sticky?: boolean;
  /** Default hole center as a 0..1 fraction of the children. Read at scene build. */
  center?: Point;
  /**
   * A swallow() without `at` opens the hole at the last touch inside the
   * wrapper, if it is under 1 s old (e.g. the tap that called swallow).
   * Default true.
   */
  touchOrigin?: boolean;
  /** Premultiplied clear color, default transparent. Read at scene build. */
  background?: readonly [number, number, number, number];
  /** Children can be captured (e.g. images loaded). Default true. */
  ready?: boolean;
  /**
   * Build the GPU scene on mount for the fastest swallow. Default false: the
   * scene is built inside swallow() and freed on reset / unmount, so idle
   * wrappers (e.g. list rows) hold no GPU memory.
   */
  prewarm?: boolean;
  speed?: SharedValue<number>;
  /** Written every frame: fraction of tiles swallowed. */
  progress?: SharedValue<number>;
  /** -1 = none; 0..1 seeks the run to that progress while held. */
  seekTarget?: SharedValue<number>;
  /** Default: the wrapper calls `useLensTune()` itself. */
  lensTune?: LensTuneValues;
  onStateChange?: (s: RunState) => void;
  /** First GPU frame shown, children hidden. */
  onStart?: () => void;
  /** The run reached done. */
  onSwallowed?: () => void;
  onStats?: (s: VortexStats) => void;
  style?: StyleProp<ViewStyle>;
};

type Pending = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
};

type Touch = { pageX: number; pageY: number; t: number };

// ============================================================================
// Constants
// ============================================================================

/** A touch older than this no longer picks the swallow origin. */
const TOUCH_WINDOW_MS = 1000;

// ============================================================================
// Component
// ============================================================================

export const VortexSnapshot = forwardRef<VortexSnapshotHandle, VortexSnapshotProps>(
  (
    {
      children,
      tile = DEFAULT_VORTEX.tile,
      sticky = true,
      center,
      touchOrigin = true,
      background,
      ready = true,
      prewarm = false,
      speed,
      progress,
      seekTarget,
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
    // Last touch inside the wrapper (page coords), for the swallow origin.
    const lastTouch = useRef<Touch | null>(null);
    const prevRun = useRef<RunState>("idle");

    const vortex = useVortexRun({
      enabled: true,
      prewarm,
      ready,
      initialTile: tile,
      initialSticky: sticky,
      clearColor: background,
      center,
      lensTune: lensTune ?? ownLensTune,
      speed,
      progress,
      seekTarget,
      onStats,
      onStarted: () => onStartRef.current?.(),
    });
    const { run, show, hasScene, canvasRef, viewRef, onLayout, actions } = vortex;

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
        p.reject(new Error("VortexSnapshot: swallow cancelled"));
      }
    }, [run]);

    // Unmount: reject a pending swallow.
    useEffect(
      () => () => {
        const p = pending.current;
        if (p) {
          pending.current = null;
          p.reject(new Error("VortexSnapshot: unmounted"));
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

    // Hole origin for a swallow, as a fraction of the captured view: `at`
    // (points), else a recent touch inside the wrapper, else undefined (the
    // scene uses `center`). Measured now, so a scroll since layout is fine.
    const resolveOrigin = (at?: Point) =>
      new Promise<Point | undefined>((resolve) => {
        const touch = lastTouch.current;
        const fromTouch =
          !at && touchOrigin && touch !== null && Date.now() - touch.t < TOUCH_WINDOW_MS;
        const view = viewRef.current;
        if ((!at && !fromTouch) || !view) {
          resolve(undefined);
          return;
        }
        view.measure((_x, _y, width, height, pageX, pageY) => {
          if (!width || !height) {
            resolve(undefined);
            return;
          }
          const px = at ? at.x : touch!.pageX - pageX;
          const py = at ? at.y : touch!.pageY - pageY;
          resolve({ x: px / width, y: py / height });
        });
      });

    useImperativeHandle(ref, () => ({
      swallow: (at?: Point) => {
        if (pending.current) return pending.current.promise;
        if (run !== "idle") {
          return Promise.reject(new Error(`VortexSnapshot: cannot swallow while ${run}`));
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
        resolveOrigin(at)
          .then((origin) => actions.release(origin))
          .then((started) => {
          if (!started && pending.current === mine) {
            pending.current = null;
            reject(new Error("VortexSnapshot: could not start the run"));
          }
        });
        return promise;
      },
      pause: actions.pause,
      resume: actions.resume,
      reset: actions.reset,
    }));

    return (
      <View style={[styles.root, style]}>
        <View
          ref={viewRef}
          collapsable={false}
          onLayout={onLayout}
          onTouchStart={(e) => {
            const { pageX, pageY } = e.nativeEvent;
            lastTouch.current = { pageX, pageY, t: Date.now() };
          }}
          style={show === "gpu" && styles.hidden}
        >
          {children}
        </View>
        <Canvas
          ref={canvasRef}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            show === "rn" && (hasScene ? styles.starting : styles.hidden),
          ]}
        />
      </View>
    );
  },
);

VortexSnapshot.displayName = "VortexSnapshot";

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  root: { padding: 0 },
  hidden: { opacity: 0 },
  // Standby scene exists, children show: 0.01 keeps the layer composited
  // (a canvas at opacity 0 stalls 1 s in Core Animation).
  starting: { opacity: 0.01 },
});
