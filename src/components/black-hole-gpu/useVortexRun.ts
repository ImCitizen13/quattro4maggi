/**
 * useVortexRun — the GPU vortex run state machine behind a wrapped RN view.
 *
 * FLOW:
 *   `enabled` flips ─► snapshot texture + standby scene are built once
 *     (TypeGPU root: one particle per tile, storage buffer); nothing is drawn
 *   actions.release (idle) ─► 120 ms ─► drawElementImageToTexture INTO the scene's texture
 *        └─ `phase` SharedValue flips ─► the UI loop starts the run (sim reset,
 *           particles seeded at home, frame 0) ─► onStarted hides the RN view (show = "gpu")
 *        └─ per frame (ui-worklet, composeLayered): vortex layer = compute
 *             `step` (N × h=1/120) ─► 6 × N instanced tiles sampling the
 *             snapshot over space ─► lens layer (reads that as its backdrop):
 *             gravitational lensing + glass bubble ─► blit to the swapchain
 *             ─► writes `progress` (fraction of tiles swallowed)
 *   actions.pause (running) ─► `paused` = true: sim frozen, frames still drawn
 *   actions.resume (paused) ─► `paused` = false: the run continues
 *   scrub (seekTarget) ─► the run seeks; actions.onScrubEnd follows the resume in state
 *        └─ onDone(true) ─► "done"; scrubbing back before the end ─► "running" again
 *   actions.reset ─► phase = 0 (one transparent frame, then no present), show the RN view
 *
 * SOURCE: `source: { kind: "texture" }` skips the capture: release ─► running at once,
 *   the scene samples the caller's texture (never destroyed here); see vortexSource.ts
 *
 * STATE: run = idle ─► capturing ─► running ⇄ paused, running/paused ─► done; reset ─► idle
 *
 * KEY FEATURES:
 * - Owns the shared GPU device, snapshot texture, scene memo (deps: snapshot
 *   texture, tile) and the phase/seed/sticky/progress/paused/seekTarget SharedValues
 * - No scene rebuild on release/pause/reset/sticky; only tile or layout size change rebuilds
 * - `prewarm` (default) builds the standby scene up front; `prewarm: false` builds
 *   texture + scene inside release (overlapping the press delay) and frees them
 *   on reset / unmount, so idle wrappers hold no GPU memory
 * - Epoch guard: reset, relayout and unmount cancel an in-flight release
 * - Snapshot and scene share one device (useDevice makes a new one per call)
 * - Render loop on the UI runtime
 * - Stats go out through `onStats`; the hook holds no demo status text
 */
import { type RefObject, useMemo, useRef, useState, useEffect } from "react";
import { type LayoutChangeEvent, PixelRatio, type View } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { useSharedDevice } from "@/hooks/useSharedDevice";
import { useWebGPUOnDevice } from "../gargantua-type-gpu/hooks/useWebGPU";
import { composeLayered } from "../gargantua-type-gpu/composeLayered";
import { createLensScene, type LensShared } from "./lensScene";
import type { LensTuneValues } from "./lensTune";
import { captureInto, createSnapshotTexture } from "./snapshot";
import { DEFAULT_SPEED, DEFAULT_VORTEX, RELEASE_DELAY_MS } from "./vortexConstants";
import { createVortexScene, type VortexStats } from "./vortexScene";
import type { VortexSource } from "./vortexSource";

// ============================================================================
// Types
// ============================================================================

export type ShowMode = "rn" | "gpu";

/**
 * Run lifecycle. idle ─► capturing (release pressed, snapshot in flight) ─►
 * running ⇄ paused; running / paused ─► done (all tiles swallowed); reset ─► idle.
 */
export type RunState = "idle" | "capturing" | "running" | "paused" | "done";

