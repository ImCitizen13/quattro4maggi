import tgpu from "typegpu";
import * as d from "typegpu/data";
// Named import for the `frame` worklet: a namespace (`d.*`) captured by a
// worklet does not cross runtimes.
import { vec2f } from "typegpu/data";
import { scheduleOnRN } from "react-native-worklets";
import type { SharedValue } from "react-native-reanimated";
import type {
  LayerSceneResult,
  SceneProps,
} from "../gargantua-type-gpu/composeLayered";
import { Params, Particle, type ParamsData } from "./gpuTypes";
import { computeLayout, renderLayout } from "./layouts";
import type { LensShared } from "./lensScene";
import {
  CHASE_AHEAD,
  DEFAULT_CENTER,
  DEFAULT_VORTEX,
  H,
  HOLE_SPRING,
  KEYFRAME_BYTES,
  MAX_SEEK_STEPS,
  MAX_SLOTS,
  MAX_STEPS,
  MAX_SUBSTEPS,
  MIN_KEY_INTERVAL,
  MIN_SEEK_STEPS,
  MIN_SLOTS,
  RELEASE_JITTER,
  SEEK_BUDGET,
  SPEED_MAX,
  SPEED_MIN,
  STATS_EVERY,
  STICKY_RAMP,
  TRANSPARENT,
  WORKGROUP,
} from "./vortexConstants";
import { initFn, stepFn, tileFs, tileVs } from "./vortexShaders";

// ============================================================================
// Types
// ============================================================================

export type VortexConfig = {
  /** Tile edge in physical px. */
  tile: number;
  /** When the hole starts growing in, s after Release. */
  holeT0: number;
  /** When the radial release wave starts, s after Release. */
  vortexT0: number;
  /** Per-tile force ramp after release, s. */
  ramp: number;
  /** Inflow speed at `refRadius`, fraction of the shorter side per second. */
  inflow: number;
  /** Radius `inflow` is measured at, fraction of the shorter side. */
  refRadius: number;
  /** Event horizon radius, fraction of the shorter side. */
  horizon: number;
  /** Release wave speed, fraction of the shorter side per second. */
  wave: number;
  /** Velocity relaxation toward the flow (1/s): lower = more inertia. */
  drag: number;
  /** Tangential / inflow speed: higher = more winding per turn inward. */
  swirl: number;
  /** Max extra release delay for fully sticky tiles, s. */
  sticky: number;
  /** Sticky patch cell size, fraction of the shorter side. */
  patch: number;
};

/** Rolling render stats reported to the HUD. */
export type VortexStats = {
  /** Tile (particle) count. */
  count: number;
  /** Frames per second over the last `STATS_EVERY` frames. */
  fps: number;
  /** Mean CPU encode + submit time per frame, ms. */
  encodeMs: number;
};

