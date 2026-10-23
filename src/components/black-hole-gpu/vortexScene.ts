import tgpu from "typegpu";
import * as d from "typegpu/data";
import { scheduleOnRN } from "react-native-worklets";
import type { SharedValue } from "react-native-reanimated";
import type {
  LayerSceneResult,
  SceneProps,
} from "../gargantua-type-gpu/composeLayered";
import { Params, Particle, type ParamsData } from "./gpuTypes";
import { computeLayout, renderLayout } from "./layouts";
import type { LensShared } from "./lensScene";
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
  /** Snapshot texture (owned by the caller, filled by captureInto on Release). Same device. */
  snapshot: GPUTexture;
  config?: VortexConfig;
  /** Sim speed multiplier, read every frame (clamped to SPEED_MIN..SPEED_MAX). */
  speed: SharedValue<number>;
  /** 0 = idle (no draw); a new non-zero value starts a run (sim reset + particle init). */
  phase: SharedValue<number>;
  /** Stickiness seed for the next run, read when a run starts. */
  seed: SharedValue<number>;
  /** Max sticky delay (s) for the next run, 0 = off; read when a run starts. */
  sticky: SharedValue<number>;
  /** Handoff to the lens layer: setup stores the root and Params buffer here. */
  shared: LensShared;
  /** A run's first frame has been presented (tiles at home). JS thread. */
  onStarted?: () => void;
  /** Called every `STATS_EVERY` frames on the JS thread (via scheduleOnRN). */
  onStats?: (stats: VortexStats) => void;
};

type Spring = { x: number; v: number };

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_VORTEX: VortexConfig = {
  tile: 4,
  holeT0: 0,
  vortexT0: 0.6,
  ramp: 0.6,
  inflow: 0.15,
  refRadius: 0.5,
  horizon: 0.06,
  wave: 0.25,
  drag: 3,
  swirl: 1.6,
  sticky: 1.6,
  patch: 0.06,
};

const H = 1 / 120;
/** Cap at 1x speed; scaled up with the speed multiplier in `frame`. */
const MAX_SUBSTEPS = 8;
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
const WORKGROUP = 64;
const STATS_EVERY = 30;

// The hole grows in from Release and overshoots once.
const HOLE_SPRING = { k: 70, d: 9 };

// Space color the tile pass clears to (the lens layer samples it as backdrop).
const SPACE_COLOR = [0.035, 0.035, 0.045, 1] as const;

// Alpha-over for the premultiplied snapshot texels.
const PREMULTIPLIED_OVER: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
};

// ============================================================================
// Helpers
// ============================================================================

/** Semi-implicit damped spring toward `target`, stepped by `h`. */
const stepSpring = (s: Spring, target: number, k: number, d: number, h: number) => {
  "worklet";
  s.v += (k * (target - s.x) - d * s.v) * h;
  s.x += s.v * h;
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
 * texture before flipping `phase`; `render` steps the timeline springs, writes
 * the uniform and encodes compute + render in one submit.
 *
 * The render loop may run on the UI runtime (ui-worklet mode), so `render` is a
 * worklet and everything it captures is TypeGPU resources, native GPU objects,
 * SharedValues and plain numbers/objects.
 *
 * `speed` is a SharedValue read once per frame; `seed` and `sticky` are read
 * when a run starts. None of them rebuilds the scene.
 */
export const createVortexScene =
  ({
    snapshot,
    config = DEFAULT_VORTEX,
    speed,
    phase,
    seed,
    sticky,
    shared,
    onStarted,
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
      center: d.vec2f(W / 2, Hpx / 2),
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
    };

    const paramBuffer = root.createBuffer(Params, initial).$usage("uniform");
    const particleBuffer = root
      .createBuffer(d.arrayOf(Particle, count))
      .$usage("storage");

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
    });
    const renderGroup = root.createBindGroup(renderLayout, {
      u: paramBuffer,
      ps: particleBuffer,
      snap: snapshot.createView(),
    });

    // ---- Timeline + stats state (read and written only by render) ----------
    let simTime = 0;
    let acc = 0;
    let last = 0;
    const hole: Spring = { x: 0, v: 0 };
    let frames = 0;
    let encodeMs = 0;
    let statsStart = 0;
    // Last phase value seen; -1 so a scene built mid-run starts it at once.
    let lastPhase = -1;

    /**
     * Advance the sim by `dt` seconds and encode one frame. Returns encode ms.
     * `start` begins a run: resets the clock and springs, writes the run's
     * seed/sticky and seeds every tile at home before drawing (no sim steps).
     */
    const frame = (
      view: GPUTextureView,
      dt: number,
      timeScale: number,
      start: boolean,
      startSeed: number,
      startSticky: number,
    ) => {
      "worklet";
      const t0 = performance.now();
      if (start) {
        simTime = 0;
        acc = 0;
        hole.x = 0;
        hole.v = 0;
        paramBuffer.writePartial({
          time: 0,
          substeps: 0,
          hole: 0,
          seed: startSeed,
          sticky: startSticky,
        });
      }
      // Fixed-step accumulator: equal work per simulated second, clamped so a
      // stall never spirals. Speed scales sim time per real second; the
      // substep cap scales with it so 4x doesn't fall behind. Springs run on
      // sim time, so the whole timeline speeds up together.
      let substeps = 0;
      if (!start) {
        acc += Math.min(dt, 0.25) * timeScale;
        const maxSub = Math.ceil(MAX_SUBSTEPS * Math.max(1, timeScale));
        substeps = Math.min(Math.floor(acc / H), maxSub);
        acc = substeps === maxSub ? 0 : acc - substeps * H;
        const time = simTime;

        // Timeline springs, stepped with the physics so they share its clock.
        for (let i = 0; i < substeps; i++) {
          const t = simTime + (i + 1) * H;
          stepSpring(hole, t >= config.holeT0 ? 1 : 0, HOLE_SPRING.k, HOLE_SPRING.d, H);
        }
        simTime += substeps * H;
        paramBuffer.writePartial({
          time,
          substeps,
          hole: hole.x,
        });
      }

      const encoder = device.createCommandEncoder();
      if (start) {
        // Queue writes land before this submit, so init sees the new uniform.
        const ipass = encoder.beginComputePass();
        initPipeline.with(ipass).with(computeGroup).dispatchWorkgroups(groups);
        ipass.end();
      }
      if (substeps > 0) {
        const cpass = encoder.beginComputePass();
        stepPipeline.with(cpass).with(computeGroup).dispatchWorkgroups(groups);
        cpass.end();
      }
      const rpass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: [...SPACE_COLOR],
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      tilePipeline.with(rpass).with(renderGroup).draw(6, count);
      rpass.end();
      device.queue.submit([encoder.finish()]);
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
            hole.x = 0;
            hole.v = 0;
            paramBuffer.writePartial({ hole: 0 });
            clearFrame(attachment.view);
            return true;
          }
          // Run start: tiles at home, dt = 0.
          const timeScale = Math.min(Math.max(speed.value, SPEED_MIN), SPEED_MAX);
          frame(attachment.view, 0, timeScale, true, seed.value, sticky.value);
          if (onStarted) scheduleOnRN(onStarted);
          return true;
        }
        if (p === 0) return false;
        const dt = last === 0 ? 0 : (timestamp - last) / 1000;
        last = timestamp;
        // Clamp in the worklet, before the sim sees the value.
        const timeScale = Math.min(Math.max(speed.value, SPEED_MIN), SPEED_MAX);
        encodeMs += frame(attachment.view, dt, timeScale, false, 0, 0);
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
        root.destroy();
      },
    };
  };
