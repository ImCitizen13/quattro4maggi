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

The bake runs at **device pixel ratio** (capped at 3×) so the field matches
the physical pixel grid — fix B, 2026-07-17. The component scales the path and
dimensions before baking; the shader maps logical fragCoords into texture
space via `iSdfScale`, and `PathSdf.scale` records the factor for JS-side
consumers (multiply logical coords by it before `sample`/`gradient`, divide
sampled distances by it).

**Bake cost (measured 2026-07-19, dev build on iOS sim): ~1.1s at 750²,
~1.5s at 1050×750** — not "a few ms" as previously assumed. Profile: raster
10ms / seed 60ms / **EDT 950ms** / pack+upload 70ms. The Felzenszwalb passes
are O(n) but Hermes has no JIT, so interpreted-JS loop cost dominates.
`usePathSdf` therefore keeps a module-level cache (SVG-string sources only,
keyed source+size, cap 6 ≈ 11MB/entry): logo cycling and StrictMode
double-renders re-bake nothing — verified on-device, 5 bakes for two full
5-logo cycles. The *first* bake of a shape still blocks the JS thread ~1.1s
(this is what delays the morph start on a fresh shape); typed text misses
the cache by construction (fresh `SkPath` per keystroke). Candidate fixes if
it matters: progressive two-phase bake (coarse field immediately, full-res
swap async), a native/JSI EDT, or a lower `pixelScale` for text.

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

A second cause was fixed the same day (fix B): the field was baked at logical
points but displayed at device pixel ratio (~3× finer), so each texel spanned
~3×3 physical pixels and amplified any residual wiggle. The bake now runs at
pixel ratio (see above). With A+B applied the silhouette renders clean —
verified on-device against before/after screenshots.

### Known remaining artifacts

- **Bright seams along stroke centers, triangles at corners:** the **medial
  axis** — isolines of a distance field genuinely crease where two walls are
  equidistant. Geometry, not sampling. `distortion` noise partially hides it;
  the planned bubble gradient-ascent motion exploits it (the ridge is the
  attractor bubbles climb toward).

## Text as path (2026-07-17)

The pipeline is source-agnostic: `SdfLiquidMetalShader` accepts either
`svgPath` (an SVG `d` string) or `path` (a ready `SkPath`, takes precedence;
copied before fitting, never mutated). Anything that produces an `SkPath`
gets the liquid metal treatment.

The demo uses this for **typed text**: one call turns a string into glyph
outlines —

```ts
const font = useFont(require(".../LobsterTwo-Regular.ttf"), 128);
const path = Skia.Path.MakeFromText(text, 0, 128, font); // baseline at y=128
```

— inside a `useMemo` keyed on `[font, text]`, so every keystroke re-bakes the
field live. Guard against empty/whitespace text (zero-area bounds) before
passing it down.

**Perf note:** the bake runs per keystroke on the JS thread; at demo size ×3
pixel ratio that's a ~1050×750 field per key. Fine in practice so far — if
typing ever stutters on device, debounce the bake or drop the text bake to
`pixelScale` 2.

## Demo interactions (`src/app/liquid-metal/index.tsx`)

- **Icon ↔ text mode morph:** a round pencil button springs into the text
  input (one `morph` shared value drives width/borderRadius via `interpolate`
  + `withSpring`; the two faces cross-fade in opposite halves so they never
  overlap, `pointerEvents` gated by mode). `mode` also decides what the shader
  renders: logos (tap to cycle) vs the typed text.
- **Keyboard:** `react-native-keyboard-controller` — `KeyboardProvider` wraps
  the app in `_layout.tsx`; the demo lifts its content with
  `useReanimatedKeyboardAnimation().height * 0.6` so the input clears the
  keyboard, frame-locked with the native animation in both directions.
  Requires a dev build containing the native module (red "doesn't seem to be
  linked" screen after a JS-only reload means rebuild with `expo run:ios`).
  Dismiss paths: background tap (full-screen `Pressable` → `Keyboard.dismiss`),
  the ✕ (collapses the morph too), or the Done key.

## Shape morph: two-slot field blend (2026-07-19)

Path changes melt from shape to shape instead of popping. The shader holds
**two field textures** (`iSdfTexA`/`iSdfTexB`, each with its own
max/maxInside) and blends their denormalized distances at `iMorph`
(0 = A, 1 = B); mask, bands, edge all derive from the blended field, so the
whole metal effect morphs coherently — the metaball fuse falls out of
thresholding the lerped fields. A static perlin bias on the morph parameter
(`m = iMorph + 1.4·noise·m(1−m)`, envelope zero at the endpoints) makes
regions flow unevenly — liquid melt, not a uniform dissolve.

**The slot dance (flash-proof by construction):** a new bake always loads
into the *hidden* slot, then the blend springs toward it
(`SPRING_SDF_MORPH`, 600ms, kicked via `queueMicrotask`). The
just-committed texture has zero weight under the current blend value, so
the new shape can never flash before the animation starts. (The first
attempt reset morph 0→1 on swap — the reset raced the React commit and the
new shape ghosted for a frame.) Mid-morph changes retarget from wherever
the blend is; a canvas resize snaps both slots to the new bake. All inside
`SdfLiquidMetalShader` — logo taps and text keystrokes morph with no
demo changes.

## Particle assembly (2026-07-18)

`src/components/liquid-metal/ParticlePathAssembly.tsx` — the path
particalized: dots scatter randomly, then swarm along curved paths and
assemble into the shape. Same `svgPath`/`path` API as the shader; in the demo
the grid/drop button toggles between metal and particle views.

**Pipeline:**

1. Rasterize the fitted path offscreen once; sample the filled area on a
   jittered stride-2 grid, shuffle (seeded PRNG), keep exactly `dotCount`
   targets — wrapping when the shape has fewer points, so every dot always
   has a destination and morphs keep a 1:1 dot mapping.
2. Per dot precomputed: start, quadratic-bezier control point, stagger
   window, size variance.
3. One `progress` value (linear timing) drives the swarm; per-dot ease-out +
   stagger live in the `useRSXformBuffer` worklet — JS thread idle during the
   animation.
4. Render = **one Atlas draw call**: a single soft-dot sprite, N RSXforms.

**Shape-to-shape morphs:** when the path changes, dots shift from the
previous shape's targets instead of re-scattering (previous targets held in a
render-phase ref; gentler bend 0.35 vs 0.8, tighter stagger 0.3 vs 0.45).
Random scatter happens only on first mount and tap-replay (seed bump). An
`onPress` prop can repurpose the tap — the demo uses it to cycle logos in
icon mode, morphing dots logo→logo.

