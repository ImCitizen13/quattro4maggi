import { COMPUTE_WGSL, RENDER_WGSL } from "./vortexShaders";

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

export type VortexScene = {
  /** Particle count for the current tile size. */
  count: number;
  /** Advance the sim by `dt` seconds and draw one frame. Returns encode ms. */
  frame: (dt: number) => number;
  /** Re-seed every tile at home and restart the timeline. */
  reset: () => void;
  destroy: () => void;
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
// Params struct: 3 × vec2f + 18 × f32 = 24 floats (96 B).
const PARAM_FLOATS = 24;
const P = { time: 8, substeps: 10, hole: 18, shatter: 19 } as const;

// Shatter settles fast with no overshoot; the hole overshoots once.
const SHATTER_SPRING = { k: 140, d: 24 };
const HOLE_SPRING = { k: 70, d: 9 };

// ============================================================================
// Helpers
// ============================================================================

/** Semi-implicit damped spring toward `target`, stepped by `h`. */
const stepSpring = (s: Spring, target: number, k: number, d: number, h: number) => {
  s.v += (k * (target - s.x) - d * s.v) * h;
  s.x += s.v * h;
};

// ============================================================================
// Scene
// ============================================================================

/**
 * Builds the GPU vortex for one snapshot. Everything is allocated here; `frame`
 * steps the timeline springs, writes the 96 B uniform and encodes compute +
 * render.
 */
export const createVortexScene = (
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat,
  snapshot: GPUTexture,
  config: VortexConfig = DEFAULT_VORTEX,
): VortexScene => {
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
  const flow = short * config.inflow * rRef;
  const horizon = short * config.horizon;

  const params = new Float32Array(PARAM_FLOATS);
  params.set([
    W, Hpx, // res
    W / 2, Hpx / 2, // center
    W, Hpx, // texSize
    config.tile,
    cols,
    0, // time
    H,
    0, // substeps
    flow,
    horizon * 0.5, // eps
    config.drag,
    horizon,
    short * config.wave,
    config.swirl,
    count,
    0, // hole
    0, // shatter
    config.vortexT0,
    config.ramp,
    0,
    0,
  ]);

  const paramBuffer = device.createBuffer({
    size: PARAM_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const particleBuffer = device.createBuffer({
    size: count * 32,
    usage: GPUBufferUsage.STORAGE,
  });

  const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });

  const initPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "init" },
  });
  const stepPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "step" },
  });
  const bgPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "bgVs" },
    fragment: { module: renderModule, entryPoint: "bgFs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const tilePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "tileVs" },
    fragment: {
      module: renderModule,
      entryPoint: "tileFs",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const computeEntries = [
    { binding: 0, resource: { buffer: paramBuffer } },
    { binding: 1, resource: { buffer: particleBuffer } },
  ];
  const initGroup = device.createBindGroup({
    layout: initPipeline.getBindGroupLayout(0),
    entries: computeEntries,
  });
  const stepGroup = device.createBindGroup({
    layout: stepPipeline.getBindGroupLayout(0),
    entries: computeEntries,
  });
  // bgFs only uses the uniform, so its auto layout has binding 0 alone.
  const bgGroup = device.createBindGroup({
    layout: bgPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: paramBuffer } }],
  });
  const tileGroup = device.createBindGroup({
    layout: tilePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramBuffer } },
      { binding: 1, resource: { buffer: particleBuffer } },
      { binding: 2, resource: snapshot.createView() },
    ],
  });

  let simTime = 0;
  let acc = 0;
  const shatter: Spring = { x: 0, v: 0 };
  const hole: Spring = { x: 0, v: 0 };

  const reset = () => {
    simTime = 0;
    acc = 0;
    shatter.x = shatter.v = 0;
    hole.x = hole.v = 0;
    params[P.time] = 0;
    params[P.substeps] = 0;
    params[P.hole] = 0;
    params[P.shatter] = 0;
    device.queue.writeBuffer(paramBuffer, 0, params);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(initPipeline);
    pass.setBindGroup(0, initGroup);
    pass.dispatchWorkgroups(groups);
    pass.end();
    device.queue.submit([encoder.finish()]);
  };

  const frame = (dt: number) => {
    const t0 = performance.now();
    // Fixed-step accumulator: equal work per simulated second, clamped so a
    // stall never spirals.
    acc += Math.min(dt, 0.25);
    const substeps = Math.min(Math.floor(acc / H), MAX_SUBSTEPS);
    acc = substeps === MAX_SUBSTEPS ? 0 : acc - substeps * H;
    params[P.time] = simTime;
    params[P.substeps] = substeps;

    // Timeline springs, stepped with the physics so they share its clock.
    for (let i = 0; i < substeps; i++) {
      const t = simTime + (i + 1) * H;
      stepSpring(shatter, 1, SHATTER_SPRING.k, SHATTER_SPRING.d, H);
      stepSpring(hole, t >= config.holeT0 ? 1 : 0, HOLE_SPRING.k, HOLE_SPRING.d, H);
    }
    simTime += substeps * H;
    params[P.hole] = hole.x;
    params[P.shatter] = shatter.x;
    device.queue.writeBuffer(paramBuffer, 0, params);

    const encoder = device.createCommandEncoder();
    if (substeps > 0) {
      const cpass = encoder.beginComputePass();
      cpass.setPipeline(stepPipeline);
      cpass.setBindGroup(0, stepGroup);
      cpass.dispatchWorkgroups(groups);
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
    rpass.setPipeline(bgPipeline);
    rpass.setBindGroup(0, bgGroup);
    rpass.draw(3);
    rpass.setPipeline(tilePipeline);
    rpass.setBindGroup(0, tileGroup);
    rpass.draw(6, count);
    rpass.end();
    device.queue.submit([encoder.finish()]);
    return performance.now() - t0;
  };

  reset();

  return {
    count,
    frame,
    reset,
    destroy: () => {
      paramBuffer.destroy();
      particleBuffer.destroy();
    },
  };
};
