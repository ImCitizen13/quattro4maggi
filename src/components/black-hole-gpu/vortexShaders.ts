import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { Particle } from "./gpuTypes";
import { computeLayout as C, renderLayout as R } from "./layouts";

// ============================================================================
// Vortex shaders (11c compute, 11d render) — raw WGSL bodies in TypeGPU shells
// ============================================================================
//
// Units: physical pixels (origin top-left) and seconds.
// Particle.state: 0 = consumed, 1 = at home (waiting for the wave), 2 = free.
//
// Timeline (CPU drives `hole` with a spring, see vortexScene):
//   hole    0→1   horizon + mass grow in at the center from Release
//   vortexT0 +    radial wave: each tile's forces ramp 0→1 over `ramp` s
//   sticky patches (value noise on home) release up to `sticky` s late and
//   ramp up to 3x slower
//
// Bodies are the original WGSL. TypeGPU resolves the `$uses` names: `C.$.u` /
// `R.$.u` become the bound uniform, `in.x` the entry's builtin or location
// argument, `Out` the generated output struct. Never put a backtick in a
// comment here: it ends the template literal. Never write the word "in" in a
// body comment either: the resolver reads it as an external and warns (a
// LogBox toast that covers the HUD). For the same reason the one entry with a
// location input, tileFs, is TGSL.

// ---- Shared helpers ---------------------------------------------------------

const hash = tgpu.fn([d.u32], d.f32)`(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}`.$name("hash");

/** Current horizon radius: full size scaled by the hole spring. */
const horizonOf = tgpu.fn([d.f32, d.f32], d.f32)`(horizon: f32, hole: f32) -> f32 {
  return horizon * max(hole, 0.0);
}`.$name("horizonOf");

/** Hash of an integer lattice cell, mixed with the run seed. */
const cellHash = tgpu.fn([d.vec2f, d.u32], d.f32)`(c: vec2f, s: u32) -> f32 {
  return hash((u32(c.x) * 73856093u) ^ (u32(c.y) * 19349663u) ^ s);
}`
  .$uses({ hash })
  .$name("cellHash");

/**
 * Stickiness 0..1: coherent value-noise patches on the home position plus a
 * little per-tile jitter. Sticky tiles release later and ramp up slower.
 * Returns 0 when sticky is off (sticky <= 0).
 */
const stickOf = tgpu.fn([d.vec2f, d.u32, d.f32, d.f32, d.f32], d.f32)`(home: vec2f, i: u32, seed: f32, patchPx: f32, sticky: f32) -> f32 {
  if (sticky <= 0.0) { return 0.0; }
  let g = home / patchPx;
  let c = floor(g);
  let f = g - c;
  let sm = f * f * (3.0 - 2.0 * f);
  let s = u32(seed);
  let a = cellHash(c, s);
  let b = cellHash(c + vec2f(1.0, 0.0), s);
  let e = cellHash(c + vec2f(0.0, 1.0), s);
  let h = cellHash(c + vec2f(1.0, 1.0), s);
  let n = mix(mix(a, b, sm.x), mix(e, h, sm.x), sm.y);
  let blob = smoothstep(0.5, 0.8, n);
  let jit = (hash(i ^ (s * 2654435761u)) - 0.5) * 0.2;
  return clamp(blob + jit, 0.0, 1.0);
}`
  .$uses({ cellHash, hash })
  .$name("stickOf");

// ---- Compute ----------------------------------------------------------------

export const initFn = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [64],
})`{
  let i = in.gid.x;
  if (i >= u32(C.$.u.count)) { return; }
  let cols = u32(C.$.u.cols);
  let home = (vec2f(f32(i % cols), f32(i / cols)) + 0.5) * C.$.u.tile;
  var p: Particle;
  p.pos = home;
  p.vel = vec2f(0.0);
  p.home = home;
  // Radial wave: nearest tiles go first; jitter breaks up the ring edge.
  let k = stickOf(home, i, C.$.u.seed, C.$.u.patchPx, C.$.u.sticky);
  p.release = C.$.u.vortexT0 + length(home - C.$.u.center) / C.$.u.wave + hash(i) * 0.35 + k * C.$.u.sticky;
  p.state = 1.0;
  C.$.ps[i] = p;
}`
  .$uses({ C, hash, stickOf, Particle })
  .$name("init");