export type VortexSceneOptions = {
  /**
   * Source texture (owned by the caller, never destroyed here): the captured
   * snapshot, or a caller texture (see VortexSource). Same device. The stage
   * size is its width/height.
   */
  snapshot: GPUTexture;
  config?: VortexConfig;
  /** Hole center as a 0..1 fraction of the snapshot. Default { x: 0.5, y: 0.5 }. */
  center?: { x: number; y: number };
  /**
   * Per-run hole center (0..1 fraction), read when a run starts; x < 0 = use
   * `center`. Lets each run start where the user touched.
   */
  origin?: SharedValue<{ x: number; y: number }>;
  /**
   * Premultiplied RGBA the tile pass clears to (behind the tiles; the lens
   * reads it as backdrop). Default transparent; the demo passes SPACE_COLOR.
   */
  clearColor?: readonly [number, number, number, number];
  /** Sim speed multiplier, read every frame (clamped to SPEED_MIN..SPEED_MAX). */
  speed: SharedValue<number>;
  /** 0 = idle (no draw); a new non-zero value starts a run (sim reset + particle init). */
  phase: SharedValue<number>;
  /** Stickiness seed for the next run, read when a run starts. */
  seed: SharedValue<number>;
  /** Max sticky delay (s) for the next run, 0 = off; read when a run starts. */
  sticky: SharedValue<number>;
  /**
   * 0..1 fraction of tiles swallowed at the displayed step. Written by the
   * render worklet every frame (0 when idle).
   */
  progress: SharedValue<number>;
  /** True freezes the sim (no steps); frames are still drawn. */
  paused: SharedValue<boolean>;
  /**
   * -1 = none, else 0..1 progress to seek to. While >= 0 the run does not
   * advance by time (paused is ignored): it restores a keyframe and replays
   * toward the step that had that fraction swallowed. A release before the
   * seek has landed (a tap) lets it finish, then live stepping resumes.
   * Omitted = no seeking.
   */
  seekTarget?: SharedValue<number>;
  /** Handoff to the lens layer: setup stores the root and Params buffer here. */
  shared: LensShared;
  /** A run's first frame has been presented (tiles at home). JS thread. */
  onStarted?: () => void;
  /**
   * The run's done flag flipped (every tile swallowed / no longer). JS thread,
   * via scheduleOnRN. Fires after the GPU histogram readback learns the end
   * step, a few frames late.
   */
  onDone?: (done: boolean) => void;
  /** Called every `STATS_EVERY` frames on the JS thread (via scheduleOnRN). */
  onStats?: (stats: VortexStats) => void;
};

/**
 * All mutable run state, owned by the `frame` worklet (the one UI-runtime copy
 * that reads and writes it). Steps are absolute indices on the h = 1/120 clock.
 */
type RunState = {
  /** Fixed-step accumulator remainder, s of sim time. */
  acc: number;
  /** Displayed step. */
  step: number;
  /** Highest step simulated this run. */
  frontier: number;
  /** `cum` is valid for steps 0..known (read back from the GPU histogram). */
  known: number;
  /** First step where every tile is swallowed, -1 until read back. */
  doneStep: number;
  /** Bumped at each run start; a readback from an older run is dropped. */
  runGen: number;
  /** A staging-buffer map is in flight. */
  mapPending: boolean;
  /** Last done flag reported through onDone. */
  lastDone: boolean;
  /** Cumulative tiles swallowed per step, [0] = 0. Allocated on the UI runtime. */
  cum: Uint32Array | null;
  /** Keyframe slot j holds the particle state at step kfStep[j]; -1 = empty. */
  kfStep: number[];
  /** Seek fraction not reached yet when the seek was released, else -1. */
  pending: number;
};

// ============================================================================
// Constants
// ============================================================================

/** Highest step the sim advances to; later deaths would share the last bin. */
const LAST_STEP = MAX_STEPS - 1;

// The hole grows in from Release and overshoots once: the exact step response
// of an underdamped spring {k, d}, evaluated in closed form on both sides
// (holeAt in vortexShaders, holeAtCpu below), so the hole is a pure function
// of sim time.
const HOLE_DECAY = HOLE_SPRING.d / 2;
const HOLE_FREQ = Math.sqrt(HOLE_SPRING.k - HOLE_DECAY * HOLE_DECAY);

// Alpha-over for the premultiplied snapshot texels.
const PREMULTIPLIED_OVER: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
};

// ============================================================================
// Helpers
// ============================================================================

/** CPU copy of the shader's holeAt: spring step response at sim time `t`. */
const holeAtCpu = (t: number, t0: number, decay: number, freq: number) => {
  "worklet";
  const tau = t - t0;
  if (tau <= 0) return 0;
  return (
    1 -
    Math.exp(-decay * tau) *
      (Math.cos(freq * tau) + (decay / freq) * Math.sin(freq * tau))
  );
};

// ============================================================================
// Scene
// ============================================================================

