import tgpu from "typegpu";
import * as d from "typegpu/data";
import { lensLayout } from "./layouts";
import { horizonOf } from "./vortexShaders";

// ============================================================================
// Lens shader (12g) — tunable gravity lens + glass bubble + hole, one pass
// ============================================================================
//
// Units: physical pixels (origin top-left). The backdrop is the composer's
// canvas-sized texture holding the tile pass. Every knob comes from the
// LensTune uniform (L.$.t), defaults and ranges in lensTune.ts.
//
// Per fragment, with r the distance to the hole center and rh the current
// horizon radius:
//   rh <= 0     exact passthrough of the backdrop (idle / before the hole)
//   gravity     point-mass lens, source g = r - RE^2 / r, RE = rh * einstein.
//               Negative inside RE: the flipped second image. Faded out far
//               from the hole around falloff * RE. einstein <= 0 disables it.
//               Red and blue split along the radial direction by chroma * defl.
//   bubble      glass port of centerBubbleScene, centered on the hole, radius
//               R = rh * bubble (R <= 0 disables it). Superellipse outline
//               (shapeN), signed refraction (positive barrel, negative
//               pincushion), rim band (edge) with chromatic dispersion and a
//               prismatic rainbow (rim), specular gain, outer halo (halo,
//               spread). Its sample points start from the gravity source g.
//   glow        accretion glow, peaking just outside the horizon, fading up
//               with the hole spring, scaled by glow
//   disc        black inside rh * disc (smoothstep rim, disc <= 0 disables it)
//
// Raw WGSL body in a TypeGPU shell, same rules as vortexShaders: never a
// backtick and never the word "in" in a body comment.

export const lensFs = tgpu.fragmentFn({
  in: { frag: d.builtin.position },
  out: d.vec4f,
})`{
  let T = L.$.t;
  let U = L.$.u;
  let dims = vec2f(textureDimensions(L.$.backdrop));
  let base = textureSampleLevel(L.$.backdrop, L.$.samp, in.frag.xy / dims, 0.0);
  let rh = horizonOf(U.horizon, U.hole);
  if (rh <= 0.0) { return base; }
  let rel = in.frag.xy - U.center;
  let r = max(length(rel), 0.001);
  let dir = rel / r;

  var defl = 0.0;
  if (T.einstein > 0.0) {
    let re = rh * T.einstein;
    let fall = 1.0 / (1.0 + pow(r / (re * T.falloff), 2.0));
    defl = re * re / r * fall;
  }
  let g = U.center + dir * (r - defl);
  let ca = defl * T.chroma;

  var mask = 0.0;
  var halo = 0.0;
  var lit = vec3f(0.0);
  let R = T.bubble * rh;
  if (R > 0.0) {
    let n = max(T.shapeN, 1.0);
    let ax = pow(abs(rel.x) / R, n);
    let ay = pow(abs(rel.y) / R, n);
    let normDist = pow(ax + ay, 1.0 / n);
    let dist = normDist * R;
    mask = 1.0 - smoothstep(R - 1.5, R + 1.5, dist);
    halo = (1.0 - smoothstep(R, R + max(R * T.spread, 0.01), dist)) * T.halo;

    let distortPx = T.refraction * normDist * normDist * R;
    let gi = g - dir * distortPx;
    let edgeFactor = smoothstep(1.0 - max(T.edge, 0.001), 1.0, normDist);
    let chromaPx = T.dispersion * edgeFactor * R;
    let sMid = textureSampleLevel(L.$.backdrop, L.$.samp, gi / dims, 0.0).rgb;
    let sR = textureSampleLevel(L.$.backdrop, L.$.samp, (gi + dir * (ca + chromaPx)) / dims, 0.0).r;
    let sB = textureSampleLevel(L.$.backdrop, L.$.samp, (gi - dir * (ca + chromaPx)) / dims, 0.0).b;
    let interior = mix(sMid, vec3f(sR, sMid.g, sB), edgeFactor);

    let hue = fract(atan2(rel.y, rel.x) / 6.28318530718 + 0.5);
    let segment = hue * 6.0;
    let idx = floor(segment);
    let f = segment - idx;
    var rainbow = mix(vec3f(1.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), f);
    if (idx < 1.0) {
      rainbow = mix(vec3f(1.0, 0.0, 0.0), vec3f(1.0, 1.0, 0.0), f);
    } else if (idx < 2.0) {
      rainbow = mix(vec3f(1.0, 1.0, 0.0), vec3f(0.0, 1.0, 0.0), f);
    } else if (idx < 3.0) {
      rainbow = mix(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 1.0, 1.0), f);
    } else if (idx < 4.0) {
      rainbow = mix(vec3f(0.0, 1.0, 1.0), vec3f(0.0, 0.0, 1.0), f);
    } else if (idx < 5.0) {
      rainbow = mix(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 1.0), f);
    }

    let specDot = max(dot(dir, vec2f(-0.4, -0.6)), 0.0);
    let spec = (pow(specDot, 32.0) * 0.6 + pow(specDot, 8.0) * 0.15) * T.specular;
    let withRim = mix(interior, rainbow, edgeFactor * T.rim) + rainbow * (edgeFactor * T.rim / 3.0);
    lit = withRim + vec3f(spec);
  }

  let cr = textureSampleLevel(L.$.backdrop, L.$.samp, (g + dir * ca) / dims, 0.0).r;
  let cg = textureSampleLevel(L.$.backdrop, L.$.samp, g / dims, 0.0).g;
  let cb = textureSampleLevel(L.$.backdrop, L.$.samp, (g - dir * ca) / dims, 0.0).b;
  let outside = mix(vec3f(cr, cg, cb), vec3f(1.0), halo);
  let rgb = mix(outside, lit, mask);

  let x = r / rh;
  let ring = exp(-pow((x - 1.25) * 2.2, 2.0)) * 0.9 + exp(-x * 0.6) * 0.25;
  let glow = vec3f(1.0, 0.55, 0.2) * ring * clamp(U.hole, 0.0, 1.0) * T.glow;
  let discR = rh * T.disc;
  var disc = 1.0;
  if (discR > 0.0) { disc = smoothstep(discR, discR * 1.06, r); }
  return vec4f((rgb + glow) * disc, 1.0);
}`
  .$uses({ L: lensLayout, horizonOf })
  .$name("lensFs");
