import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { starfieldBindGroupLayout } from "./layouts";
// Credit to the original artist at https://www.shadertoy.com/view/MlKBWw

const PI = 3.141592;
const SLICES = 2000.0; // lower will give us a pixalated effect as the slices become bigger an
// Less spread More stars, same look → bump 1000.0 to 2000.0.
const LAYERS = 5; // More depth/parallax → bump the loop count 5 to 8.
const DIMMER_EXP = 10; // More visible/brighter field → drop pow(..., 5.0) to pow(..., 3.0).
// Disc mode — 2D hash-grid starfield in rotated world-XY space.
// Higher density = more stars per screen; higher sharpness = smaller discs.
const GRID_DENSITY = 40.0;
const GRID_SHARPNESS = 80.0;
// ─── rand ────────────────────────────────────────────────────────────────────
// Classic GLSL hash: deterministic pseudo-random f32 in [0, 1) from a vec2 seed.
// Same input always returns the same output, which is what lets every star be
// "placed" once based on its angular slice and stay anchored frame-to-frame.
export const rand = tgpu.fn(
  [d.vec2f],
  d.f32
)((co) => {
  "use gpu";
  // dot → sin (chaotic across inputs) → multiply by a large prime-ish number →
  // fract takes the fractional part, collapsing it into [0, 1).
  return std.fract(std.sin(std.dot(co, d.vec2f(12.9898, 78.233))) * 43758.5453);
}); 

// ─── starColor ───────────────────────────────────────────────────────────────
// Maps a star's B–V color index (a real astronomical measure of stellar
// temperature, ranging roughly -0.4 for hot blue stars to ~2.0 for cool red
// ones) plus a brightness scalar into a linear-sRGB vec3 ready for display.
export const starColor = tgpu.fn(
  [d.f32, d.f32],
  d.vec3f
)((bvIn, brightness) => {
  "use gpu";
  // Clamp B–V into the empirically valid range.
  let bv = bvIn;
  if (bv < -0.4) {
    bv = -0.4;
  }
  if (bv > 2.0) {
    bv = 2.0;
  }

  // Piecewise polynomial fits — one per channel — approximating the published
  // B–V → RGB curves. Each `t` is a 0..1 lerp parameter inside its segment.

  // Red channel: rises steadily as stars get cooler (redder).
  let r = d.f32(0.0);
  if (bv < 0.0) {
    const t = (bv + 0.4) / 0.4;
    r = 0.61 + 0.11 * t + 0.1 * t * t;
  } else if (bv < 0.4) {
    const t = bv / 0.4;
    r = 0.83 + 0.17 * t;
  } else {
    r = 1.0;
  }

  // Green channel: peaks near the middle of the range, falls off at both ends.
  let g = d.f32(0.0);
  if (bv < 0.0) {
    const t = (bv + 0.4) / 0.4;
    g = 0.7 + 0.07 * t + 0.1 * t * t;
  } else if (bv < 0.4) {
    const t = bv / 0.4;
    g = 0.87 + 0.11 * t;
  } else if (bv < 1.6) {
    const t = (bv - 0.4) / 1.2;
    g = 0.98 - 0.16 * t;
  } else {
    const t = (bv - 1.6) / 0.4;
    g = 0.82 - 0.5 * t * t;
  }

  // Blue channel: dominant for hot stars, fades to zero for cool ones.
  let b = d.f32(0.0);
  if (bv < 0.4) {
    b = 1.0;
  } else if (bv < 1.5) {
    const t = (bv - 0.4) / 1.1;
    b = 1.0 - 0.47 * t + 0.1 * t * t;
  } else if (bv < 1.94) {
    const t = (bv - 1.5) / 0.44;
    b = 0.63 - 0.6 * t * t;
  } else {
    b = 0.0;
  }

  // Convert sRGB → linear (gamma 2.2), normalize chromaticity by total energy,
  // scale by brightness, then re-encode back to sRGB. This keeps a star's hue
  // stable as it brightens, instead of just washing out toward white.
  const linear = std.pow(d.vec3f(r, g, b), d.vec3f(2.2, 2.2, 2.2));
  const sum = linear.x + linear.y + linear.z;
  const scaled = std.mul((brightness * 3.0) / sum, linear);
  return std.pow(scaled, d.vec3f(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
});

// ─── vertexFn ────────────────────────────────────────────────────────────────
// Fullscreen triangle trick: one oversized triangle covers the whole viewport
// after clipping. Cheaper than a quad (3 verts vs 6) and avoids the diagonal
// seam between the two triangles of a quad.
export const vertexFn = tgpu["~unstable"].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position },
})(({ vertexIndex }) => {
  const positions = d.arrayOf(
    d.vec2f,
    3
  )([d.vec2f(-1.0, -1.0), d.vec2f(3.0, -1.0), d.vec2f(-1.0, 3.0)]);
  const pos = positions[vertexIndex];
  return { outPos: d.vec4f(pos.x, pos.y, 0.0, 1.0) };
});

