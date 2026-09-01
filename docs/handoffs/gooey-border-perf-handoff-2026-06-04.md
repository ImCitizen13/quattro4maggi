> **Resume:** Read this top-to-bottom, then run `git log -3 --oneline && git status`. ⚠️ The solved state is in the **uncommitted working tree** — do NOT `git checkout`/`stash`/`reset` it away. The last *commit* is the regression. First action: verify the working tree matches "Shipped state" below, then commit it.

# Gooey Border — Performance Handoff (2026-06-04)

**Branch:** `demo/border-shader-test`
**Files (all modified, uncommitted):** `useGooeyBorder.ts`, `gooeyBorderShader.ts`, `shimiringGooeyBorderShader.ts`, `GooeyBorderView.tsx`, `ShimiringShader.tsx`, `GooeyBorder.tsx`
**Full detail report:** [`temp/reports/gooey-border-perf-fix-2026-06-04.md`](../../temp/reports/gooey-border-perf-fix-2026-06-04.md) · prior context: [`temp/reports/gooey-border-issue-summary.md`](../../temp/reports/gooey-border-issue-summary.md)

---

## Goal
128-ball metaball "gooey border" (Skia RuntimeEffect + Reanimated worklet) at **solid 120fps** on iPhone 16 Pro (ProMotion). Started at ~104fps with a 15% 60Hz-miss rate.

## TL;DR — SOLVED ✅
We chased a CPU red herring for two iterations (both regressed), then the profiler proved the real bottleneck was **GPU fill-rate from a high-DPI offscreen-layer render**, not CPU uniform writes. Removing the PixelRatio supersampling → **119.9fps, 0.1% miss, zero hitches.** The CPU-side buffer work we did is a minor, harmless bonus.

---

## What we did (chronological — each step was profiled)

| Step | Change | Result | Verdict |
|---|---|---|---|
| Baseline A | float4 buffer `(x,y,radius,type)`, 512 writes/frame, high-DPI render | 103.9 fps, 15.4% miss | start |
| `NEW_SOLUTION` | "Proposal A": dropped to **float2** `(x,y)`, derived radius + pulse **per-pixel in shader** (`sin`) | **52.5 fps** ❌ | GPU regression |
| `NEW_FIX` | Reverted to **float3** `(x,y,radius)`, dropped only unused `type`; kept high-DPI | 68.3 fps ❌ | still bad |
| `NO_PD` (**shipped**) | Removed PixelRatio supersampling everywhere; kept float3 | **119.9 fps, 0.1% miss** ✅ | SOLVED |

### 5-way profiler comparison
| | Baseline A | Smooth (64 balls) | NEW_SOLUTION | NEW_FIX | **NO_PD** |
|---|---|---|---|---|---|
| Effective fps | 103.9 | 120.0 | 52.5 | 68.3 | **119.9** |
| Median delta | 8.29 ms | 8.33 ms | 16.65 ms | 16.67 ms | **8.32 ms** |
| p90 | 17.26 | 8.61 | 25.57 | 17.22 | **8.77** |
| Max | 17.81 | 13.51 | 59.20 | 33.97 | **16.81** |
| >16.7ms (60Hz miss) | 15.4% | 0% | 40.7% | 43.4% | **0.1%** |
| >33ms hitch | 0 | 0 | 1 | 1 | **0** |

---

## The issues & root causes

1. **Misdiagnosis (the long detour).** Earlier investigation (see issue-summary report) blamed CPU-side `number[]` writes hitting Hermes' `DictPropertyMap` slow path, and theorized a "256-writes/frame ProMotion cliff." We optimized writes (512→256). It regressed. **The writes were never the binding constraint for this render config.**

2. **The actual bottleneck: high-DPI offscreen-layer render.** Commit `cf9510f` had added "high-DPI rendering": `pd = PixelRatio.get()` (=3 on device), `u_resolution *= pd`, positions `*= pd`, and a `<Group scale(1/pd)>` wrapping `<Group scale(pd) layer={<Paint><Shader/></Paint>}>`. The `layer` forces a **full-screen offscreen at `width·3 × height·3` (~9× the texels)** plus a downscale resample. Trace signature: Metal encoder max ~8ms, `resample_horizontal`, `_platform_memmove`, `_platform_memset`. This 9× fill blew the GPU budget every frame → display locked to 60Hz.

3. **Why "Proposal A" (float2) made it far worse.** It moved per-ball radius + pulse into the fragment shader as a per-pixel `sin` over 64 floating balls. At 9× DPI that's ~1.7B sin/frame → 52fps. (At *logical* res the same code is ~21M sin/frame = trivially cheap — it only regressed because of the DPI multiplier.)

---

## Shipped state (verify the working tree matches this)