/**
 * Layer scene (first layer of `composeLayered`): the GPU vortex for one
 * snapshot texture. It renders the tiles over the space color into the
 * composer's target; the lens layer after it (`createLensScene`, readsBackdrop)
 * draws the hole, glow and lensing from that. Setup publishes its root and
 * Params buffer through `shared` for the lens, so this layer must be listed
 * first and owns (and destroys) both.
 *
 * Setup allocates everything through a TypeGPU root (so the resources can
 * later cross to the UI runtime) and then stands by: it draws nothing and
 * presents nothing. The `phase` SharedValue drives the run from the UI loop:
 * a new non-zero value starts a run (sim reset, particles seeded at home, first
 * frame drawn, `onStarted`), 0 goes idle (one transparent frame, then `render`
 * returns false, which the composer turns into a skipped lens + present). The caller fills the snapshot
 * texture before flipping `phase`; `render` advances the step clock, writes
 * the uniform and encodes compute + render in one submit.
 *
 * The sim is a deterministic function of an integer step index (h = 1/120 s):
 * the accumulator only decides how many steps a frame runs, and the shader
 * derives time and the hole spring from the absolute index. A GPU histogram
 * counts the tiles swallowed at each step; a throttled readback (one staging
 * map in flight) turns it into a cumulative table, which gives the `progress`
 * SharedValue and the step where the run is done. `paused` adds no steps (the
 * frames are still drawn); a finished run stops stepping too.
 *
 * Seeking: the particle buffer is copied GPU-side into one of S keyframe slots
 * about every K steps (slot j = first frame at or past (j + 1) * K; step 0 is
 * `init` again). While `seekTarget` >= 0 the frame picks the target step from
 * the cumulative table (still unread = chase forward to the end), restores the
 * nearest keyframe (before the target when going back, or a later one that
 * skips ahead) and replays up to a per-frame budget in ONE step dispatch.
 * Steps behind the frontier don't touch the histogram (recordFrom), so replays
 * never double count.
 *
 * The render loop may run on the UI runtime (ui-worklet mode), so `render` is a
 * worklet and everything it captures is TypeGPU resources, native GPU objects,
 * SharedValues and plain numbers/objects.
 *
 * `speed` and `paused` are SharedValues read once per frame; `seed` and
 * `sticky` are read when a run starts. None of them rebuilds the scene.
 */