export type UseVortexRunOptions = {
  /** Gate: no snapshot texture / scene until true (the demo's push-transition gate). */
  enabled: boolean;
  /**
   * True (default): texture + standby scene are built as soon as `enabled` and
   * laid out, so release only captures. False (lazy): nothing is allocated
   * until release; reset (or unmount) frees it again.
   */
  prewarm?: boolean;
  /**
   * Tile source. Default `{ kind: "snapshot" }` (capture the wrapped view).
   * `{ kind: "texture" }` uses a caller-owned texture: no capture, no
   * `capturing` state, the stage size comes from the texture, and the hook
   * runs on `source.device`. See `VortexSource`.
   */
  source?: VortexSource;
  /** The wrapped view can be captured (e.g. its image loaded). Release is a no-op while false. */
  ready: boolean;
  /** Initial tile size in px. Default DEFAULT_VORTEX.tile. */
  initialTile?: number;
  /** Initial sticky patches flag. Default true. */
  initialSticky?: boolean;
  /** Space color the vortex layer clears to. Default transparent. */
  clearColor?: readonly [number, number, number, number];
  /** Hole center as a 0..1 fraction of the snapshot. */
  center?: { x: number; y: number };
  /** Live lens knobs from `useLensTune`. */
  lensTune: LensTuneValues;
  /** External speed SharedValue; the hook creates one (DEFAULT_SPEED) if omitted. */
  speed?: SharedValue<number>;
  /** External progress SharedValue; the hook creates one (0) if omitted. */
  progress?: SharedValue<number>;
  /** External seek SharedValue (-1 = none); the hook creates one if omitted. */
  seekTarget?: SharedValue<number>;
  /** External paused SharedValue; the hook creates one (false) if omitted. */
  paused?: SharedValue<boolean>;
  /** Called right after the first GPU frame is shown (show = "gpu"). */
  onStarted?: () => void;
  /** Called with the throttled per-frame stats from the vortex scene. */
  onStats?: (stats: VortexStats) => void;
};

export type VortexRunActions = {
  /**
   * From idle: capture the view into the scene's texture, then start the run.
   * Resolves true once the run phase started, false on any early return,
   * capture failure or epoch bail. `origin` (0..1 fraction of the view) is
   * where the hole opens for this run; omitted = the `center` option.
   */
  release: (origin?: { x: number; y: number }) => Promise<boolean>;
  /** From running: freeze the sim (frames still drawn). */
  pause: () => void;
  /** From paused: continue the run. */
  resume: () => void;
  /** Stop any run / capture and show the RN view again. */
  reset: () => void;
  /** Change the tile size (rebuilds the scene). */
  pickTile: (size: number) => void;
  /** Toggle sticky patches (restarts an active run). */
  toggleSticky: () => void;
  /** The scrub already cleared `paused` on the UI thread; follow it in state. */
  onScrubEnd: () => void;
};

export type UseVortexRun = {
  run: RunState;
  show: ShowMode;
  /** The standby scene exists (canvas can be composited). */
  hasScene: boolean;
  canvasRef: ReturnType<typeof useWebGPUOnDevice>;
  /** Attach to the wrapped view (collapsable={false}). */
  viewRef: RefObject<View | null>;
  /** Attach to the wrapped view; a size change resets and rebuilds. */
  onLayout: (e: LayoutChangeEvent) => void;
  speed: SharedValue<number>;
  /** Written every frame by the render worklet: fraction of tiles swallowed. */
  progress: SharedValue<number>;
  /** True freezes the sim (frames still drawn). */
  paused: SharedValue<boolean>;
  /** -1 = none; 0..1 = the scene seeks the run to that progress while held. */
  seekTarget: SharedValue<number>;
  tile: number;
  sticky: boolean;
  actions: VortexRunActions;
};

// ============================================================================
// Constants
// ============================================================================

// UI-thread loop only for now (user decision 2026-10-23). The hook still
// supports "js-raf" (gargantua uses it); restore a toggle here if needed.
const RENDER_MODE = "ui-worklet" as const;

/** `origin` SharedValue "unset": the scene falls back to the `center` option. */
const NO_ORIGIN = { x: -1, y: -1 };

// ============================================================================
// Hook
// ============================================================================

