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

/**
 * Per-frame uniform, 3 × vec2f + 23 × f32 = 116 B (padded to 120 B by the
 * struct alignment). New fields are appended, so older offsets don't move.
 */
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
    /** Sim time of the displayed state (step index × h, after this frame's steps), s. */
    time: d.f32,
    /** Fixed step, s. */
    h: d.f32,
    /** Steps to run this frame (substep s is absolute step step0 + s + 1). */
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
    /** 0..1 (spring, may overshoot): scales horizon + mass. This frame's value, for tileVs and the lens. */
    hole: d.f32,
    /** Sticky patch cell size, px. */
    patchPx: d.f32,
    /** Wave start, s. */
    vortexT0: d.f32,
    /** Per-tile force ramp, s. */
    ramp: d.f32,
    /** Stickiness pattern seed (new per run). */
    seed: d.f32,
    /** Max extra release delay for fully sticky tiles, s. */
    sticky: d.f32,
    /** Absolute index of the step before this frame's first substep. */
    step0: d.f32,
    /** First step index whose deaths are counted (steps below were already recorded). */
    recordFrom: d.f32,
    /** Hole spring closed form: start time, s. */
    holeT0: d.f32,
    /** Hole spring closed form: envelope decay, 1/s. */
    holeDecay: d.f32,
    /** Hole spring closed form: damped angular frequency, rad/s. */
    holeFreq: d.f32,
  })
  .$name("Params");

/**
 * Lens tuning uniform, 21 × f32 (TypeGPU pads it to the struct alignment).
 * Written every frame from SharedValues; defaults live in lensTune.ts.
 */
export const LensTune = d
  .struct({
    /** Einstein radius as a multiple of the horizon radius. */
    einstein: d.f32,
    /** Deflection fades out around falloff * Einstein radius. */
    falloff: d.f32,
    /** Gravity chromatic split, fraction of the deflection. */
    chroma: d.f32,
    /** Glass bubble radius as a multiple of the horizon radius (0 = off). */
    bubble: d.f32,
    /** Signed refraction: positive = barrel, negative = pincushion. */
    refraction: d.f32,
    /** Superellipse exponent of the bubble outline (2 = circle). */
    shapeN: d.f32,
    /** Rim band width, fraction of the bubble radius. */
    edge: d.f32,
    /** Rim chromatic dispersion, fraction of the bubble radius. */
    dispersion: d.f32,
    /** Prismatic rim strength. */
    rim: d.f32,
    /** Specular highlight gain. */
    specular: d.f32,
    /** Outer halo opacity. */
    halo: d.f32,
    /** Outer halo width, fraction of the bubble radius. */
    spread: d.f32,
    /** Rim color, 0..1 per channel. */
    rimR: d.f32,
    rimG: d.f32,
    rimB: d.f32,
    /** Halo color, 0..1 per channel. */
    haloR: d.f32,
    haloG: d.f32,
    haloB: d.f32,
    /** Specular color, 0..1 per channel. */
    specR: d.f32,
    specG: d.f32,
    specB: d.f32,
    /** Rim blend from the rim color (0) to the 6-stop rainbow (1). */
    rainbow: d.f32,
  })
  .$name("LensTune");

export type LensTuneData = d.Infer<typeof LensTune>;
export type ParticleData = d.Infer<typeof Particle>;
export type ParamsData = d.Infer<typeof Params>;
