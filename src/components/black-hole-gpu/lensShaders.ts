import tgpu from "typegpu";
import * as d from "typegpu/data";
import { lensLayout } from "./layouts";
import { horizonOf } from "./vortexShaders";

// ============================================================================
// Lens shader (12f) — gravitational lensing + hole + glow, one fullscreen pass
// ============================================================================
//
// Units: physical pixels (origin top-left). The backdrop is the composer's
// canvas-sized texture holding the tile pass.
//
// Per fragment, with r the distance to the hole center and rh the current
// horizon radius:
//   rh <= 0     exact passthrough of the backdrop (idle / before the hole)
//   defl        point-mass lens, source = r - RE^2 / r (RE = rh * EINSTEIN).
//               Negative inside RE: the flipped second image. Faded out far
//               from the hole by FALLOFF so the screen edges stay steady.
//   col         backdrop sampled at the source, red and blue split along the
//               radial direction by CHROMA * defl
//   glow        the accretion glow, peaking just outside the horizon, fading
//               up with the hole spring
//   disc        black inside the horizon (smoothstep rim)
//
// Constants (WGSL const, local to the body):
//   EINSTEIN 1.8   Einstein radius as a multiple of the horizon radius
//   FALLOFF  6.0   deflection fades out around FALLOFF * RE
//   CHROMA   0.03  chromatic split as a fraction of the deflection
//
// Raw WGSL body in a TypeGPU shell, same rules as vortexShaders: never a
// backtick and never the word "in" in a body comment.

export const lensFs = tgpu.fragmentFn({
  in: { frag: d.builtin.position },
  out: d.vec4f,
})`{
  const EINSTEIN = 1.8;
  const FALLOFF = 6.0;
  const CHROMA = 0.03;
  let dims = vec2f(textureDimensions(L.$.backdrop));
  let base = textureSampleLevel(L.$.backdrop, L.$.samp, in.frag.xy / dims, 0.0);
  let rh = horizonOf(L.$.u.horizon, L.$.u.hole);
  if (rh <= 0.0) { return base; }
  let rel = in.frag.xy - L.$.u.center;
  let r = max(length(rel), 0.001);
  let dir = rel / r;
  let re = rh * EINSTEIN;
  let fall = 1.0 / (1.0 + pow(r / (re * FALLOFF), 2.0));
  let defl = re * re / r * fall;
  let src = L.$.u.center + dir * (r - defl);
  let ca = defl * CHROMA;
  let cr = textureSampleLevel(L.$.backdrop, L.$.samp, (src + dir * ca) / dims, 0.0).r;
  let cg = textureSampleLevel(L.$.backdrop, L.$.samp, src / dims, 0.0).g;
  let cb = textureSampleLevel(L.$.backdrop, L.$.samp, (src - dir * ca) / dims, 0.0).b;
  let x = r / rh;
  // Accretion glow peaking just outside the horizon, fading up with the hole.
  let ring = exp(-pow((x - 1.25) * 2.2, 2.0)) * 0.9 + exp(-x * 0.6) * 0.25;
  let glow = vec3f(1.0, 0.55, 0.2) * ring * clamp(L.$.u.hole, 0.0, 1.0);
  let disc = smoothstep(rh, rh * 1.06, r);
  return vec4f((vec3f(cr, cg, cb) + glow) * disc, 1.0);
}`
  .$uses({ L: lensLayout, horizonOf })
  .$name("lensFs");