// ─── fragmentFn ──────────────────────────────────────────────────────────────
// Runs once per pixel. Builds a 3D view ray, rotates it over time, and
// accumulates contributions from up to 5 layers of stars.
export const fragmentFn = tgpu["~unstable"].fragmentFn({
  in: { position: d.builtin.position },
  out: d.vec4f,
})(({ position }) => {
  const u = starfieldBindGroupLayout.$.uniforms;
  const res = u.iResolution;
  // Flip Y so the scene matches Shadertoy's bottom-up coordinate convention.
  const pix = d.vec2f(position.x, res.y - position.y);

  // Accumulator for the final pixel colour — each layer adds light to it.
  let colour = d.vec3f(0.0, 0.0, 0.0);

  // Five star "layers" at different depths/seeds → richer parallax and density.
  for (let i = 0; i < LAYERS; i++) {
    const fi = d.f32(i);

    // Convert pixel coords → centred, aspect-corrected NDC-like coords in
    // [-1, 1] on the shorter axis. `p` is the pixel direction in screen space.
    const numerator = std.sub(std.mul(pix, 2.0), res);
    // Tilt-driven look-around: subtract the CPU-supplied offset (NDC units).
    const p = std.sub(
      std.div(numerator, std.min(res.x, res.y)),
      u.cameraOffset
    );

    // Lift the 2D direction into a 3D ray. The z component shrinks slightly at
    // the edges (1 - |p| * 0.2) which gives the field a subtle dome / lens curl.
    let v = d.vec3f(p.x, p.y, 1.0 - std.length(p) * 0.2);

    // ─── camera rotation ────────────────────────────────────────────────────
    // ta is a slow angle driven by rotationTime — a separate clock the CPU
    // pauses/resumes, so toggling rotation freezes the spin without snapping.
    // Forward motion (below) keeps using iTime so flying-through never stops.
    const ta = u.rotationTime * 0.1;
    let m = d.mat3x3f(
      d.vec3f(0.0, 1.0, 0.0),
      d.vec3f(-std.sin(ta), 0.0, std.cos(ta)),
      d.vec3f(std.cos(ta), 0.0, std.sin(ta))
    );
    // m → m^3 → m^6. Cheap way to compound the rotation into a more complex
    // basis without writing out the full matrix; gives the spin extra "twist".
    m = std.mul(std.mul(m, m), m);
    m = std.mul(m, m);
    v = std.mul(m, v);

    // ─── angular slice → per-star randoms ───────────────────────────────────
    // Project the ray onto the XY plane and take its angle a ∈ [0, 1).
    // Quantize into 1000 angular "slices"; each slice is one star's identity.
    const a = std.atan2(v.y, v.x) / PI / 2.0 + 0.5;
    const slice = std.floor(a * SLICES);

    // Pull four uncorrelated randoms keyed on (slice, channel + layer offset).
    const phase = rand(d.vec2f(slice, 0.0 + fi * 10.0)); // depth offset
    const dist = rand(d.vec2f(slice, 1.0 + fi * 10.0)) * 3.0; // radial dist
    const hue = rand(d.vec2f(slice, 2.0 + fi * 10.0)); // B–V colour
    // pow(rand, 5) skews bright stars to be rare — most of the field is dim.
    const bright = std.pow(rand(d.vec2f(slice, 3.0)), DIMMER_EXP);

    // ─── depth + forward motion ────────────────────────────────────────────
    // Project the ray onto the star's radial line: how far "down" the cone
    // this pixel is at the star's distance.
    const z = (dist / std.length(d.vec2f(v.x, v.y))) * v.z;
    // Forward flying through the stars: forwardTime is a CPU-paused clock
    // (already pre-scaled by 0.6 on the CPU side). fract makes Z wrap
    // from 1 → 0 over time, so each star approaches and resets.
    const Z = std.fract(z + phase + u.forwardTime);
    // Distance from the star's centre in the (radial, depth) plane.
    const dlen = std.sqrt(z * z + dist * dist);

    // ─── HYPERSPACE contribution ───────────────────────────────────────────
    // Polar/radial model: depth gate exp(-Z * tightness) — the coefficient
    // sets the radial extent of each star. High tightness → tight peak → dot.
    // Low tightness → wide peak → streak. forwardSpeed (CPU-smoothed) drives
    // the interpolation: paused = 400 (dots), full speed = 40 (streaks).
    const tightness = std.mix(d.f32(400.0), d.f32(40.0), u.forwardSpeed);
    const hyperC = std.exp(-Z * tightness + 0.3) / (dlen * dlen + 1.0);
    const hyperColor = starColor(hue * 2.4 - 0.4, hyperC * 2.0 * bright);

    // ─── DISC contribution ─────────────────────────────────────────────────
    // 2D hash grid in rotated world-XY space — each cell holds one star at
    // a random 2D position with screen-space Gaussian falloff. No radial
    // parameter → no streak. Forward motion has no effect in this mode.
    const cellCoord = std.mul(d.vec2f(v.x, v.y), GRID_DENSITY);
    const cell = std.floor(cellCoord);
    const cellFrac = std.sub(cellCoord, cell);
    const starOffset = d.vec2f(
      rand(std.add(cell, d.vec2f(0.0, fi * 17.0))),
      rand(std.add(cell, d.vec2f(7.0, 13.0 + fi * 17.0)))
    );
    const delta = std.sub(cellFrac, starOffset);
    // pow(rand, DIMMER_EXP) skews bright stars to be rare per cell.
    const cellBright = std.pow(
      rand(std.add(cell, d.vec2f(2.0, 5.0 + fi * 17.0))),
      DIMMER_EXP
    );
    const cellHue = rand(std.add(cell, d.vec2f(11.0, 3.0 + fi * 17.0)));
    const discC =
      std.exp(-std.dot(delta, delta) * GRID_SHARPNESS) * cellBright;
    const discColor = starColor(cellHue * 2.4 - 0.4, discC * 2.0);

    // Mix the two paths and accumulate. hyperspace=1 → streaks; =0 → discs.
    colour = std.add(colour, std.mix(discColor, hyperColor, u.hyperspace));
  }

  return d.vec4f(colour.x, colour.y, colour.z, 1.0);
});