export const createVortexScene =
  ({
    snapshot,
    config = DEFAULT_VORTEX,
    center = DEFAULT_CENTER,
    origin,
    clearColor = TRANSPARENT,
    speed,
    phase,
    seed,
    sticky,
    progress,
    paused,
    seekTarget,
    shared,
    onStarted,
    onDone,
    onStats,
  }: VortexSceneOptions) =>
  ({ device, presentationFormat }: SceneProps): LayerSceneResult => {
    const root = tgpu.initFromDevice({ device });

    const W = snapshot.width;
    const Hpx = snapshot.height;
    const short = Math.min(W, Hpx);
    const cols = Math.ceil(W / config.tile);
    const rows = Math.ceil(Hpx / config.tile);
    const count = cols * rows;
    const groups = Math.ceil(count / WORKGROUP);

    // Inflow speed c/r equals `inflow` at the reference radius. A tile at r0
    // reaches the center after r0² / 2c.
    const rRef = short * config.refRadius;
    const horizon = short * config.horizon;
    const initial: ParamsData = {
      res: d.vec2f(W, Hpx),
      center: d.vec2f(W * center.x, Hpx * center.y),
      texSize: d.vec2f(W, Hpx),
      tile: config.tile,
      cols,
      time: 0,
      h: H,
      substeps: 0,
      flow: short * config.inflow * rRef,
      eps: horizon * 0.5,
      drag: config.drag,
      horizon,
      wave: short * config.wave,
      swirl: config.swirl,
      count,
      hole: 0,
      patchPx: short * config.patch,
      vortexT0: config.vortexT0,
      ramp: config.ramp,
      // Written per run (see `frame` with start).
      seed: 0,
      sticky: 0,
      step0: 0,
      recordFrom: 0,
      holeT0: config.holeT0,
      holeDecay: HOLE_DECAY,
      holeFreq: HOLE_FREQ,
    };

    const paramBuffer = root.createBuffer(Params, initial).$usage("uniform");
    const particleBuffer = root
      .createBuffer(d.arrayOf(Particle, count))
      .$usage("storage");
    // Tiles swallowed per step index (atomic counters), cleared at run start.
    const deathsBuffer = root
      .createBuffer(d.arrayOf(d.atomic(d.u32), MAX_STEPS))
      .$usage("storage");
    const rawDeaths = root.unwrap(deathsBuffer);
    const rawParticles = root.unwrap(particleBuffer);

    // Keyframes: S slots of one particle-buffer copy each (GPU-side copies).
    // K spaces them so S of them cover an upper estimate of the run length:
    // the latest release (start + wave to the far corner + jitter + sticky +
    // slowest ramp), plus the fall from the far corner, plus drag lag.
    const bytes = count * d.sizeOf(Particle);
    const slots = Math.min(
      MAX_SLOTS,
      Math.max(MIN_SLOTS, Math.floor(KEYFRAME_BYTES / bytes)),
    );
    const rMax = Math.hypot(W, Hpx) / 2;
    const estSeconds =
      config.vortexT0 +
      rMax / (short * config.wave) +
      RELEASE_JITTER +
      config.sticky +
      (1 + STICKY_RAMP) * config.ramp +
      (rMax * rMax) / (2 * initial.flow) +
      2 / config.drag;
    const estSteps = Math.min(LAST_STEP, Math.ceil(estSeconds / H));
    const keyEvery = Math.max(MIN_KEY_INTERVAL, Math.ceil(estSteps / slots));
    const maxSeek = Math.min(
      MAX_SEEK_STEPS,
      Math.max(MIN_SEEK_STEPS, Math.floor(SEEK_BUDGET / count)),
    );
    const keys = device.createBuffer({
      size: slots * bytes,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    // Readback target: GPUBufferUsage.MAP_READ (1) | COPY_DST (8).
    const staging = device.createBuffer({
      size: MAX_STEPS * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const initPipeline = root.createComputePipeline({ compute: initFn });
    const stepPipeline = root.createComputePipeline({ compute: stepFn });
    // Hand the lens layer what it shares (it never destroys either).
    shared.root = root;
    shared.params = paramBuffer;
    // Composites tiles over the cleared space color.
    const tilePipeline = root.createRenderPipeline({
      vertex: tileVs,
      fragment: tileFs,
      targets: { format: presentationFormat, blend: PREMULTIPLIED_OVER },
      primitive: { topology: "triangle-list" },
    });

    // All bind groups are built here, once: they transfer with the pipelines.
    const computeGroup = root.createBindGroup(computeLayout, {
      u: paramBuffer,
      ps: particleBuffer,
      deaths: deathsBuffer,
    });
    const renderGroup = root.createBindGroup(renderLayout, {
      u: paramBuffer,
      ps: particleBuffer,
      snap: snapshot.createView(),
    });

    // ---- Run state: read and written only by `frame` ------------------------
    const run: RunState = {
      acc: 0,
      step: 0,
      frontier: 0,
      known: 0,
      doneStep: -1,
      runGen: 0,
      mapPending: false,
      lastDone: false,
      cum: null,
      kfStep: Array.from({ length: slots }, () => -1),
      pending: -1,
    };

    // ---- Stats state (read and written only by render) ----------------------
    let last = 0;
    let frames = 0;
    let encodeMs = 0;
    let statsStart = 0;
    // Last phase value seen; -1 so a scene built mid-run starts it at once.
    let lastPhase = -1;

    /**
     * Advance the sim by `dt` seconds (or seek, see below) and encode one
     * frame. Returns encode ms. `start` begins a run: resets the step state,
     * keyframes and the death histogram, writes the run's seed/sticky and seeds
     * every tile at home before drawing (no sim steps). Also publishes
     * `progress` and the done flag.
     *
     * While `seekTarget` >= 0 the frame ignores dt/paused: it picks the target
     * step, restores a keyframe (or re-inits) when that is nearer than stepping
     * on from here, and replays at most `maxSeek` steps in one dispatch; later
     * frames keep going until the target is reached. Encoder order: [start
     * clear + init] [restore copy or init] [step pass] [keyframe copy]
     * [readback copy] [render].
     */
    const frame = (
      view: GPUTextureView,
      dt: number,
      timeScale: number,
      start: boolean,
      startSeed: number,
      startSticky: number,
      startCx: number,
      startCy: number,
    ) => {
      "worklet";
      const t0 = performance.now();
      // Allocated here, not in setup: a typed array may not cross runtimes.
      const cum = run.cum ?? (run.cum = new Uint32Array(MAX_STEPS + 1));
      if (start) {
        run.acc = 0;
        run.step = 0;
        run.frontier = 0;
        run.known = 0;
        run.doneStep = -1;
        run.pending = -1;
        for (let j = 0; j < run.kfStep.length; j++) run.kfStep[j] = -1;
        // A map from the previous run may still be in flight (mapPending stays
        // set until it settles); its result is dropped by the runGen check.
        run.runGen += 1;
        cum[0] = 0;
        if (run.lastDone) {
          run.lastDone = false;
          if (onDone) scheduleOnRN(onDone, false);
        }
        paramBuffer.writePartial({
          time: 0,
          substeps: 0,
          hole: 0,
          step0: 0,
          recordFrom: 1,
          seed: startSeed,
          sticky: startSticky,
          center: vec2f(startCx, startCy),
        });
      }
      // Fixed-step accumulator: equal work per simulated second, clamped so a
      // stall never spirals. Speed scales sim time per real second; the
      // substep cap scales with it so 4x doesn't fall behind. Paused or done
      // adds nothing (0 substeps), so resume has no catch-up burst. The hole
      // is a closed form of step time, so it speeds up with the rest.
      let substeps = 0;
      // Seek plan: -1 = keep the buffer, else the keyframe slot to restore;
      // `reinit` re-seeds the tiles at home (step 0) instead.
      let restoreSlot = -1;
      let reinit = false;
      if (!start) {
        // A released seek that has not landed yet (a tap is shorter than the
        // chase) keeps going from `pending` until it does.
        const held = seekTarget ? seekTarget.value : -1;
        const seekF = held >= 0 ? held : run.pending;
        if (seekF >= 0) {
          // Seek: pick the target step n*. A readable fraction maps to the
          // first step whose cumulative count reaches it; beyond what is read
          // back we chase toward the end (or the known done step) and the
          // overshoot is corrected once the exact step is read back.
          run.acc = 0;
          let target = 0;
          let resolved = true;
          if (seekF > 0) {
            const need = seekF * count;
            if (cum[run.known] >= need) {
              let lo = 0;
              let hi = run.known;
              while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (cum[mid] >= need) hi = mid;
                else lo = mid + 1;
              }
              target = lo;
            } else {
              target = run.doneStep >= 0 ? Math.min(run.doneStep, LAST_STEP) : LAST_STEP;
              // Don't outrun the readback by more than CHASE_AHEAD steps: the
              // fraction is only learned a few frames late, and a short tap
              // would otherwise overshoot into the tail.
              target = Math.max(run.step, Math.min(target, run.known + CHASE_AHEAD));
              resolved = false;
            }
          }
          // Nearest start: going back needs the latest keyframe at or before
          // the target; going on may jump to a later keyframe (no replay).
          let best = -1;
          let bestStep = 0;
          for (let j = 0; j < run.kfStep.length; j++) {
            const ks = run.kfStep[j];
            if (ks < 0 || ks > target) continue;
            if (target < run.step || ks > run.step) {
              if (ks > bestStep) {
                bestStep = ks;
                best = j;
              }
            }
          }
          if (best >= 0) {
            restoreSlot = best;
            run.step = bestStep;
          } else if (target < run.step) {
            reinit = true;
            run.step = 0;
          }
          substeps = Math.max(
            0,
            Math.min(target - run.step, maxSeek, LAST_STEP - run.step),
          );
          run.pending = resolved && run.step + substeps >= target ? -1 : seekF;
        } else {
          const finished = run.doneStep >= 0 && run.step >= run.doneStep;
          if (!paused.value && !finished) {
            run.acc += Math.min(dt, 0.25) * timeScale;
            const maxSub = Math.ceil(MAX_SUBSTEPS * Math.max(1, timeScale));
            substeps = Math.min(Math.floor(run.acc / H), maxSub);
            run.acc = substeps === maxSub ? 0 : run.acc - substeps * H;
            // Stay inside the histogram.
            substeps = Math.max(0, Math.min(substeps, LAST_STEP - run.step));
          }
        }
        const step0 = run.step;
        const newStep = step0 + substeps;
        // Steps up to the frontier were already recorded; only newer ones count.
        paramBuffer.writePartial({
          step0,
          substeps,
          recordFrom: run.frontier + 1,
          time: newStep * H,
          hole: holeAtCpu(newStep * H, config.holeT0, HOLE_DECAY, HOLE_FREQ),
        });
        run.step = newStep;
        run.frontier = Math.max(run.frontier, newStep);
      }

      const encoder = device.createCommandEncoder();
      if (start) {
        // Queue writes land before this submit, so init sees the new uniform.
        encoder.clearBuffer(rawDeaths);
        const ipass = encoder.beginComputePass();
        initPipeline.with(ipass).with(computeGroup).dispatchWorkgroups(groups);
        ipass.end();
      }
      if (reinit) {
        // Seek back to step 0: the run's seed/sticky are still in the uniform.
        const ipass = encoder.beginComputePass();
        initPipeline.with(ipass).with(computeGroup).dispatchWorkgroups(groups);
        ipass.end();
      } else if (restoreSlot >= 0) {
        encoder.copyBufferToBuffer(keys, restoreSlot * bytes, rawParticles, 0, bytes);
      }
      if (substeps > 0) {
        const cpass = encoder.beginComputePass();
        stepPipeline.with(cpass).with(computeGroup).dispatchWorkgroups(groups);
        cpass.end();
      }
      // Keyframe: slot j stores the first step at or past (j + 1) * keyEvery
      // (strictly after the previous slot's step, so no duplicates).
      if (!start) {
        let j = 0;
        while (j < run.kfStep.length && run.kfStep[j] >= 0) j++;
        if (
          j < run.kfStep.length &&
          (j + 1) * keyEvery <= run.step &&
          (j === 0 || run.step > run.kfStep[j - 1])
        ) {
          encoder.copyBufferToBuffer(rawParticles, 0, keys, j * bytes, bytes);
          run.kfStep[j] = run.step;
        }
      }
      // Readback: copy the histogram bins not yet known into the staging
      // buffer (same encoder, after the step pass). At most one map in flight.
      const from = run.known;
      const to = run.frontier;
      const copyBytes = (to - from) * 4;
      const readback = !run.mapPending && to > from;
      if (readback) {
        run.mapPending = true;
        encoder.copyBufferToBuffer(rawDeaths, (from + 1) * 4, staging, 0, copyBytes);
      }
      const rpass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: [...clearColor],
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      tilePipeline.with(rpass).with(renderGroup).draw(6, count);
      rpass.end();
      device.queue.submit([encoder.finish()]);

      if (readback) {
        const gen = run.runGen;
        // 1 = GPUMapMode.READ (the global may not exist on the UI runtime).
        staging
          .mapAsync(1, 0, copyBytes)
          .then(() => {
            try {
              if (gen === run.runGen) {
                const bins = new Uint32Array(staging.getMappedRange(0, copyBytes));
                let total = cum[from];
                for (let j = 0; j < bins.length; j++) {
                  total += bins[j];
                  cum[from + 1 + j] = total;
                  if (run.doneStep < 0 && total >= count) run.doneStep = from + 1 + j;
                }
                run.known = to;
              }
            } finally {
              staging.unmap();
              run.mapPending = false;
            }
          })
          .catch(() => {
            run.mapPending = false;
          });
      }

      // Publish progress at the displayed step (clamped to what is read back)
      // and report the done flag when it flips.
      const shown = Math.min(run.step, run.known);
      progress.value = cum[shown] / count;
      const done = run.doneStep >= 0 && run.step >= run.doneStep;
      if (done !== run.lastDone) {
        run.lastDone = done;
        if (onDone) scheduleOnRN(onDone, done);
      }
      return performance.now() - t0;
    };

    /** One transparent frame: keeps the layer's drawables cycling while idle. */
    const clearFrame = (view: GPUTextureView) => {
      "worklet";
      const encoder = device.createCommandEncoder();
      const rpass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: [0, 0, 0, 0],
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      rpass.end();
      device.queue.submit([encoder.finish()]);
    };

    // Standby: no init dispatch and no frame 0 here; the first non-zero phase
    // starts the run from the render loop.
    return {
      // Runs on the UI runtime in ui-worklet mode; a worklet is still a plain
      // callable in js-raf. Returns false when nothing was drawn (idle): the
      // composer then skips the lens and the blit.
      render: (timestamp, attachment, _backdrop) => {
        "worklet";
        const p = phase.value;
        if (p !== lastPhase) {
          lastPhase = p;
          last = 0;
          frames = 0;
          encodeMs = 0;
          statsStart = 0;
          if (p === 0) {
            // Idle: zero the hole so the lens passes the transparent frame
            // through, draw it once, then stop presenting.
            progress.value = 0;
            paramBuffer.writePartial({ hole: 0 });
            clearFrame(attachment.view);
            return true;
          }
          // Run start: tiles at home, dt = 0.
          const timeScale = Math.min(Math.max(speed.value, SPEED_MIN), SPEED_MAX);
          // Hole center for this run: the origin if set, else `center`.
          const o = origin ? origin.value : null;
          const fx = o && o.x >= 0 ? o.x : center.x;
          const fy = o && o.x >= 0 ? o.y : center.y;
          frame(
            attachment.view,
            0,
            timeScale,
            true,
            seed.value,
            sticky.value,
            W * Math.min(Math.max(fx, 0), 1),
            Hpx * Math.min(Math.max(fy, 0), 1),
          );
          if (onStarted) scheduleOnRN(onStarted);
          return true;
        }
        if (p === 0) return false;
        const dt = last === 0 ? 0 : (timestamp - last) / 1000;
        last = timestamp;
        // Clamp in the worklet, before the sim sees the value.
        const timeScale = Math.min(Math.max(speed.value, SPEED_MIN), SPEED_MAX);
        encodeMs += frame(attachment.view, dt, timeScale, false, 0, 0, 0, 0);
        frames += 1;
        if (statsStart === 0) statsStart = timestamp;
        if (frames === STATS_EVERY) {
          const fps = (frames * 1000) / (timestamp - statsStart);
          if (onStats) {
            scheduleOnRN(onStats, { count, fps, encodeMs: encodeMs / frames });
          }
          frames = 0;
          encodeMs = 0;
          statsStart = timestamp;
        }
        return true;
      },
      cleanup: () => {
        paramBuffer.destroy();
        particleBuffer.destroy();
        deathsBuffer.destroy();
        staging.destroy();
        keys.destroy();
        root.destroy();
      },
    };
  };
