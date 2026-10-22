// ============================================================================
// Vortex shaders (11c compute, 11d render) — raw WGSL
// ============================================================================
//
// Units: physical pixels (origin top-left) and seconds.
// Particle.state: 0 = consumed, 1 = at home (waiting for the wave), 2 = free.

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
  gm: f32,         // px^3/s^2
  eps: f32,        // gravity softening, px
  drag: f32,       // 1/s
  horizon: f32,    // px
  wave: f32,       // release wave speed, px/s
  swirl: f32,      // tangential kick, fraction of circular speed
  count: f32,
  _pad0: f32,
  _pad1: f32,
}

fn hash(n: u32) -> f32 {
  var x = n * 747796405u + 2891336453u;
  x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
  x = (x >> 22u) ^ x;
  return f32(x) / 4294967295.0;
}
`;

export const COMPUTE_WGSL = /* wgsl */ `
${COMMON}
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage, read_write> ps: array<Particle>;

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
  p.release = length(home - u.center) / u.wave + hash(i) * 0.25;
  p.state = 1.0;
  ps[i] = p;
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= u32(u.count)) { return; }
  var p = ps[i];
  if (p.state == 0.0) { return; }

  var t = u.time;
  let n = u32(u.substeps);
  for (var s = 0u; s < n; s++) {
    t += u.h;
    if (p.state == 1.0) {
      if (t < p.release) { continue; }
      // Released: tangential kick (counter-clockwise) so tiles spiral in.
      let d = u.center - p.pos;
      let r = max(length(d), 1.0);
      let dir = d / r;
      let tangent = vec2f(-dir.y, dir.x);
      let vc = sqrt(u.gm / r);
      p.vel = tangent * vc * u.swirl * (0.85 + 0.3 * hash(i + 7u));
      p.state = 2.0;
    }
    // Softened gravity + accretion drag, semi-implicit Euler.
    let d = u.center - p.pos;
    let r2 = dot(d, d) + u.eps * u.eps;
    let inv = inverseSqrt(r2);
    let a = d * (u.gm * inv * inv * inv) - p.vel * u.drag;
    p.vel += a * u.h;
    p.pos += p.vel * u.h;
    if (length(u.center - p.pos) < u.horizon) {
      p.state = 0.0;
      break;
    }
  }
  ps[i] = p;
}
`;

export const RENDER_WGSL = /* wgsl */ `
${COMMON}
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage, read> ps: array<Particle>;
@group(0) @binding(2) var snap: texture_2d<f32>;

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
  let r = length(frag.xy - u.center) / u.horizon;
  let space = vec3f(0.035, 0.035, 0.045);
  // Accretion glow peaking just outside the horizon.
  let ring = exp(-pow((r - 1.25) * 2.2, 2.0)) * 0.9 + exp(-r * 0.6) * 0.25;
  let glow = vec3f(1.0, 0.55, 0.2) * ring;
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
  var local = (c - 0.5) * u.tile;
  if (p.state == 2.0) {
    // Shrink into the horizon; turn to face motion over the first second.
    let r = length(u.center - p.pos);
    let s = smoothstep(u.horizon, u.horizon * 4.0, r);
    let k = clamp(u.time - p.release, 0.0, 1.0);
    let ang = atan2(p.vel.y, p.vel.x) * k;
    let cs = cos(ang);
    let sn = sin(ang);
    local = vec2f(local.x * cs - local.y * sn, local.x * sn + local.y * cs) * s;
  }
  out.pos = toNdc(p.pos + local);
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
