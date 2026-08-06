> **Resume:** Read this, then `git log -6 --oneline && git status`. This is a **design handoff, not a checkpoint** — no SDF code exists yet. The API research below is *verified against the installed Skia* (file:line cited); do not re-derive it. The open work is building the distance-field bake, starting at "Next — step 1".

# Liquid Metal — Path SDF / Bubble Containment Handoff (2026-07-17)

**Branch:** `expo-metal-shader`
**Verified against:** `@shopify/react-native-skia` **2.4.18 (m144)** — note `.claude/CLAUDE.md` still claims 2.2.12, worth correcting.
**Related:** `src/lib/shaders/PathMaskShader.ts` (WIP, commit `01a7eb1` "incomplete"), memories `gooey-border-128-cliff-fragment-fill`, `gooey-border-highdpi-shader-cost`.

---

## The goal

Make the liquid metal effect **follow an SVG path** instead of being driven by Perlin noise and then hard-clipped to the path. Two sub-goals, both served by the same distance field:

1. **Bands that follow the outline** rather than a rotated linear ramp.
2. **Self-contained "bubbles"** (the `iShape=4` metaballs) that live *inside* the letterform — pinching in thin strokes, swelling in bowls, flowing along its spine — instead of being sliced by a clip that they know nothing about.

---

## Key insight — the hook into the existing shader

**The metal bands are the isolines (level sets) of one scalar field, `direction`.**

At `ExpoLiquidMetal.ts:324-331` the stripes are just `fract(direction ± dispersion)`, and `direction -= t` (line 302) makes those isolines march. Everything above line 302 only *builds* that field:

```
direction = grad_uv.x           // rotated linear ramp → straight parallel stripes
          + diagBLtoTR          // shear
          - 2.0 * noise * ...   // noise BENDS the isolines; it does not create the metal
```

So "follow a path instead of noise" is **not a rewrite** — it's swapping what feeds `direction`. Noise stays, demoted from *shaping the flow* to *organic wobble* (`ExpoLiquidMetal.ts:287`).

---

## Design decision — LOCKED

**Parallel bands (SDF isolines), fed by a CPU-baked distance field.** Rejected alternatives and why:

| Option | Verdict |
|---|---|
| Bands **parallel** to outline (`direction = sd(path)`) | ✅ chosen — defined everywhere, reuses `edge`/`opacity`, 1 texture read |
| Bands **flowing along** outline (arc length) | ❌ needs nearest-point search; medial-axis seams crease every filled stroke. Viable *only* as a separate stroke-only variant |
| Analytic SDF (math in SkSL) | ❌ exact + free, but can't express arbitrary SVG |
| Polyline in uniforms (`ContourMeasureIter`) | ⚠️ keep in pocket — only route that yields arc length, and makes morphing paths free |
| GPU bake (`Surface.MakeOffscreen`) | ⚠️ fast, but 8-bit only, and not readable for physics |
| **CPU bake (EDT → `Image.MakeImage`)** | ✅ chosen — see below |

**Why CPU bake wins** — and note this is *not* primarily the precision argument: it leaves a `Float32Array` in JS that a worklet can sample. Bubble centres are ~5 points, so containment physics costs **5 lookups per frame on the JS side** instead of 5 texture reads **per pixel**. Per the gooey-border memories, fragment fill is the wall and CPU uniform writes are already cheap — so this spends on the correct side.

---

## The bubbles — how they should look

Two moves, both nearly free once the SDF exists:

**1. Containment via radius.** A ball at `c` stays inside iff radius = `min(r_max, d(c))`, because `d(c)` *is* the distance to the nearest wall. No clip; geometrically guaranteed. Free gift: bubbles auto-pinch in narrow strokes and swell in bowls — mercury in a tube. This single line buys most of the look.

**2. Motion via gradient, NOT skeleton extraction.**