**⚠️ Gotcha that cost a debugging round:** a `makeImageSnapshot()` of an
offscreen GPU surface is texture-backed and **silently draws nothing** in the
on-screen canvas's context — call `.makeNonTextureImage()` on it first. (The
SDF bake never hit this because it round-trips through `readPixels` CPU
data.) Also: kick shared-value animations from render via `queueMicrotask`,
not directly — Reanimated warns on render-phase writes.

**Verification status:** initial scatter→gather and tap-replay verified
on-device; logo→logo morph logic is in but its on-device check was cut short
— verify visually next session (toggle particles, tap the canvas twice: the
Expo→Apple transition should shift dots in place, never re-scatter).

## Mixed effect: MorphingLiquidMetal (2026-07-18) — PARKED

> **Status 2026-07-19:** the mixed effect is **not used by the demo anymore**
> — handoffs popped (hard mount/unmount cuts), and the cross-fade attempt on
> top made things worse, so both were reverted. The demo shows the two
> effects **separately** (metal shader / particle view, toggled). The
> component remains in the tree for a future attempt. The reverted work
> (roadmap step 2 field-sampling + cross-fades) is preserved in
> `docs/handoffs/liquid-metal-step2-crossfades-reverted-2026-07-19.patch`.
> Lesson for the next attempt: don't rely on Reanimated entering/exiting
> mount animations with heavy Skia canvases — build one component that owns
> **two stacked canvases** with explicit opacity shared values.

`MorphingLiquidMetal.tsx` mixes the two effects: shapes render as liquid
metal, and every path change transitions through particles — the metal
particalizes into dots pre-assembled as the old silhouette (seamless by
construction), the swarm morphs into the new shape, then the metal fades
back in (350ms FadeIn). Render-phase ref guard detects path changes (no
useEffect); mid-transition changes just retarget `to` and the mounted
particle view morphs in place. `ParticlePathAssembly` gained
`fromSvgPath`/`fromPath` (mount pre-assembled) and `onSettled` (timing
completion → `scheduleOnRN`). The demo's main display routes logo taps and
every keystroke through this.

## Shared bake: usePathSdf (roadmap step 1, 2026-07-18)

`src/hooks/usePathSdf.ts` owns the fit + bake, memoized per (source, size);
`fitPathToCanvas` is the single shared fitting function. Consumers:

- `SdfLiquidMetalShader` uses the hook internally, or accepts a pre-baked
  `sdf` prop (its internal hook no-ops on an empty source).
- `MorphingLiquidMetal` bakes **once per path change** and passes the field
  down — the bake runs while the particle transition plays, so the field is
  warm when the metal remounts on settle.
- `ParticlePathAssembly` shares `fitPathToCanvas`; its target sampling still
  rasterizes privately — replacing that with field-threshold sampling is
  roadmap step 2.

**Remaining roadmap** (agreed 2026-07-18): 2) field-driven targets + dot
sizing `min(r_max, d)`; 3) gradient-flow settle in the RSXform worklet
(needs a worklet-side bilinear sampler over the raw field); 4) metal-colored
dots from a snapshot of the rendered metal (Atlas `colors` buffer); 5)
~200ms cross-fade overlap at both handoffs. Then bubble containment
(original handoff steps 3–5) as a specialization of step 3's machinery.

## Debug view

`debug` prop on `SdfLiquidMetalShader` renders the raw field: green inside /
red outside ramps, isoline rings every 8px, white line at the zero crossing.
In the demo, long-press the ghost button to toggle. A broken bake is obvious
on sight here — verify this view first when touching `pathSdf.ts`.

## Not yet built (handoff steps 3–5)

Bubble containment (`radius = min(r_max, d(c))`) and gradient-ascent motion
with momentum, consuming the JS-side `sample`/`gradient` that the bake already
exposes.