- **Buffer = `float3` `(x, y, radius)`**, `MAX_META_BALLS * 3` = **384 writes/frame** at 128 balls. (`type` dropped — shaders never read `.w`. `radius` kept in-buffer as a cheap `ball.z` lookup — NOT derived per-pixel.)
- **No PixelRatio supersampling.** Positions written in **logical points** (no `* pd`); `u_resolution = (width, height)`.
  - `GooeyBorderView`: plain `<Rect width height>` with `<Shader>`, **no layer**.
  - `ShimiringShader`: **keeps its `layer`** (required — it captures `children` as the refraction `image` uniform) but at **logical res** (removed the `scale(pd)` double-transform). Keeps `u_time` (rotating specular).
- **Phase-1 CPU win retained:** gather-endpoint trig hoisted out of the per-ball loop (computed once/frame, not 128×).
- Math is fully normalized by `u_resolution`, so dropping `pd` changed **only raster resolution, not layout** — visually safe (slightly softer edges on a low-frequency, smoothstep-antialiased blob).

**Type-checks clean** (`bunx tsc --noEmit`, no errors in `border-shader/`). **Not yet committed.**

---

## Gotchas (hard-won — don't relearn)

- ⚠️ **Measure the GPU encoder, not CPU writes, first.** This animation is **fill-rate bound**. CPU-write optimizations are invisible while the GPU is over budget.
- ⚠️ **The `layer={<Paint>…}` + `scale(pd)` trick = a full-screen offscreen at pd² the texels.** That was the entire regression. Same pattern lives in **`WabiTimerExperiment.tsx`** (see Next).
- **Don't derive per-ball radius/pulse in the fragment shader** to shrink the buffer — per-pixel `sin × balls` compounds with any supersampling. Keep per-ball data in the buffer.
- **Reanimated needs a fresh array reference** to propagate a SharedValue → the double-buffer swap (`BUF_A`/`BUF_B`, `writeToggle`) is load-bearing; don't collapse it.
- **No zero-copy uniform path exists** (verified against Skia **2.6.4** source): both the JS `processValue` and the C++ `setUniform` marshal element-by-element; `Float32Array` is spread into a `number[]`. A version bump won't help. There's also **no public GPU-buffer API**.

---

## Next steps / open items

1. **Commit the working tree.** It's the solution; the last commit (`e40b78a "Move radius computation from JS to shader"`) is the 52fps regression. Suggested message: "Revert high-DPI supersampling; keep float3 buffer — restores 120fps at 128 balls."

2. **Check `src/components/wabi-and-more/WabiTimerExperiment.tsx` — same risk.** It uses the identical `pd` + `layer` + double-transform trick on a **full-screen** canvas (lines ~64, 232–234, 285–294), with a *heavier* per-pixel shader (`BShader`: refraction/dispersion/specular, ~10 `eval`/`sample` per pixel) and the layer wrapping `StarsShader` + ~46 bubbles + indicator. **But the fix is NOT a copy-paste:** unlike the soft gooey blob, BShader's refraction rims/chromatic dispersion are high-frequency edges where supersampling is *visually justified*. → **Profile it first.** If it drops frames, prefer a **reduced** factor (`pd * 0.5` ≈ 1.5×, ~2.25× cost vs 9×) to keep rim sharpness, rather than full logical res.

3. **Investigate the encoder/CPU doubling (not urgent — doesn't cost frames today).** NO_PD trace shows ~2× CPU/sec (426 ms/s) and **~1.7 Metal encoders per frame** (extra draw passes). Likely sources: the `ShimiringShader` `saveLayer` (if traced in dark mode), and/or in-canvas `ColorPickerSkia` + `SKText` + background `Rect`/`StarsShader`. **First confirm which mode (light `GooeyBorderView` vs dark `ShimiringShader`) was traced.** Matters only if you later push more balls / a heavier shader.

4. **(Optional) "Lighter format" rewrite — only if you become fill-bound at logical res.** Pass ball data as an **RGBA_F32 data texture** instead of a uniform array: write into a `Float32Array` (Hermes fast indexed path, dodges `DictPropertyMap`), upload via `Skia.Data.fromBytes(new Uint8Array(f32.buffer))` (bulk memcpy — verified `SkData::MakeWithCopy`) + `Image.MakeImage(info, data, bytesPerRow)`, sample with `image.eval(float2(i+0.5, 0.5))`. Pack `(x, y, radius)` per texel → no per-pixel `sin`, no element-by-element marshalling. **Available in current 2.4.18.** Risks: per-frame `SkImage` alloc (GC), RGBA_F32 sampled-texture support varies by backend, `image.eval` is nearest-neighbor in pixel space. Prototype + profile before committing. *Not needed for the current goal.*

---

## Refs
- `src/components/border-shader/useGooeyBorder.ts` — worklet, float3 buffer, gather hoist
- `src/components/border-shader/GooeyBorderView.tsx` — plain logical `<Rect>` (light mode)
- `src/components/border-shader/ShimiringShader.tsx` — logical `layer` for refraction (dark mode)
- `src/components/border-shader/{gooey,shimiringGooey}BorderShader.ts` — `float3 u_balls[]`
- Commit `cf9510f` — the high-DPI commit we reverted
- Commit `e40b78a` — the float2 regression (current tip; superseded by working tree)
- Memory: `gooey-border-highdpi-shader-cost` — the one-line lesson