> ⚠️ **Do not try to extract the medial axis.** Ridge extraction from a rasterized field is noise-sensitive; every small bump on the outline sprouts a spurious branch.

The medial axis *is* the ridge of `d`, so a bubble that climbs `∇d` finds it by itself:

```
velocity = α·∇d              // climb to the spine, stay centred
         + β·perp(∇d)        // travel along it
```

No skeleton, no arc length, no extraction. This also *dissolves* the medial-axis objection that killed the arc-length flavour — here the axis is the attractor, not an artifact.

**Known catch:** `perp(∇d)` flips sign across the ridge (two bubbles either side swim opposite ways) and `∇d` goes degenerate on it. **Fix:** give each bubble momentum — keep its velocity and blend toward the target rather than snapping, which picks a consistent side.

---

## API research — VERIFIED, do not re-derive

**Skia *does* have distance-field renderers — they are unusable for this.** (An earlier claim that Skia has no SDF at all was wrong; the corrected reason is what matters.)

```
fDisableDistanceFieldPaths = false   // cpp/skia/include/gpu/ganesh/GrContextOptions.h:234
fMinDistanceFieldFontSize  = 18      // .../GrContextOptions.h:202, graphite/ContextOptions.h:87
```

These are **on/off tuning booleans on the GPU context** selecting an internal rasterization strategy. The field is coverage-for-antialiasing, computed inside the renderer and discarded — never queryable, never reaches SkSL. RN Skia doesn't bind `GrContextOptions`, so the switches aren't even reachable. **The capability exists; the surface to use it does not. Build it yourself.**

Everything needed to do so is present (paths relative to `node_modules/@shopify/react-native-skia/lib/typescript/src/skia/types/`):

| Need | API | Notes |
|---|---|---|
| Offscreen bake | `Surface.MakeOffscreen(w, h)` | **8888 only** — no ColorType param; `SurfaceFactory` doc pins "SRGB / Unpremul / 8888". No float surface possible. |
| Read field into JS | `Image.readPixels(...)` → `Float32Array \| Uint8Array` | `Image/Image.d.ts:123` |
| Upload float field | `Image.MakeImage(info, data, bytesPerRow)` | `Image/ImageFactory.d.ts:80` — `ImageInfo.colorType` accepts `RGBA_F16` / `RGBA_F32` |
| Pass SDF to SkSL | `makeShaderWithChildren(uniforms, children)` | `RuntimeEffect.d.ts:27`; already how `PathMaskShader` receives `image` |
| Smooth reconstruction | `FilterMode.Linear`, `MipmapMode` | `Image/Image.d.ts:14-22` |
| Arc length (pocket option) | `ContourMeasureIter` → `.next()`, `.length()`, `.getPosTan(d)` | `ContourMeasure.d.ts` — `getPosTan` returns position **and tangent**, so flow direction is free |

**Precision note:** an 8-bit channel gives 256 distance levels — workable via a clamped band + linear filtering (a distance field is near-linear near the edge and interpolates cleanly; same property that keeps SDF fonts crisp at 4× upscale), or pack across two channels for 16 bits. The `RGBA_F32` CPU route sidesteps it entirely. **Don't preemptively optimize for precision** — the CPU route is chosen for JS-readability, and float just comes along.

---

## ⚠️ Perf landmine — read before touching PathMaskShader

`PathMaskShader.ts:82-96` (`getDistanceFromEdge`) fires **16 rays × up to 40 steps = up to 640 texture samples per pixel, every frame**, to recover a distance the bake gives in **one read**. This is a strong candidate for why commit `01a7eb1` stalled as "incomplete", and it is the same fragment-fill wall documented in the gooey-border memories. **The bake replaces this function outright — do not try to optimize it in place.**

---

## Next — build order

