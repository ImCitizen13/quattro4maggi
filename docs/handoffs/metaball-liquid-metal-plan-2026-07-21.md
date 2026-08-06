> **STATUS (shipped):** built and merged. See `docs/liquid-metal-metaball.md`
> for what actually shipped (and where it diverged: `float4` balls, prev/next
> buttons instead of pan-scrub, erode-dissolve, optional density bridge). This
> file is kept as the original design record.

> **Resume:** read this, then `git log -5 --oneline && git status`. The
> pipeline doc (`docs/liquid-metal-path-sdf.md`) is the reference for *how
> things work today*; this handoff is the **agreed plan** for the metaball
> effect — nothing below is built yet.

# Metaball Liquid Metal — Design Plan (2026-07-21)

**Branch:** `expo-metal-shader` · **Demo:** `src/app/liquid-metal/index.tsx`
**Status:** planned, not started. Head is `23aa8b6` (two-slot SDF morph +
bake cache).

## The effect (user's intent)

1. The shape contains N **metaballs** that morph between paths and wear the
   liquid metal (bands, edge, AA all follow the *fused* field).
2. **Tap** = balls disperse outward from center, then spring back.
3. **Pan left/right** = new gesture to change the shape (replaces the tap-to-
   cycle that exists today).

## Decisions locked with the user

| Question | Decision |
|---|---|
| Rest look | **Crisp path, balls hidden.** Balls sit inside the silhouette at rest (union changes nothing → zero regression to today's look). They emerge only on tap. |
| Ball count | **`ballCount` prop, default 16.** Tunable on-device. |
| Pan behavior | **Interactive scrub.** Drag X drives `iMorph` directly; release snaps forward (past threshold) or back. |

Two smaller calls made by me (change if wrong):
- **Scrub + tap concurrency**: let both animate at once (independent
  uniforms, compose fine). Not gated.
- **Ball sites during scrub**: use the **nearer** shape's sites (snap at
  m=0.5), not blended — balls are invisible at rest so it never shows.

## Why this does NOT hit the gooey-border wall

The 128-ball cliff was **fragment fill = balls × supersampling² × an
offscreen ×PixelRatio layer** (see auto-memory `gooey-border-128-cliff-
fragment-fill`, `gooey-border-highdpi-shader-cost`). The current SDF
renderer already deleted both multipliers: AA is analytic (`smoothstep` on
the field, no supersampling) and it draws direct to one `<Fill>` with no
offscreen round-trip.

| | gooey-border | this |
|---|---|---|
| balls | 128 | 16 |
| supersampling | 4–9× | 1× (analytic AA) |
| offscreen layer | yes | no |
| ball-evals / logical px | ~1150 | ~16 |

~50–70× headroom, and the ball loop only runs *during* the tap animation.

### Graphics techniques applied (the "performance in mind" ask)

- **Smooth-max union, NOT smooth-min.** This codebase is *positive-inside*,
  so union of fields is a smooth MAX. Ball SDF = `r − length(p − c)`.
  `d = smax(dPath·bodyFade, maxᵢ(rᵢ − |p−cᵢ|), k)`.
- **True distances, not a `Σ r²/d²` density field.** The classic sqrt-free
  metaball threshold isn't a distance — bands are isolines at fixed *pixel*
  spacing and `depth`/`edge`/AA all need real pixel units, so a density
  field would warp the bands near every ball. One sqrt/ball is cheap
  (dedicated GPU hardware); correctness wins.
- **Uniform-branch early-outs**: `iBallCount==0` skips the whole loop (idle
  = today's exact cost); an AABB (`iBallCluster`) around the active cluster
  lets untouched tiles bail as a coherent warp.
- **Constant loop bounds** (SkSL is ES2-ish); inactive balls get `r=0`,
  which `smax` ignores.

## Build order

### Step 0 — De-risk spike (~10 min, FIRST)
Confirm SkSL `uniform float3 balls[16]` compiles and takes a flat
`number[]` in RN Skia 2.4.18 (types show uniforms as `number[]`, arrays
*should* pack, unverified). **Fallback if rejected:** pack balls into a
16×1 `RGBA_F32` texture — `pathSdf.ts` already has the exact packing code.
Only the upload path differs; everything downstream is identical. Report
which path before building the real shader.

### Step 1 — Shader (`SdfLiquidMetal.ts`)
Add `iBalls[N]` (xy = center in texel space, z = radius), `iBallCount`,
`iBodyFade`, `iBallCluster`. Compose the field with `smax` + finite support
+ the two early-outs above. Balls inside the silhouette at rest = no-op.
On tap, `bodyFade` recedes the core so the balls emerge and the smooth-max
grows the gooey necks that stretch and snap.

### Step 2 — Ball sites (`metaballSites.ts`, new)
Cash in the `sample`/`gradient` API the bake already exposes. Stride-sample
field candidates → greedy Poisson pick by depth → `rᵢ = min(rMax, d(cᵢ))`
(wall-aware sizing = roadmap step 2). Precompute per-ball dispersion
dir/mag. Cache beside the SDF; A→B index morph via the same 1:1 wrapping
`ParticlePathAssembly` uses.

### Step 3 — Prewarm (REQUIRED by interactive scrub) — `usePathSdf.ts`
Scrub blends toward a neighbor's field, which must already exist — a 1.1s
bake mid-drag would freeze the gesture. On shape settle, idle-bake prev+next
shapes into the existing module cache (via `InteractionManager` or a
low-priority microtask). First-ever swipe may still catch one cold bake;
acceptable, document it.

### Step 4 — Orchestrator (`MetaballLiquidMetal.tsx`, new)
Owns gestures + shared values; keeps `SdfLiquidMetalShader` presentational.
- **Tap** → `dispersion`: `withSequence(withSpring(1), withSpring(0))`.
  Per-ball position = `rest_i + dir_i · dispersion · mag_i` in the uniform
  worklet (JS thread idle during the burst).
- **Pan** (RNGH 2.30, already installed) → drag X drives `iMorph` toward the
  neighbor (both slots live); release snaps fwd/back via the morph spring.
  Wraps the shape list.

### Step 5 — Wire into demo + verify on-device
Swipe to scrub logos, tap to burst. Confirm idle cost unchanged (React
profiler), morph + dispersion compose cleanly. Replaces tap-to-cycle.

## Known risks / open

- **Uniform-array support** is the one load-bearing assumption (Step 0 gates
  it). Texture fallback ready.
- **Cold first swipe**: pan onto an un-prewarmed shape still eats one ~1.1s
  bake. Step 3 covers neighbors; a truly-cold shape (first of a session)
  will jank once. The deeper fix (progressive/JSI bake) is in the pipeline
  doc's bake-cost section, out of scope here.
- Deps confirmed present: `react-native-gesture-handler ~2.30`,
  `react-native-reanimated 4.2.1`, `pressto ^0.6`.

## Prior roadmap this subsumes / touches

- Roadmap **step 2** (field-driven targets + `min(rMax,d)` sizing) is
  literally Step 2 here — first real use of the JS `sample`/`gradient` API.
- Bubble containment (original handoff steps 3–5) is a specialization of
  this machinery: constrained drift instead of tap-dispersion.
- The two-slot morph (`23aa8b6`) is reused as-is for the scrub.