export const useVortexRun = ({
  enabled,
  prewarm = true,
  source,
  ready,
  initialTile = DEFAULT_VORTEX.tile,
  initialSticky = true,
  clearColor,
  center,
  lensTune,
  speed: speedProp,
  progress: progressProp,
  seekTarget: seekTargetProp,
  paused: pausedProp,
  onStarted: onStartedProp,
  onStats,
}: UseVortexRunOptions): UseVortexRun => {
  const sharedDevice = useSharedDevice();
  // A texture source runs on the device its texture lives on.
  const callerTex = source?.kind === "texture" ? source.texture : null;
  const device = source?.kind === "texture" ? source.device : sharedDevice;
  const ownSpeed = useSharedValue(DEFAULT_SPEED);
  const speed = speedProp ?? ownSpeed;
  // Read by the UI-runtime loop: phase 0 = idle, a new non-zero value = start a run.
  const phase = useSharedValue(0);
  // Written every frame by the render worklet: fraction of tiles swallowed.
  const ownProgress = useSharedValue(0);
  const progress = progressProp ?? ownProgress;
  // True freezes the sim (frames still drawn).
  const ownPaused = useSharedValue(false);
  const paused = pausedProp ?? ownPaused;
  // -1 = none; 0..1 = the scene seeks the run to that progress while held.
  const ownSeekTarget = useSharedValue(-1);
  const seekTarget = seekTargetProp ?? ownSeekTarget;
  const seedSv = useSharedValue(0);
  const stickySv = useSharedValue(DEFAULT_VORTEX.sticky);
  // Per-run hole center (fraction), read by the scene when a run starts.
  const originSv = useSharedValue(NO_ORIGIN);
  const runId = useRef(0);
  const viewRef = useRef<View>(null);
  const layout = useRef({ width: 0, height: 0 });
  const busy = useRef(false);
  // Bumped by reset, layout change and unmount: an in-flight release bails.
  const epoch = useRef(0);
  // The scene memo captures its callbacks once; read the latest through a ref.
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const onStartedRef = useRef(onStartedProp);
  onStartedRef.current = onStartedProp;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [run, setRun] = useState<RunState>("idle");
  const [show, setShow] = useState<ShowMode>("rn");
  const [tile, setTile] = useState<number>(initialTile);
  const [sticky, setSticky] = useState(initialSticky);
  // Lazy mode: a release asked for the texture + scene (cleared by reset).
  const [wanted, setWanted] = useState(false);
  // Lazy release waiting for the texture: resolved with it once built, or with
  // null by reset so the release bails instead of hanging.
  const texWaiters = useRef<((tex: GPUTexture | null) => void)[]>([]);
  // A run was requested and not reset (the RN view may be hidden).
  const active = run !== "idle" && run !== "capturing";

  useEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );

  const dpr = PixelRatio.get();
  const pxW = size ? Math.round(size.width * dpr) : 0;
  const pxH = size ? Math.round(size.height * dpr) : 0;

  // The scene's snapshot texture, owned here and refilled by every release.
  // Lazy mode allocates it only once a release wants it.
  const build = enabled && (prewarm || wanted);
  // Null for a texture source: the caller owns that texture.
  const snapTex = useMemo(
    () =>
      device && !callerTex && build && pxW > 0 && pxH > 0
        ? createSnapshotTexture(device, pxW, pxH)
        : null,
    [device, callerTex, build, pxW, pxH],
  );
  // The texture the scene samples: the caller's (once wanted) or the snapshot.
  const srcTex = callerTex ? (device && build ? callerTex : null) : snapTex;
  const srcW = srcTex?.width ?? 0;
  const srcH = srcTex?.height ?? 0;

  // Hand a freshly built texture to a lazy release waiting for it.
  useEffect(() => {
    if (!snapTex) return;
    const waiters = texWaiters.current;
    texWaiters.current = [];
    for (const w of waiters) w(snapTex);
  }, [snapTex]);

  const onStarted = () => {
    setShow("gpu");
    busy.current = false;
    onStartedRef.current?.();
  };

  // "All tiles swallowed" flipped. Functional setState: the scene memo captures
  // this callback once, so it must not read `run` from a stale closure.
  const onDone = (done: boolean) =>
    setRun((r) => {
      if (done) return r === "running" || r === "paused" ? "done" : r;
      return r === "done" ? "running" : r;
    });

  // Two layers: the vortex (tiles over space) then the lens, which reads it as
  // its backdrop. `shared` is the vortex-to-lens handoff, fresh per scene.
  const scene = useMemo(() => {
    if (!srcTex) return null;
    const shared: LensShared = {};
    return composeLayered([
      {
        scene: createVortexScene({
          snapshot: srcTex,
          config: { ...DEFAULT_VORTEX, tile },
          clearColor,
          center,
          origin: originSv,
          speed,
          phase,
          progress,
          paused,
          seekTarget,
          seed: seedSv,
          sticky: stickySv,
          shared,
          onStarted,
          onDone,
          onStats: (s: VortexStats) => onStatsRef.current?.(s),
        }),
      },
      { scene: createLensScene(shared, lensTune), readsBackdrop: true },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcTex, srcW, srcH, tile]);
  const canvasRef = useWebGPUOnDevice(device, scene, [scene], size, {
    mode: RENDER_MODE,
  });

  // Declared after the hook's effect: on a texture change React runs the hook's
  // cleanup first (it cancels the UI loop and tears the scene down), so the
  // texture is destroyed only once nothing samples it. Only the owned snapshot
  // texture: a caller texture (snapTex is null then) is never destroyed here.
  useEffect(() => () => snapTex?.destroy(), [snapTex]);

  const reset = () => {
    epoch.current += 1;
    busy.current = false;
    phase.value = 0;
    paused.value = false;
    seekTarget.value = -1;
    progress.value = 0;
    setRun("idle");
    setShow("rn");
    // Lazy: free the texture + scene; a release still waiting bails.
    setWanted(false);
    const waiters = texWaiters.current;
    texWaiters.current = [];
    for (const w of waiters) w(null);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const changed = width !== layout.current.width || height !== layout.current.height;
    layout.current = { width, height };
    if (changed) {
      // Texture and scene rebuild from the new size; stop any run / capture on
      // the old one.
      reset();
      setSize({ width, height });
    }
  };

  // Begin a run on the current texture: busy until the loop reports onStarted.
  const startPhase = (stickyOn: boolean) => {
    busy.current = true;
    seedSv.value = Math.floor(Math.random() * 1e6);
    stickySv.value = stickyOn ? DEFAULT_VORTEX.sticky : 0;
    paused.value = false;
    seekTarget.value = -1;
    runId.current += 1;
    phase.value = runId.current;
  };

  // Release from idle: fresh capture of the RN view into the scene's texture,
  // then the run starts. (Once a run exists the RN view is hidden, so a
  // recapture would be blank: release is disabled until reset.)
  //
  // Lazy (no texture yet): ask for the build and wait for the texture in
  // parallel with the press delay. The phase flip may land before the new
  // scene's setup finishes; its first frame (lastPhase = -1) starts the run
  // by itself, as on a tile change.
  const release = async (origin?: { x: number; y: number }): Promise<boolean> => {
    if (!device || !enabled || !ready || busy.current || !size) {
      return false;
    }
    if (prewarm && (!scene || !srcTex)) return false;
    busy.current = true;
    // Kept for the whole run: a tile / Sticky restart reopens at the same spot.
    originSv.value = origin ?? NO_ORIGIN;
    if (callerTex) {
      // Texture source: nothing to capture, so no `capturing` state and no
      // press delay. Lazy: ask for the scene; the phase flip may land before
      // its setup and the new scene's first frame starts the run itself.
      if (!prewarm) setWanted(true);
      startPhase(sticky);
      setRun("running");
      return true;
    }
    setRun("capturing");
    const myEpoch = epoch.current;
    let tex = snapTex;
    const texReady = tex
      ? null
      : new Promise<GPUTexture | null>((r) => texWaiters.current.push(r));
    if (!tex) setWanted(true);
    await new Promise((r) => setTimeout(r, RELEASE_DELAY_MS));
    // Reset, relayout or unmount during the delay (reset already cleared busy).
    if (epoch.current !== myEpoch) return false;
    if (texReady) tex = await texReady;
    if (epoch.current !== myEpoch || !tex) return false;
    try {
      await captureInto(device, viewRef, tex);
    } catch {
      if (epoch.current === myEpoch) {
        busy.current = false;
        setRun("idle");
      }
      return false;
    }
    if (epoch.current !== myEpoch) return false;
    startPhase(sticky);
    setRun("running");
    return true;
  };

  const resume = () => {
    if (run !== "paused") return;
    paused.value = false;
    setRun("running");
  };

  const pause = () => {
    if (run !== "running") return;
    paused.value = true;
    setRun("paused");
  };

  // The scrub already cleared `paused` on the UI thread; follow it in state.
  const onScrubEnd = () => setRun((r) => (r === "paused" ? "running" : r));

  // The tile change rebuilds the scene (setTile → useMemo dep). While a run is
  // active `phase` still holds its non-zero id and the new scene starts with
  // lastPhase = -1, so its first frame starts a run on the same texture by
  // itself; busy just covers that frame until onStarted clears it.
  const pickTile = (next: number) => {
    if (next === tile) return;
    if (active) {
      busy.current = true;
      paused.value = false;
      seekTarget.value = -1;
      setRun("running");
    }
    setTile(next);
  };

  const toggleSticky = () => {
    const next = !sticky;
    setSticky(next);
    if (active && !busy.current) {
      startPhase(next);
      setRun("running");
    }
  };

  return {
    run,
    show,
    hasScene: scene !== null,
    canvasRef,
    viewRef,
    onLayout,
    speed,
    progress,
    paused,
    seekTarget,
    tile,
    sticky,
    actions: { release, pause, resume, reset, pickTile, toggleSticky, onScrubEnd },
  };
};
