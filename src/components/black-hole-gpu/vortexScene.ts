import tgpu from "typegpu";
import * as d from "typegpu/data";
import { scheduleOnRN } from "react-native-worklets";
import type {
  SceneProps,
  SceneResult,
} from "../gargantua-type-gpu/hooks/useWebGPU";
import { Params, Particle, type ParamsData } from "./gpuTypes";
import { computeLayout, renderLayout } from "./layouts";
import { bgFs, bgVs, initFn, stepFn, tileFs, tileVs } from "./vortexShaders";

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
  /** View snapshot, created on the same device the scene renders on. */
  snapshot: GPUTexture;
  config?: VortexConfig;
  /** Called after setup has drawn and presented the first frame (all tiles at home). */
  onReady?: () => void;
  /** Called every `STATS_EVERY` frames on the JS thread (via scheduleOnRN). */
  onStats?: (stats: VortexStats) => void;
};

type Spring = { x: number; v: number };

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_VORTEX: VortexConfig = {
  tile: 4,
  holeT0: 0.6,
  vortexT0: 1.4,
  ramp: 0.6,
  inflow: 0.15,
  refRadius: 0.5,
  horizon: 0.06,
  wave: 0.25,
  drag: 3,
  swirl: 1.6,
};

const H = 1 / 120;
const MAX_SUBSTEPS = 8;
const WORKGROUP = 64;
const STATS_EVERY = 30;

// Shatter settles fast with no overshoot; the hole overshoots once.
const SHATTER_SPRING = { k: 140, d: 24 };
const HOLE_SPRING = { k: 70, d: 9 };

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
 * Scene factory for `useWebGPU`: the GPU vortex for one snapshot.
 *
 * Setup allocates everything through a TypeGPU root (so the resources can
 * later cross to the UI runtime), seeds the particles, then draws and presents
 * the first frame before `onReady` so the RN view can be hidden without a
 * blank frame. `render` steps the timeline springs, writes the uniform and
 * encodes compute + render in one submit.
 *
 * The render loop may run on the UI runtime (ui-worklet mode), so `render` is a
 * worklet and everything it captures is TypeGPU resources, native GPU objects
 * and plain numbers/objects.
 */
export const createVortexScene =
  ({ snapshot, config = DEFAULT_VORTEX, onReady, onStats }: VortexSceneOptions) =>
  ({ device, context, presentationFormat }: SceneProps): SceneResult => {
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
      shatter: 0,
      vortexT0: config.vortexT0,
      ramp: config.ramp,
      _pad0: 0,
      _pad1: 0,
    };

    const paramBuffer = root.createBuffer(Params, initial).$usage("uniform");
    const particleBuffer = root
      .createBuffer(d.arrayOf(Particle, count))
      .$usage("storage");

    const initPipeline = root.createComputePipeline({ compute: initFn });
    const stepPipeline = root.createComputePipeline({ compute: stepFn });
    // Clears the frame: no blend.
    const bgPipeline = root.createRenderPipeline({
      vertex: bgVs,
      fragment: bgFs,
      targets: { format: presentationFormat },
      primitive: { topology: "triangle-list" },
    });
    // Composites tiles over the bg pass.
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
    const shatter: Spring = { x: 0, v: 0 };
    const hole: Spring = { x: 0, v: 0 };
    let frames = 0;
    let encodeMs = 0;
    let statsStart = 0;

    /** Advance the sim by `dt` seconds and encode one frame. Returns encode ms. */
    const frame = (dt: number) => {
      "worklet";
      const t0 = performance.now();
      // Fixed-step accumulator: equal work per simulated second, clamped so a
      // stall never spirals.
      acc += Math.min(dt, 0.25);
      const substeps = Math.min(Math.floor(acc / H), MAX_SUBSTEPS);
      acc = substeps === MAX_SUBSTEPS ? 0 : acc - substeps * H;
      const time = simTime;

      // Timeline springs, stepped with the physics so they share its clock.
      for (let i = 0; i < substeps; i++) {
        const t = simTime + (i + 1) * H;
        stepSpring(shatter, 1, SHATTER_SPRING.k, SHATTER_SPRING.d, H);
        stepSpring(hole, t >= config.holeT0 ? 1 : 0, HOLE_SPRING.k, HOLE_SPRING.d, H);
      }
      simTime += substeps * H;
      paramBuffer.writePartial({
        time,
        substeps,
        hole: hole.x,
        shatter: shatter.x,
      });

      const encoder = device.createCommandEncoder();
      if (substeps > 0) {
        const cpass = encoder.beginComputePass();
        stepPipeline.with(cpass).with(computeGroup).dispatchWorkgroups(groups);
        cpass.end();
      }
      const rpass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: [0, 0, 0, 1],
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      bgPipeline.with(rpass).with(renderGroup).draw(3);
      tilePipeline.with(rpass).with(renderGroup).draw(6, count);
      rpass.end();
      device.queue.submit([encoder.finish()]);
      return performance.now() - t0;
    };

    // Seed every tile at home (writes the full initial uniform first).
    initPipeline.with(computeGroup).dispatchWorkgroups(groups);

    // First frame (dt = 0) shows every tile at home; only then may the RN
    // view hide.
    frame(0);
    // SceneProps types the context as the web GPUCanvasContext; on RN it is
    // react-native-webgpu's context, which adds `present()`.
    (context as GPUCanvasContext & { present: () => void }).present();
    onReady?.();

    return {
      // Runs on the UI runtime in ui-worklet mode; a worklet is still a plain
      // callable in js-raf.
      render: (timestamp: number) => {
        "worklet";
        const dt = last === 0 ? 0 : (timestamp - last) / 1000;
        last = timestamp;
        encodeMs += frame(dt);
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
      },
      cleanup: () => {
        paramBuffer.destroy();
        particleBuffer.destroy();
        root.destroy();
      },
    };
  };
