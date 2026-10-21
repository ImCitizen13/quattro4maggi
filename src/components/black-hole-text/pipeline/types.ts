// ============================================================================
// Pipeline types
// ============================================================================

/**
 * Two flat buffers per pipeline, sized for `capacity` particles. The active
 * count is a prefix of that range, chosen per frame by the driver.
 * - `state`: private to a PhysicsSource (capacity * source.stateStride)
 * - `out`: the render contract (capacity * OUT_STRIDE: x, y, rotation, scale)
 */
export type ParticleBuffers = {
  capacity: number;
  state: Float32Array;
  out: Float32Array;
};

export type Bounds = { width: number; height: number };

/** Plain numbers only, so `step` can run on any runtime */
export type StepParams = {
  cx: number;
  cy: number;
  mass: number;
  timeScale: number;
};

/** Swappable physics. `init` and `step` are worklets. `dt` is in seconds. */
export type PhysicsSource = {
  name: string;
  stateStride: number;
  init: (
    state: Float32Array,
    out: Float32Array,
    count: number,
    bounds: Bounds
  ) => void;
  step: (
    state: Float32Array,
    out: Float32Array,
    count: number,
    params: StepParams,
    dt: number
  ) => void;
};
