# Gooey Border — Supersampling / Smoothness Handoff (2026-06-04)

> **Resume:** Read this top-to-bottom, then `git log -5 --oneline`. The branch is
> `demo/border-shader-test`. Everything described here is **committed** (clean tree).
> This is the third handoff in a chain — read the other two first if you need depth:
> - [`gooey-border-perf-handoff-2026-06-04.md`](./gooey-border-perf-handoff-2026-06-04.md) — how we got to 120fps (the float3 / logical-res fix).
> - [`gooey-border-edge-aa-2026-06-04.md`](./gooey-border-edge-aa-2026-06-04.md) — the analytic edge antialiasing.

---

## The goal
A 128-ball metaball "gooey border" (Skia RuntimeEffect + Reanimated worklet) that is
**both** silky-smooth (no pixelated edges, no jaggy Skia text) **and** holds **120fps**
on iPhone 16 Pro (ProMotion). Demo lives at `src/app/gooey-border/`.

## Where we are — short version
- **Performance: SOLVED at logical res.** 119.9fps, 0.1% miss, 0 hitches.
- **Edge smoothness: two complementary fixes shipped** — analytic 1px AA (free) + optional partial supersampling (`SUPERSAMPLE_SCALE`).
- **One open item:** the chosen supersample factor (`0.75`) is only validated at **64 balls**. It must be re-profiled at the **128-ball default** before it's declared final. See [Open items](#open-items).

---

## Commit chain (all on `demo/border-shader-test`)
| Commit | What |
|---|---|
| `dd3a3cf` | Perf fix: revert high-DPI supersampling, keep float3 buffer → 120fps at 128 balls. |
| `a1a4454` | Analytic 1px edge AA in both shaders (drop fixed `u_threshold`). |
| `9892bfb` | Partial supersampling (`PixelRatio × SUPERSAMPLE_SCALE`), shader-as-layer-Paint sandwich. |

Prior tip `e40b78a` ("Move radius computation … to shader") is the **52fps regression** — superseded; don't resurrect it.

---

## The three smoothness levers (and how they interact)

