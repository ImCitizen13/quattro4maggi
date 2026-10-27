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
//               pincushion), rim band (edge) with chromatic dispersion, outer
//               halo (halo, spread) and specular gain. Its sample points start
//               from the gravity source g.
//   colors      rim, halo and specular each read a list of 1..6 colors
//               (rimColors/haloColors/specColors + counts; 6 = LENS_MAX_COLORS
//               in gpuTypes.ts, hardcoded below). Rim and halo: a cyclic
//               linear gradient around the bubble angle (same angle as the
//               rainbow, seamless wrap); the rim then blends toward the
//               6-stop rainbow by rainbow. Specular: a linear gradient from
//               the highlight center (first color) to where its lobe dies
//               (last color), t = clamp((1 - specDot / 0.72111) * 4, 0, 1);
//               0.72111 is the length of the unnormalized light vector
//               (-0.4, -0.6), so specDot peaks there, not at 1. One color is
//               exactly the old single-color look. Note: that short vector
//               also keeps the specular lobe itself faint (unchanged here).
//   glow        static additive bloom of the rim and halo gradients, scaled
//               by glow (0 = off, exact old look). With e = (dist - R) / R:
//               rim  exp(-(e / edge)^2) * rim, brightest on the outline;
//               halo exp(-2 e / spread) * halo outside the outline, fading
//               outward. Added after the bubble/halo mix.
//   The color arrays are indexed through the binding (L.$.t.rimColors[i]),
//   not the T copy: dynamic indexing needs a memory view.
//   The hole itself is not drawn here: the lens only bends the backdrop.
//   alpha       premultiplied, so a transparent backdrop (VortexSnapshot over
//               the app) stays transparent: the bent backdrop keeps its own
//               alpha, halo and rim paint toward opaque, bloom and specular
//               are additive light (rgb may exceed alpha). Over an opaque
//               backdrop alpha is 1 everywhere: the old look exactly.
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

  let hue = fract(atan2(rel.y, rel.x) / 6.28318530718 + 0.5);
  let haloN = clamp(i32(T.haloCount), 1, 6);
  let haloPos = hue * f32(haloN);
  let haloI = min(i32(floor(haloPos)), haloN - 1);
  let haloCol = mix(
    L.$.t.haloColors[haloI].rgb,
    L.$.t.haloColors[(haloI + 1) % haloN].rgb,
    haloPos - f32(haloI)
  );

  var mask = 0.0;
  var halo = 0.0;
  var lit = vec3f(0.0);
  var litA = 0.0;
  var bloom = vec3f(0.0);
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
    let sMid4 = textureSampleLevel(L.$.backdrop, L.$.samp, gi / dims, 0.0);
    let sMid = sMid4.rgb;
    let sR = textureSampleLevel(L.$.backdrop, L.$.samp, (gi + dir * (ca + chromaPx)) / dims, 0.0).r;
    let sB = textureSampleLevel(L.$.backdrop, L.$.samp, (gi - dir * (ca + chromaPx)) / dims, 0.0).b;
    let interior = mix(sMid, vec3f(sR, sMid.g, sB), edgeFactor);

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
    let specN = clamp(i32(T.specCount), 1, 6);
    let specPos = clamp((1.0 - specDot / 0.72111) * 4.0, 0.0, 1.0) * f32(specN - 1);
    let specI = min(i32(floor(specPos)), max(specN - 2, 0));
    let specCol = mix(
      L.$.t.specColors[specI].rgb,
      L.$.t.specColors[min(specI + 1, specN - 1)].rgb,
      specPos - f32(specI)
    );

    let rimN = clamp(i32(T.rimCount), 1, 6);
    let rimPos = hue * f32(rimN);
    let rimI = min(i32(floor(rimPos)), rimN - 1);
    let rimGrad = mix(
      L.$.t.rimColors[rimI].rgb,
      L.$.t.rimColors[(rimI + 1) % rimN].rgb,
      rimPos - f32(rimI)
    );
    let rimCol = mix(rimGrad, rainbow, T.rainbow);
    let withRim = mix(interior, rimCol, edgeFactor * T.rim) + rimCol * (edgeFactor * T.rim / 3.0);
    lit = withRim + specCol * spec;
    litA = mix(sMid4.a, 1.0, clamp(edgeFactor * T.rim, 0.0, 1.0));

    if (T.glow > 0.0) {
      let e = (dist - R) / R;
      let rimW = max(T.edge, 0.02);
      let haloW = max(T.spread, 0.02);
      let rimGlow = exp(-(e * e) / (rimW * rimW)) * T.rim;
      let haloGlow = exp(-2.0 * max(e, 0.0) / haloW) * smoothstep(-rimW, 0.0, e) * T.halo;
      bloom = (rimCol * rimGlow + haloCol * haloGlow) * T.glow;
    }
  }

  let cr = textureSampleLevel(L.$.backdrop, L.$.samp, (g + dir * ca) / dims, 0.0).r;
  let cg4 = textureSampleLevel(L.$.backdrop, L.$.samp, g / dims, 0.0);
  let cb = textureSampleLevel(L.$.backdrop, L.$.samp, (g - dir * ca) / dims, 0.0).b;
  let outside = mix(vec3f(cr, cg4.g, cb), haloCol, halo);
  let outsideA = mix(cg4.a, 1.0, clamp(halo, 0.0, 1.0));
  let rgb = mix(outside, lit, mask) + bloom;
  return vec4f(rgb, clamp(mix(outsideA, litA, mask), 0.0, 1.0));
}`
  .$uses({ L: lensLayout, horizonOf })
  .$name("lensFs");
