import { COMPUTE_WGSL, RENDER_WGSL } from "./vortexShaders";

// ============================================================================
// Types
// ============================================================================

export type VortexConfig = {
  /** Tile edge in physical px. */
  tile: number;
  /** Seconds per orbit at `orbitRadius` (sets GM). */
  orbitPeriod: number;
  /** Fraction of the canvas' shorter side used to tune GM. */
  orbitRadius: number;
  /** Event horizon radius, fraction of the shorter side. */
  horizon: number;
  /** Release wave speed, fraction of the shorter side per second. */
  wave: number;
  /** Accretion drag (1/s): higher = faster inspiral. */
  drag: number;
  /** Tangential kick on release, fraction of circular speed. */
  swirl: number;
};

export type VortexScene = {
  /** Particle count for the current tile size. */
  count: number;
  /** Advance the sim by `dt` seconds and draw one frame. Returns encode ms. */
  frame: (dt: number) => number;
  /** Re-seed every tile at home and restart the wave. */
  reset: () => void;
  destroy: () => void;
};

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_VORTEX: VortexConfig = {
  tile: 4,
  orbitPeriod: 2.5,
  orbitRadius: 0.5,
  horizon: 0.06,
  wave: 0.45,
  drag: 0.35,
  swirl: 0.8,
};

const H = 1 / 120;
const MAX_SUBSTEPS = 8;
const WORKGROUP = 64;
// Params struct: 3 × vec2f + 14 × f32 = 20 floats (80 B).
const PARAM_FLOATS = 20;

// ============================================================================
// Scene
// ============================================================================

/**
 * Builds the GPU vortex for one snapshot. Everything is allocated here; `frame`
 * only writes the 80 B uniform and encodes compute + render.
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

  // GM from Kepler: T = 2π √(r³/GM).
  const rOrbit = short * config.orbitRadius;
  const gm = (4 * Math.PI ** 2 * rOrbit ** 3) / config.orbitPeriod ** 2;

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
    gm,
    config.tile * 2, // eps
    config.drag,
    short * config.horizon,
    short * config.wave,
    config.swirl,
    count,
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

  const reset = () => {
    simTime = 0;
    acc = 0;
    params[8] = 0;
    params[10] = 0;
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
    params[8] = simTime;
    params[10] = substeps;
    simTime += substeps * H;
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
