# Liquid Metal — Path SDF Pipeline

How the liquid metal effect follows an arbitrary SVG path via a baked signed
distance field (SDF), and how the edge-jaggedness problem was solved.

**Files:**

| File | Role |
|---|---|
| `src/lib/shaders/pathSdf.ts` | CPU bake: path → signed distance field (+ JS samplers) |
| `src/lib/shaders/SdfLiquidMetal.ts` | SkSL shader: bands/mask/edge all derived from the field |
| `src/components/liquid-metal/SdfLiquidMetalShader.tsx` | Component: fits path, bakes, feeds the shader |

**Origin:** `docs/handoffs/liquid-metal-path-sdf-handoff-2026-07-17.md` (design + API research).

---

## The core idea

The metal bands are `fract(direction)` — they are **contour lines of whatever
scalar field `direction` is**. The old `SvgLiquidMetalShader` used a rotated
linear ramp (straight parallel stripes) and scissored the picture with a path
clip; the stripes knew nothing about the shape.

Here `direction` = *signed distance from the path outline*, so the contour
lines are offset copies of the outline itself, nested inward like tree rings.
One field answers every question:

| Question | Answer |
|---|---|
| Inside the shape? (mask — **no clip needed**) | `d > 0`, antialiased with `smoothstep` |
| Near the edge? (bevel/contour shading) | small positive `d` |
| Where do the bands go? | isolines of `d`, marching with `-t` |
| How big can a bubble at `c` be? (planned) | exactly `d(c)` — distance to nearest wall |

Noise is demoted, not deleted: it wobbles the isolines but no longer decides
where the metal flows.

## The bake (`pathSdf.ts`)

1. Draw the path filled white into an offscreen surface, `readPixels` →
   coverage grid (Skia's antialiased rasterization).
2. Seed two grids from coverage (see "Edge quality" below) and run the
   **Felzenszwalb exact Euclidean distance transform** — two O(n) passes:
   distance-to-outside (depth when inside) and distance-to-inside (distance
   when outside). Subtract → signed field, **positive inside, in pixels**.
3. Two outputs from one bake:
   - a JS `Float32Array` with `sample(x,y)` / `gradient(x,y)` helpers — for
     future bubble-containment physics (a few array reads per frame on the JS
     side, per the gooey-border finding that fragment fill is the wall and
     CPU-side work is cheap);
   - the field normalized to `0.5 + 0.5·d/maxDist`, uploaded once as an
     `RGBA_F32` image → child shader. Render cost: **one texture read per
     pixel**. `iSdfMax` reconstructs pixel units in SkSL.

Bake cost is one-time at mount inside a `useMemo` keyed on path+size (a few ms
at 200²). Re-baking per frame (morphing paths) would need a different route
(polyline uniforms or a coarse GPU bake).

### Why CPU bake (vs the alternatives)

- **Skia's internal SDF renderers**: computed and discarded inside the
  renderer; never reach SkSL, switches not bound by RN Skia. Unusable.
- **Analytic SDF in SkSL**: can't express an arbitrary SVG `d` string.
- **Per-pixel distance loops in the shader** (polyline uniforms, raymarching a
  mask): pays per-frame-per-pixel for what a bake pays once — the same
  fragment-fill wall that stalled `PathMaskShader` (16 rays × 40 steps/px).
- **GPU bake**: RN Skia offscreen surfaces are 8888-only, and the result is
  not JS-readable for physics without a readback.

## Edge quality: subpixel EDT seeding (fix, 2026-07-17)

**Symptom:** jagged staircase on diagonal edges — repeated in *every* band,
since mask, edge and bands all derive from the same field.

**Cause:** the first bake binarized the AA rasterization (`alpha > 127`)
before measuring distances. That collapses the coverage ramp into hard pixel
blocks, so the zero-isoline snaps to the pixel lattice (±0.5px wiggle) and the
staircase gets baked into the field.

**Fix:** coverage and edge position are the same information — a pixel that is
75% covered has the true edge ~0.25px from its center:

```
  ┌─────────┐
  │░░░░╱████│   75% covered
  │░░░╱█████│   → edge sits ~0.25px left
  │░░╱██████│     of this pixel's center
  └────•────┘
```

So edge pixels seed the EDT with fractional squared distances instead of
binary 0/INF:

| Coverage `a` | `distToOutside` seed | `distToInside` seed |
|---|---|---|
| `a ≥ 1` (interior) | INF | 0 |
| `a ≤ 0` (exterior) | 0 | INF |
| edge pixel | `max(0, a−0.5)²` | `max(0, 0.5−a)²` |

The EDT itself is unchanged — it now measures to points on the *true curve*
instead of a staircase. Same trick SDF font atlases use to stay crisp at 4×
upscale. Cost: zero (smarter init loop).

### Known remaining artifacts

- **Residual softness/ripple on diagonals:** the field is baked at logical
  points but displayed at device pixel ratio (~3× finer). Fix when needed:
  bake at 2–3× resolution (EDT is O(n), one-time; F32 texture grows 16
  bytes/px). Not yet applied.
- **Bright seams along stroke centers, triangles at corners:** the **medial
  axis** — isolines of a distance field genuinely crease where two walls are
  equidistant. Geometry, not sampling. `distortion` noise partially hides it;
  the planned bubble gradient-ascent motion exploits it (the ridge is the
  attractor bubbles climb toward).

## Debug view

`debug` prop on `SdfLiquidMetalShader` renders the raw field: green inside /
red outside ramps, isoline rings every 8px, white line at the zero crossing.
In the demo, long-press the ghost button to toggle. A broken bake is obvious
on sight here — verify this view first when touching `pathSdf.ts`.

## Not yet built (handoff steps 3–5)

Bubble containment (`radius = min(r_max, d(c))`) and gradient-ascent motion
with momentum, consuming the JS-side `sample`/`gradient` that the bake already
exposes.