1. **Analytic edge AA (always on, free).** SkSL has no `fwidth()`, so the iso-surface mask uses `aa = 1.0 / u_resolution.y` (the field is height-normalized on both axes → that's exactly one pixel), `smoothstep(aa, -aa, field)`. Files: `gooeyBorderShader.ts`, `shimiringGooeyBorderShader.ts`. This alone makes the silhouette smooth at logical res with zero fill cost.

2. **Partial supersampling (tunable).** `SUPERSAMPLE_SCALE` in `constants.ts` (currently **0.75**). `ss = PixelRatio.get() * SUPERSAMPLE_SCALE`. Each shader view renders into an offscreen at `ss×` then downsamples.
   - `1.0` = full PixelRatio → ~9× fill → **crosses the perf cliff** (was 52fps). Don't ship.
   - `0.75` = ~2.25× → ~5× fill → 120fps at **64 balls** (see open item).
   - `0.0` = logical res, relies on lever #1 only.

3. **(Not done) GPU position pre-pass.** The original CPU headline was the **uniform writes** (384 floats/frame). The only GPU-side way to cut those is a data-texture pre-pass (compute positions in a ~128-invocation GPU pass, upload ~nothing). Documented as "option 4" in the perf handoff. **Deemed unnecessary** (CPU is not the bottleneck — ~3ms/frame of an 8.3ms budget) and risky (per-frame `SkImage` alloc/GC, RGBA_F32 support variance). Parked.

---

## ⚠️ Hard-won architecture facts (don't relearn these)

- **`fragCoord` space depends on how the shader is attached.**
  - Shader on a `<Rect>`/`<Fill>` → `fragCoord` is **logical** → keep `u_resolution` logical.
  - Shader as a **layer's Paint** (`layer={<Paint><Shader/></Paint>}`) → `fragCoord` is **device-space** → you scale `u_resolution × ss` and ball positions `× ss`.
  - We use the **layer-Paint** form for both shaders. That's why `useGooeyBorder` writes positions `× ss` and the views set `u_resolution = [w*ss, h*ss]`. The normalized `ball / u_resolution` math is scale-invariant, so layout is unchanged — only raster density moves.

- **A `scale(1/ss)`→`scale(ss)` sandwich with an _empty_ `<Paint/>` layer does NOTHING.** The two scales cancel (`S(1/ss)·S(ss)=I`) and the empty layer just re-captures at native res. We tried this; changing `SUPERSAMPLE_SCALE` had zero effect. **The supersampling comes from the shader being the layer Paint with scaled `u_resolution`, not from the transform sandwich itself.** (Burned ~an hour here.)

- **Don't scale `u_resolution` while the shader sits on a `<Rect>`.** `uv = fragCoord/u_resolution` then only reaches `1/ss` → blob renders zoomed-in and shoved into a corner, spilling past the canvas. (We hit exactly this symptom.)

- **`u_refraction` / `u_dispersion` are in pixels** → when the shimmer renders at `ss×`, scale them by `ss` too (done in `ShimiringShader.tsx`) so the refraction _looks_ identical, just sharper. `u_refractionDepth` is normalized (uv) → leave it.

- **Cost ≈ fill × ball_count.** The fragment shader loops over all balls per pixel. So `2.25× fill @ 64 balls ≈ logical @ 128 balls` (why the 64-ball test looked free), and `2.25× @ 128 balls ≈ 2.25× the proven baseline`. The perf cliff sits lower (in supersample factor) as ball count rises.

- **Don't move the path/position math into the fragment shader.** It runs per-pixel × per-ball = the `NEW_SOLUTION` 52fps regression. Keep path math on the CPU worklet.

---

## Where the pieces live
- `src/app/gooey-border/index.tsx` — route.
- `src/components/border-shader/GooeyBorder.tsx` — composition; light mode (`GooeyBorderView`) vs dark mode (`ShimiringShader`) by color scheme. Text/picker are siblings in light mode, children of the shimmer layer in dark mode.
- `src/components/border-shader/useGooeyBorder.ts` — the worklet: float3 buffer, double-buffer swap (`BUF_A`/`BUF_B`, `writeToggle`), positions written `× ss`. **Gather-endpoint trig is hoisted** out of the per-ball loop.
- `GooeyBorderView.tsx` / `ShimiringShader.tsx` — shader-as-layer-Paint + scale sandwich, `u_resolution × ss`.
- `gooeyBorderShader.ts` / `shimiringGooeyBorderShader.ts` — `float3 u_balls[]`, analytic AA.
- `constants.ts` — `SUPERSAMPLE_SCALE`, `MAX_META_BALLS` (= `BORDER_META_BALLS 64` + `MOVING_META_BALLS 64` = 128).

---

## Open items

1. **🔴 Re-profile `SUPERSAMPLE_SCALE = 0.75` at the full 128 balls.** This is the gating task. The 120fps result is from a **64-ball** run. If 0.75 holds 120fps / 0 hitches at 128, it's final. If it slips, step down toward `0.5` (~1.5× → ~1.5× baseline work) until clean. Profiler can only run on-device — the agent can't do this; prompt the user.

2. **(Quick CPU headroom, optional, un-done) Lean up the worklet.** Not the bottleneck, but cheap insurance for the 128-ball supersample since the frame callback shares the UI thread with the render:
   - Hoist `ballRadiusVal`/`pulseIntensityVal`/`borderThicknessVal` `.value` reads out of the two loops (~320 getter calls/frame → ~5).
   - Precompute the unit blob-target vectors (`computeBlobTargets`): `dirLen` is the constant `ringScale`, so the per-frame `Math.sqrt` (64×/frame) + divides are pure waste — store `nx/ny`.

3. **Light-mode render sanity check.** `GooeyBorderView`'s gooey shader has **no** `uniform shader image` and gets empty `children`, so it relies on the layer filling the canvas bounds (matches `cf9510f`, but that was only ever profiled in dark mode). If light mode comes up blank/black, the fix is: add an unused `uniform shader image;` to `gooeyBorderShader.ts` + pass a `<Fill/>` child, mirroring the proven shimmer path.

4. **Dark-mode rim fringe.** Analytic AA smooths the silhouette; the chromatic-dispersion rim is high-frequency color that only supersampling helps. Should be covered now by `0.75`; confirm visually.

5. **Doc bookkeeping.** Once #1 lands, record the final factor here and in the edge-AA doc.

---

## Quick verification for the next agent
```
git log -5 --oneline                      # expect 9892bfb on top
bunx tsc --noEmit | grep border-shader    # expect clean
grep SUPERSAMPLE_SCALE src/components/border-shader/constants.ts   # expect 0.75
```
Then build to device and do Open item #1.

## Memory
- `gooey-border-highdpi-shader-cost` — the original one-line lesson (fill-rate, not CPU writes, was the dominant cost).
