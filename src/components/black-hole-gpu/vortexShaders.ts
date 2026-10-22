// ============================================================================
// Vortex shaders (11c compute, 11d render) — raw WGSL
// ============================================================================
//
// Units: physical pixels (origin top-left) and seconds.
// Particle.state: 0 = consumed, 1 = at home (waiting for the wave), 2 = free.
//
// Timeline (CPU drives `shatter` and `hole` with springs, see vortexScene):
//   shatter 0→1   tiles shrink apart and jitter in place
//   hole    0→1   horizon + mass grow in at the center
//   vortexT0 +    radial wave: each tile's forces ramp 0→1 over `ramp` s

const COMMON = /* wgsl */ `
struct Particle {
  pos: vec2f,
  vel: vec2f,
  home: vec2f,
  release: f32,
  state: f32,
}

struct Params {
  res: vec2f,      // canvas size, px
  center: vec2f,   // hole center, px
  texSize: vec2f,  // snapshot size, px
  tile: f32,       // tile edge, px
  cols: f32,
  time: f32,       // sim time at the start of this frame, s
  h: f32,          // fixed step, s
  substeps: f32,   // steps to run this frame
  flow: f32,       // sink strength c (px^2/s): inflow speed = c / r
  eps: f32,        // min radius for the 1/r field, px
  drag: f32,       // velocity relaxation rate toward the field, 1/s
  horizon: f32,    // full-size horizon, px
  wave: f32,       // release wave speed, px/s
  swirl: f32,      // tangential / inflow speed ratio (spiral pitch)
  count: f32,
  hole: f32,       // 0..1 (spring, may overshoot): scales horizon + mass
  shatter: f32,    // 0..1: tile gap + jitter
  vortexT0: f32,   // wave start, s
  ramp: f32,       // per-tile force ramp, s
  _pad0: f32,
  _pad1: f32,
}

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}

fn horizonNow() -> f32 {
  return u.horizon * max(u.hole, 0.0);
}
`;

export const COMPUTE_WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage, read_write> ps: array<Particle>;
${COMMON}

@compute @workgroup_size(64)
fn init(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u32(u.count)) { return; }
  let cols = u32(u.cols);
  let home = (vec2f(f32(i % cols), f32(i / cols)) + 0.5) * u.tile;
  var p: Particle;
  p.pos = home;
  p.vel = vec2f(0.0);
  p.home = home;
  // Radial wave: nearest tiles go first; jitter breaks up the ring edge.
  p.release = u.vortexT0 + length(home - u.center) / u.wave + hash(i) * 0.35;
  p.state = 1.0;
  ps[i] = p;
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u32(u.count)) { return; }
  var p = ps[i];
  if (p.state == 0.0) { return; }

  let flow = u.flow * max(u.hole, 0.0);
  let horizon = horizonNow();
  var t = u.time;
  let n = u32(u.substeps);
  for (var s = 0u; s < n; s++) {
    t += u.h;
    if (p.state == 1.0) {
      if (t < p.release) { continue; }
      p.state = 2.0; // leaves home at rest; forces ramp in below
    }
    // Sink + point vortex: v = c/r · (inward + swirl · tangent). Inflow is
    // always positive, so no orbit can balance it (a swirl *force* did: tiles
    // got trapped in a ring where v_t^2/r = g). Paths are log spirals.
    // The field fades in, and velocity relaxes toward it at u.drag, so a tile
    // accelerates from rest instead of snapping.
    let w = smoothstep(p.release, p.release + u.ramp, t);
    let d = u.center - p.pos;
    let r = max(length(d), u.eps);
    let dir = d / r;
    let tangent = vec2f(-dir.y, dir.x); // counter-clockwise
    let field = (dir + tangent * u.swirl) * (flow / r) * w;
    // Relax at least 3× the local angular rate |v|/r: near the hole the flow
    // turns faster than u.drag can follow and tiles pile up in a ring.
    let rate = max(u.drag, 3.0 * length(field) / r);
    p.vel += (field - p.vel) * min(rate * u.h, 1.0);
    p.pos += p.vel * u.h;
    if (horizon > 0.0 && length(u.center - p.pos) < horizon) {
      p.state = 0.0;
      break;
    }
  }
  ps[i] = p;
}
`;

export const RENDER_WGSL = /* wgsl */ `
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage, read> ps: array<Particle>;
@group(0) @binding(2) var snap: texture_2d<f32>;
${COMMON}

fn toNdc(px: vec2f) -> vec4f {
  return vec4f(px.x / u.res.x * 2.0 - 1.0, 1.0 - px.y / u.res.y * 2.0, 0.0, 1.0);
}

// ---- Background + hole ------------------------------------------------------

@vertex
fn bgVs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn bgFs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let space = vec3f(0.035, 0.035, 0.045);
  let horizon = horizonNow();
  if (horizon <= 0.0) { return vec4f(space, 1.0); }
  let r = length(frag.xy - u.center) / horizon;
  // Accretion glow peaking just outside the horizon, fading in with the hole.
  let ring = exp(-pow((r - 1.25) * 2.2, 2.0)) * 0.9 + exp(-r * 0.6) * 0.25;
  let glow = vec3f(1.0, 0.55, 0.2) * ring * clamp(u.hole, 0.0, 1.0);
  let disc = smoothstep(1.0, 1.06, r);
  return vec4f((space + glow) * disc, 1.0);
}

// ---- Tiles ------------------------------------------------------------------

struct TileOut {
  @builtin(position) pos: vec4f,
  @location(0) texel: vec2f,
}

const CORNERS = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
  vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
);

const SHATTER_SCALE = 0.85;
const JITTER = 0.25; // fraction of a tile

@vertex
fn tileVs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> TileOut {
  var out: TileOut;
  let p = ps[ii];
  if (p.state == 0.0) {
    out.pos = vec4f(2.0, 2.0, 0.0, 1.0); // off-clip, zero-area
    out.texel = vec2f(0.0);
    return out;
  }
  let c = CORNERS[vi];
  // Shatter: tiles shrink apart and wobble, a little out of phase.
  let phase = hash(ii) * 6.2831;
  let wobble = vec2f(sin(u.time * 9.0 + phase), cos(u.time * 7.0 + phase * 1.3));
  var local = (c - 0.5) * u.tile * mix(1.0, SHATTER_SCALE, u.shatter);
  // Floor at 6 px so the wobble still reads with 2 px tiles.
  var center = p.pos + wobble * (max(u.tile, 6.0) * JITTER * u.shatter);
  if (p.state == 2.0) {
    // Settle the wobble, face motion, shrink into the horizon.
    let k = smoothstep(p.release, p.release + u.ramp, u.time);
    center = mix(center, p.pos, k);
    let ang = atan2(p.vel.y, p.vel.x) * k;
    let cs = cos(ang);
    let sn = sin(ang);
    let horizon = horizonNow();
    let s = smoothstep(horizon, horizon * 4.0, length(u.center - p.pos));
    local = vec2f(local.x * cs - local.y * sn, local.x * sn + local.y * cs) * s;
  }
  out.pos = toNdc(center + local);
  out.texel = p.home + (c - 0.5) * u.tile;
  return out;
}

@fragment
fn tileFs(in: TileOut) -> @location(0) vec4f {
  let dims = vec2i(textureDimensions(snap));
  let xy = clamp(vec2i(floor(in.texel)), vec2i(0), dims - 1);
  return textureLoad(snap, xy, 0);
}
`;
