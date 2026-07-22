# Liquid Metal — Metaball Burst

Tap the liquid-metal shape and it **dissolves into metaballs** that fling out,
optionally strung together with thin gooey necks, then springs back into the
shape. Buttons cycle the shape (the previous field melts into the next).

Built on top of the [Path SDF pipeline](./liquid-metal-path-sdf.md); the metal
bands/edge/AA are unchanged — only the *field* they read is now a fused one.

**Files:**

| File | Role |
|---|---|
| `src/lib/shaders/MetaballLiquidMetal.ts` | SkSL shader: distance-max union of path + balls, plus the density bridge |
| `src/lib/shaders/metaballSites.ts` | CPU: pick ball centers/radii from the baked field; pack the `float4[16]` uniform |
| `src/components/liquid-metal/MetaballLiquidMetal.tsx` | Orchestrator: gestures, shared values, uniforms, prev/next buttons |
| `src/components/liquid-metal/TuningSlider.tsx` | Minimal shared-value slider for live tuning |
| `src/hooks/usePathSdf.ts` | Bake cache + `prewarmPathSdf` (idle-bake neighbours) |

**Origin:** `docs/handoffs/metaball-liquid-metal-plan-2026-07-21.md` (the plan).
This doc describes what actually shipped, including where it diverged.

---

## The field

At rest the shader is byte-identical to the path-only SDF metal: `iBallCount`
is 0, the ball loop is branched out entirely, `main` reduces to the pure path
field. The balls only participate during a burst.

During a burst the fused field is built in `sdField`:

1. **Erode the body.** `dP - erode`, where `erode = iBodyErode × maxInside`.
   On tap `iBodyErode` ramps to ~1.15, marching the outline inward past the
   medial axis so the solid core *dissolves* — at full burst only the balls
   remain. (Eroding, i.e. subtracting, is the correct recede; multiplying the
   signed field toward 0 would collapse the outline everywhere and flood the
   frame.)
2. **Union the balls (smooth-max).** This codebase is positive-inside, so a
   union of fields is a smooth **max**. Each ball's SDF is `r − |p − c|`.
   `dBase = smax(dP − erode, maxᵢ(rᵢ − |p − cᵢ|), k)`, `k` = "stickiness".
3. **Density bridge (optional).** The smooth-max can only bridge a gap ~`k/4`
   wide, so far-apart balls detach. A **summed-density** field bridges them
   instead: each ball adds a smooth finite kernel `(1 − x²)²` (support =
   `radius × reach`), and because contributions *add*, two balls whose supports
   overlap sum over a threshold and connect with a thin neck that stretches and
   snaps as they separate. Fused as `mix(dBase, max(dBase, dBridge), iBridge)`
   so the body/ball bands stay on true distances — only the thin string regions
   come from density.

Ball positions are packed live in `packBalls` (a worklet): per ball,
`center + dir · dispersion · mag · spread`, radius `r · ballScale`.

## Gestures

- **Tap → burst.** `Gesture.Tap().onEnd` (NOT `onStart` — it doesn't fire
  dependably on a Skia `<Canvas>`) drives `dispersion` on the UI thread:
  `withSequence(withSpring(1, OUT), withSpring(0, BACK))`.
- **Prev/Next buttons → cycle shape.** A committed change loads the new field
  into the hidden slot of the two-slot morph and springs `iMorph` toward it, so
  shapes melt/fuse instead of popping.

## The knobs

All are live `SharedValue`s on the UI thread (no React re-render per tick).

| Knob | Prop | What it does |
|---|---|---|
| **Stickiness** | `ballSmooth` | Smooth-max neck width, as a fraction of shape depth (shape-invariant). Keep LOW — see caveats. |
| **Spread** | `spread` | Multiplier on how far balls fly. Low = stay close (sticky); high = detach. |
| **Size** | `ballScale` | Multiplier on ball radius. Rest is unaffected (balls hidden). |
| **Stringiness** | `stringiness` | Density-kernel reach (× radius). Higher = strings hold across bigger gaps. Needs `bridge`. |
| — | `bridge` | Enable the density bridge. `false` = byte-identical distance-only fallback. |
| — | `ballCount` | Max balls placed (fewer if the shape is too thin). |

Fixed shaping constants (tuned on-device, in the component): `BRIDGE_THRESHOLD`
(string thickness) and `BRIDGE_SCALE` (density→px). Burst springs are in
`src/lib/animations/constants.tsx`.

**Sticky-burst rule of thumb:** balls stay connected while `stickiness ≳ 4 ×
spread`. For distinct-balls-with-strings, turn `bridge` on and keep stickiness
low — let the bridge do the connecting.

## Prewarm

The EDT bake is ~1.1–1.6s. On shape-settle, `prewarmPathSdf` idle-bakes the
prev/next shapes (via `InteractionManager.runAfterInteractions`, one at a time)
into the module cache, so the next button press lands on a warm field instead
of a synchronous bake. First-ever shape of a session still bakes cold once.

## Caveats

- **Reform pop scales with stickiness.** High `ballSmooth` merges the balls
  hard into the body, so the last moments of the spring-back carry a visible
  bulge that pops as it settles. Mitigations already in place: `BACK` is
  slightly overdamped with `overshootClamping` (dispersion never dips below 0,
  so `iBodyErode` never goes negative and the `iBallCount` cutoff isn't
  re-crossed), and `iBridge` fades out with dispersion so the clustered rest
  density can't bulge. The remaining lever is **keeping stickiness low**
  (default `0.03`).
- **Cold first bake.** The very first shape of a session bakes synchronously
  (~1.1–1.6s). Prewarm covers every shape after that.

## Divergences from the plan

| Plan | Shipped | Why |
|---|---|---|
| `float3 balls[16]` | **`float4`** | Padding-invariant array stride; `w` doubles as the inactive-ball kill flag. |
| Pan-scrub to change shape | **Prev/Next buttons** | `Gesture.Race(pan, tap)` swallowed the tap on the Canvas; buttons remove the conflict. |
| `bodyFade` multiply | **`iBodyErode` subtract** | Multiplying the signed field toward 0 floods the frame; eroding is the correct recede. |
| Smooth-max only | **+ optional density bridge** | Smooth-max makes rounded merges; density is the only way to get thin stretch-and-snap strings. |