1. **Felzenszwalb exact Euclidean distance transform (CPU), + a debug view that dumps the field.** Do this first and alone: it's either right or obviously wrong on sight, and everything else depends on it. Two O(n) passes, run once inside and once outside, subtract → signed field. ~50 lines, no jump-flood ping-pong needed. Budget: one-time at mount, inside a `useMemo` keyed on `svgPath`.
   - Pipeline: `Skia.Path.MakeFromSVGString` (already at `SvgLiquidMetalShader.tsx:202`) → draw filled white into `Surface.MakeOffscreen` → snapshot → `readPixels()` → EDT → keep `Float32Array` → `Image.MakeImage` w/ `RGBA_F32` → child shader.
2. **Feed `direction` from the field** — `direction = sd(path) * cycleWidth - t`. Bands should become offset contours of the outline.
3. **Derive `edge`/`opacity` from the same field** → `getShapeEdge` becomes `getShapeSdf`; the analytic shapes (`iShape` 0-4) become just one SDF source among several.
4. **Delete the clip in `SvgLiquidMetalShader`** — see "Architectural win" below.
5. **Bubble containment** (`radius = min(r_max, d(c))`), then **gradient-ascent motion** with momentum.

---

## Architectural win (the reason this is worth doing)

`SvgLiquidMetalShader` currently **only clips**. `Skia.Path.MakeFromSVGString` (line 202) feeds a clip, while the shader underneath still computes `edge` from `iShape`'s analytic circle/diamond (`ExpoLiquidMetal.ts:166-233`). **So the bevel and contour logic is shaped for a circle and then scissored into a logo.** Once the shader has a real SDF of the path, `edge` and `opacity` both derive from it, the clip disappears, and contour/bevel effects finally follow the actual outline. One field then drives the mask, the bands, the containment, and the flow.

---

## File inventory — `src/components/liquid-metal/`

| File | Shader source | Role |
|---|---|---|
| `LiquidMetalShader.tsx` | `liquidMetal.tsx` (simplex) | Original paper-design port; silver only |
| `PerlinLiquidMetalShader.tsx` | `PerlinLiquidMetal.ts` | Perlin + 9 metal presets |
| `ExpoLiquidMetalShader.tsx` | `ExpoLiquidMetal.ts` | Perlin + presets + iridescence. **Primary target for the SDF work** |
| `SvgLiquidMetalShader.tsx` | `ExpoLiquidMetal.ts` | SVG path **clipping** + 3D bevel. **Where the clip dies** |
| `SensorLiquidMetalShader.tsx` | `SensorLiquidMetal.ts` | Gyroscope-reactive (`useAnimatedSensor`); physical device only |
| `CurlLiquidMetalShader.tsx` | `CurlLiquidMetal.ts` | Curl (divergence-free) noise — swirling/fluid variant |
| `utils.ts` | — | `extractPathsFromSvg` — regex `d=` scrape, joins all paths into one string |
| `README.md` | — | **Stale**: omits `CurlLiquidMetalShader`, `PathMaskShader`, `SvgBlendShader` |

Related shaders in `src/lib/shaders/`: `PathMaskShader.ts` (WIP — see landmine), `SvgBlendShader.ts` (9 lines), `ColorsLiquidMetal.tsx` (presets + `getMetalColors` / `interpolateMetalColors`).

**Minor issues spotted while inventorying (not blocking, uncommitted-fix candidates):**
- `CurlLiquidMetalShader.tsx:165` exports a function named **`PerlinLiquidMetalShader`** while compiling `curlLiquidMetalShader` (line 222) — copy-paste artifact. Harmless (separate module) but confusing.
- `ExpoLiquidMetalShader.tsx:7` imports `perlinLiquidMetalShader` and never uses it — dead import.

---

## Open question for the owner

Whether the *flowing-along-the-path* look (metal circulating through the letterform via arc length) is actually the goal. If so it needs the **polyline/`ContourMeasureIter` route as a separate stroke-only variant**, where the medial-axis seam never surfaces — not a modification of the parallel-bands work above. The gradient-ascent bubble motion may well scratch that itch without it.
