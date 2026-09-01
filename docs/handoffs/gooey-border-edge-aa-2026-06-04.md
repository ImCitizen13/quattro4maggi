# Gooey Border — Edge Smoothness (Antialiasing) (2026-06-04)

**Branch:** `demo/border-shader-test`
**Goal:** Keep the 120fps win (see [`gooey-border-perf-handoff-2026-06-04.md`](./gooey-border-perf-handoff-2026-06-04.md)) **and** get a smooth, non-pixelated blob edge.
**Files:** `gooeyBorderShader.ts`, `shimiringGooeyBorderShader.ts`, `GooeyBorderView.tsx`, `ShimiringShader.tsx`

---

## TL;DR — SOLVED ✅
Removing the high-DPI supersampling (the perf fix) exposed a **hard, near-binary blob edge** → stair-stepping. The old edge was never analytically antialiased; it leaned entirely on the 3× supersample to box-filter the silhouette smooth.

Fix: **analytic 1-pixel antialiasing in the shader.** SkSL has no `fwidth()`, so we compute the per-pixel field width as a constant from the resolution uniform. **Result: edges look identical to the old high-DPI supersampled render, at the full 120fps** (zero added fill cost).

---

## The issue
- **Symptom:** pixelated / stair-stepped blob silhouette after the perf fix.
- **Cause:** the iso-surface alpha was `smoothstep(0.0, -u_threshold, field)` with a *fixed* `u_threshold = 0.001`. `field` is normalized by canvas height, so that band is ≈0.8 logical pixels — effectively a hard edge.
- **Why it was hidden before:** the reverted `× PixelRatio` (=3) supersampling averaged 9 native samples per logical pixel, box-filtering the hard edge into a smooth gradient. Remove the supersample → the narrow band is exposed.

## Fixes attempted & results

| # | Approach | Edge quality | Performance | Verdict |
|---|---|---|---|---|
| 1 | **High-DPI supersampling** (`× pd` render + offscreen layer + downscale) | Smooth ✅ | **52–68fps**, 40%+ 60Hz-miss ❌ | rejected (perf) — see perf handoff |
| 2 | **Logical-res, fixed `u_threshold`** (shipped perf fix) | Pixelated ❌ | **119.9fps**, 0.1% miss ✅ | perf good, edge bad |
| 3 | **Analytic 1px AA** (`aa = 1.0 / u_resolution.y`) ← **NEW** | Smooth ✅ (identical to #1) | **119.9fps** ✅ | **SOLVED** |

> **Note on "identical results":** the analytic-AA edge is visually indistinguishable from the high-DPI supersampled edge (#1), but keeps the logical-res framerate of #2. Best of both.

## The new fix (shipped)

SkSL runtime effects expose **no** `fwidth`/`dFdx`/`dFdy`. Workaround: the field is normalized by `u_resolution.y` on **both** axes (the aspect correction `uv.x *= resX/resY` puts `uv.x` in height units too), so one device pixel = `1.0 / u_resolution.y` in field space. `u_resolution` is already a uniform, so no new plumbing.

```glsl
// before
float alpha = smoothstep(0.0, -u_threshold, field);   // u_threshold = 0.001, fixed

// after
float aa = 1.0 / u_resolution.y;        // exact one-pixel width in field units
float alpha = smoothstep(aa, -aa, field);
```

Applied to:
- `gooeyBorderShader.ts` — the `alpha` line (light mode).
- `shimiringGooeyBorderShader.ts` — the `shapeMask` line (dark mode). The wider `edgeFactor` rim band (`u_edgeWidth`) is a *feature*, left untouched.

Also removed the now-dead `u_threshold` uniform from both shaders **and** from the JS uniform objects in `GooeyBorderView.tsx` / `ShimiringShader.tsx` (Skia requires the uniform set to match the shader exactly).

### Design choices (vs. the generic workaround)
- **`1.0 / u_resolution.y`, not `1.0 / min(x, y)`** — height is the *exact* per-pixel value here; `min` picks width on a portrait canvas → over-soft band.
- **Symmetric `smoothstep(aa, -aa, field)`, not `smoothstep(0.0, -aa, field)`** — centers the AA band on the iso-surface instead of eroding the silhouette ~½px inward.

## Gotchas
- ⚠️ **No `fwidth()` in SkSL.** Don't reach for it — derive the pixel size from the resolution uniform.
- ⚠️ **Match the JS uniform set to the shader.** Dropping `u_threshold` from the shader requires dropping it from every `useDerivedValue` uniforms object too, or Skia errors.
- The AA width is a **single tunable dial**: tighter = `0.5 / u_resolution.y`, softer = `1.5 / u_resolution.y`.

## Proposed next options (if edges still aren't perfect)
1. **Tune the AA width** (above) — first lever, free.
2. **Shimmer rim fringe (dark mode only):** analytic AA fixes the *silhouette*; the chromatic-dispersion rim (`u_dispersion = 8px`) is genuinely high-frequency color and AA can't smooth it. If it sparkles, a **modest `pd * 0.5` supersample** (~2.25× fill vs the old 9×) would catch it where AA can't. Profile before adopting — same caveat as Wabi's BShader.
3. **Verify on device across sizes** — confirm the height-normalized `aa` holds on both portrait and any landscape/iPad layouts.

## Refs
- Perf handoff: [`gooey-border-perf-handoff-2026-06-04.md`](./gooey-border-perf-handoff-2026-06-04.md)
- Commit `dd3a3cf` — the perf fix (logical-res, float3 buffer) this AA work sits on top of.
- Reference repos reviewed (both render at logical res, no `pd` supersampling): enzo `scrollable-shapes` (worklet geometry → `PictureRecorder` → cached `Picture`), daehyeon `react-native-skia-lab/shader` (compact uniform array + `ImageShader` inputs).