export const stepFn = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [64],
})`{
  let i = in.gid.x;
  if (i >= u32(C.$.u.count)) { return; }
  var p = C.$.ps[i];
  if (p.state == 0.0) { return; }

  let flow = C.$.u.flow * max(C.$.u.hole, 0.0);
  let horizon = horizonOf(C.$.u.horizon, C.$.u.hole);
  var t = C.$.u.time;
  let n = u32(C.$.u.substeps);
  // Sticky tiles ramp up slower: they lag, resist, then let go.
  let k = stickOf(p.home, i, C.$.u.seed, C.$.u.patchPx, C.$.u.sticky);
  let rampK = C.$.u.ramp * (1.0 + 2.0 * k);
  for (var s = 0u; s < n; s++) {
    t += C.$.u.h;
    if (p.state == 1.0) {
      if (t < p.release) { continue; }
      p.state = 2.0; // leaves home at rest; forces ramp up below
    }
    // Sink + point vortex: v = c/r * (inward + swirl * tangent). Inflow is
    // always positive, so no orbit can balance it (a swirl *force* did: tiles
    // got trapped on a ring where v_t^2/r = g). Paths are log spirals.
    // The field fades up, and velocity relaxes toward it at drag, so a tile
    // accelerates from rest instead of snapping.
    let w = smoothstep(p.release, p.release + rampK, t);
    let d = C.$.u.center - p.pos;
    let r = max(length(d), C.$.u.eps);
    let dir = d / r;
    let tangent = vec2f(-dir.y, dir.x); // counter-clockwise
    let field = (dir + tangent * C.$.u.swirl) * (flow / r) * w;
    // Relax at least 3x the local angular rate |v|/r: near the hole the flow
    // turns faster than drag can follow and tiles pile up on a ring.
    let rate = max(C.$.u.drag, 3.0 * length(field) / r);
    p.vel += (field - p.vel) * min(rate * C.$.u.h, 1.0);
    p.pos += p.vel * C.$.u.h;
    if (horizon > 0.0 && length(C.$.u.center - p.pos) < horizon) {
      p.state = 0.0;
      break;
    }
  }
  C.$.ps[i] = p;
}`
  .$uses({ C, horizonOf, stickOf })
  .$name("step");

// ---- Background + hole ------------------------------------------------------

export const bgVs = tgpu.vertexFn({
  in: { i: d.builtin.vertexIndex },
  out: { pos: d.builtin.position },
})`{
  let uv = vec2f(f32((in.i << 1u) & 2u), f32(in.i & 2u));
  var out: Out;
  out.pos = vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
  return out;
}`.$name("bgVs");

export const bgFs = tgpu.fragmentFn({
  in: { frag: d.builtin.position },
  out: d.vec4f,
})`{
  let space = vec3f(0.035, 0.035, 0.045);
  let horizon = horizonOf(R.$.u.horizon, R.$.u.hole);
  if (horizon <= 0.0) { return vec4f(space, 1.0); }
  let r = length(in.frag.xy - R.$.u.center) / horizon;
  // Accretion glow peaking just outside the horizon, fading up with the hole.
  let ring = exp(-pow((r - 1.25) * 2.2, 2.0)) * 0.9 + exp(-r * 0.6) * 0.25;
  let glow = vec3f(1.0, 0.55, 0.2) * ring * clamp(R.$.u.hole, 0.0, 1.0);
  let disc = smoothstep(1.0, 1.06, r);
  return vec4f((space + glow) * disc, 1.0);
}`
  .$uses({ R, horizonOf })
  .$name("bgFs");

// ---- Tiles ------------------------------------------------------------------

const CORNERS = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(0, 0),
  d.vec2f(1, 0),
  d.vec2f(0, 1),
  d.vec2f(0, 1),
  d.vec2f(1, 0),
  d.vec2f(1, 1),
]);

export const tileVs = tgpu.vertexFn({
  in: { vi: d.builtin.vertexIndex, ii: d.builtin.instanceIndex },
  out: { pos: d.builtin.position, texel: d.vec2f },
})`{
  var out: Out;
  let p = R.$.ps[in.ii];
  if (p.state == 0.0) {
    out.pos = vec4f(2.0, 2.0, 0.0, 1.0); // off-clip, zero-area
    out.texel = vec2f(0.0);
    return out;
  }
  let c = CORNERS[in.vi];
  var local = (c - 0.5) * R.$.u.tile;
  let center = p.pos;
  if (p.state == 2.0) {
    // Face motion, shrink into the horizon.
    let rampK = R.$.u.ramp * (1.0 + 2.0 * stickOf(p.home, in.ii, R.$.u.seed, R.$.u.patchPx, R.$.u.sticky));
    let k = smoothstep(p.release, p.release + rampK, R.$.u.time);
    let ang = atan2(p.vel.y, p.vel.x) * k;
    let cs = cos(ang);
    let sn = sin(ang);
    let horizon = horizonOf(R.$.u.horizon, R.$.u.hole);
    let s = smoothstep(horizon, horizon * 4.0, length(R.$.u.center - p.pos));
    local = vec2f(local.x * cs - local.y * sn, local.x * sn + local.y * cs) * s;
  }
  let px = center + local;
  out.pos = vec4f(px.x / R.$.u.res.x * 2.0 - 1.0, 1.0 - px.y / R.$.u.res.y * 2.0, 0.0, 1.0);
  out.texel = p.home + (c - 0.5) * R.$.u.tile;
  return out;
}`
  .$uses({ R, horizonOf, stickOf, CORNERS })
  .$name("tileVs");

// TGSL shell form (no "use gpu"): a raw body would have to read the location
// input as a struct field of "in", which the resolver warns about.
export const tileFs = tgpu
  .fragmentFn({
    in: { texel: d.vec2f },
    out: d.vec4f,
  })(({ texel }) => {
    const dims = d.vec2i(std.textureDimensions(R.$.snap));
    const xy = std.clamp(d.vec2i(std.floor(texel)), d.vec2i(0), std.sub(dims, d.vec2i(1)));
    return std.textureLoad(R.$.snap, xy, 0);
  })
  .$name("tileFs");
