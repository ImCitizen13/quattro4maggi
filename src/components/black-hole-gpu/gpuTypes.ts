import * as d from "typegpu/data";

// ============================================================================
// GPU data schemas (shared by the CPU writes and the shader accessors)
// ============================================================================
//
// Units: physical pixels (origin top-left) and seconds.

/**
 * One tile particle, 32 B.
 * `state`: 0 = consumed, 1 = at home (waiting for the wave), 2 = free.
 */
export const Particle = d
  .struct({
    pos: d.vec2f,
    vel: d.vec2f,
    home: d.vec2f,
    release: d.f32,
    state: d.f32,
  })
  .$name("Particle");

/** Per-frame uniform, 3 × vec2f + 18 × f32 = 96 B. */
export const Params = d
  .struct({
    /** Canvas size, px. */
    res: d.vec2f,
    /** Hole center, px. */
    center: d.vec2f,
    /** Snapshot size, px. */
    texSize: d.vec2f,
    /** Tile edge, px. */
    tile: d.f32,
    cols: d.f32,
    /** Sim time at the start of this frame, s. */
    time: d.f32,
    /** Fixed step, s. */
    h: d.f32,
    /** Steps to run this frame. */
    substeps: d.f32,
    /** Sink strength c (px²/s): inflow speed = c / r. */
    flow: d.f32,
    /** Min radius for the 1/r field, px. */
    eps: d.f32,
    /** Velocity relaxation rate toward the field, 1/s. */
    drag: d.f32,
    /** Full-size horizon, px. */
    horizon: d.f32,
    /** Release wave speed, px/s. */
    wave: d.f32,
    /** Tangential / inflow speed ratio (spiral pitch). */
    swirl: d.f32,
    count: d.f32,
    /** 0..1 (spring, may overshoot): scales horizon + mass. */
    hole: d.f32,
    /** Free slot (was shatter). */
    _pad2: d.f32,
    /** Wave start, s. */
    vortexT0: d.f32,
    /** Per-tile force ramp, s. */
    ramp: d.f32,
    _pad0: d.f32,
    _pad1: d.f32,
  })
  .$name("Params");

export type ParticleData = d.Infer<typeof Particle>;
export type ParamsData = d.Infer<typeof Params>;
