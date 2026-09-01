> **Resume:** Read this, then `git log -6 --oneline && git status`. This branch holds an **investigation checkpoint** (profiling instrumentation + isolated UI), not a clean shippable state — see "Cleanup before shipping". The perf root cause is now *confirmed*; the open work is tuning + cleanup, not more diagnosis.

# Gooey Border — Fragment-Fill Handoff (2026-06-25)

**Branch:** `demo/border-shader-test`
**Note:** `docs/` and `temp/` are **gitignored** — this handoff and the reports below are on-disk only, not in git.
**Companion docs (local):** `temp/reports/gooey-border-perf-fix-2026-06-04.md`, `temp/skia-shader-performance/gooeychat_2.md`, and the earlier (now partly superseded) `docs/handoffs/gooey-border-perf-handoff-2026-06-04.md`.
**Memories:** `gooey-border-128-cliff-fragment-fill`, `gooey-border-highdpi-shader-cost`.

---

## ROOT CAUSE — confirmed (do not re-investigate)

The 128-ball frame cliff is **GPU fragment fill**, not CPU. Cost ≈ **`active_balls × (PixelRatio × SUPERSAMPLE_SCALE)²`** — the per-pixel metaball loop runs once per ball per pixel, and supersampling multiplies the pixel count. Triangulated June 2026 on **Galaxy S24 (Perfetto)** and **iPhone 16 Pro (Instruments)**:

- **CPU writes ruled out** — in-worklet `performance.now()` bracket: ~0.46ms avg; on missed frames writeMs median 0.34ms, max 0.90ms (0/157 over 2ms). The `float3` + double-buffer fix already put writes on a fast indexed path.
- **Skia marshalling ruled out** — holding `u_balls` at 384 floats but forcing `u_ballCount=64` was clean; marshalling identical clean vs janky.
- **Fill confirmed** — dropping to logical res at full 128 balls was clean on both devices (S24 123.9fps/0.0%, iPhone 119fps/0.3%).
- Cost model (work units = balls × (ss·pd)²): **128@0.75 ≈ 648 (janky)**, 64@0.75 ≈ 324 (clean edge), 128@logical ≈ 128 (clean). **Cliff ≈ 324–648.**

⚠️ A **WGPU/TypeGPU rewrite will NOT fix this** — it targets CPU marshalling/Hermes writes, which are already cheap. The fill cliff needs a *rendering-strategy* change (see "Next").

---

## Current state

**Already committed** (`dd3a3cf`, `a1a4454`, `9892bfb`):
- `float3` ball buffer `(x, y, radius)` — `type` dropped; 384 writes/frame at 128.
- Analytic 1px edge AA in the shaders; fixed `u_threshold` removed.
- Partial supersampling: `GooeyBorderView`/`ShimiringShader` render into a `PixelRatio × SUPERSAMPLE_SCALE` offscreen layer, then downsample. `SUPERSAMPLE_SCALE = 0.75`.

**Staged in this checkpoint commit** (3 files — investigation scaffolding):
- `constants.ts`: `BORDER_META_BALLS`/`MOVING_META_BALLS` restored to **64 + 64 = 128**.
- `useGooeyBorder.ts`: `PROFILE_WRITES = true` (live worklet-body timing, logs every 60 frames + on >12ms frames — **deliberately NOT `__DEV__`-gated**); `A3_ACTIVE_BALLS` toggle (currently `null` = no-op); profiling scratch SharedValues.
- `GooeyBorder.tsx`: `StarsShader`, `ColorPickerSkia`, `ColorPickerTouch`, and the picker-toggle `PressableScale` **commented out** (isolated for profiling).

Type-checks clean (`bunx tsc --noEmit`, no `border-shader/` errors).

---

## ⚠️ Known issue with the current config

**128 balls @ `SUPERSAMPLE_SCALE = 0.75` ≈ 648 work units → over the cliff (janky).** The constants comment still says 0.75 is "120fps … at 64 balls" with a "pending re-profile at 128" note — that re-profile happened and it's janky at 128. To ship 128 balls smoothly:
- Set **`SUPERSAMPLE_SCALE ≤ ~0.5`** (≈288 work units, under the cliff on a 3× device), **or** cut active ball count.

**Doc bug:** `constants.ts` comment claims `0.0 = logical res`. That's wrong — `ss = PixelRatio × SUPERSAMPLE_SCALE`, so `0.0 → ss=0 → zeroed positions + /0 resolution → blank`. Logical res is `SUPERSAMPLE_SCALE = 1 / PixelRatio` (≈0.33 on a 3× device). Fix the comment.

---

## Cleanup before shipping (next agent)

1. **Pick a shippable `SUPERSAMPLE_SCALE`** for the 128-ball default (≤0.5) and re-profile to confirm; update the constants comment + fix the `0.0 = logical` error.
2. **Remove the profiling scaffolding** in `useGooeyBorder.ts`: `PROFILE_WRITES`, the `performance.now()` brackets, `profSum/profMax/profCount`, the `[gooey-spike]`/`[gooey-prof]` logs, and the `A3_ACTIVE_BALLS` toggle (restore `useSharedValue(totalBalls)`).
3. **Restore the commented-out UI** in `GooeyBorder.tsx` (stars/picker/toggle) — or confirm with the owner if they were intentionally removed.

---

## Next — only if you need MORE balls than the budget allows

The fill cost is fundamental to the brute-force per-pixel metaball loop. To scale further:
1. **Low-res field texture + upsample** — render the SDF/smin field into a small offscreen, then upsample. Cuts pixel_count for the expensive loop.
2. **Spatial culling** — skip balls whose influence can't reach the current pixel (tiling / per-region ball lists), so the inner loop isn't `for all balls` every pixel.
3. Lower `SUPERSAMPLE_SCALE` / fewer active balls (the cheap levers already in hand).

NOT a lever: CPU/uniform path (already cheap), data-texture for positions (helps marshalling, not fill), WGPU/TypeGPU.

---

## Refs
- `src/components/border-shader/constants.ts` — `SUPERSAMPLE_SCALE`, ball counts (+ the doc bug)
- `src/components/border-shader/useGooeyBorder.ts` — worklet, `float3` buffer, profiling scaffolding to strip
- `src/components/border-shader/GooeyBorderView.tsx` — partial-supersample layer (light mode)
- `src/components/border-shader/ShimiringShader.tsx` — same, dark mode (layer also feeds refraction `image`)
- `src/components/border-shader/{gooey,shimiringGooey}BorderShader.ts` — `float3 u_balls[]`, analytic edge AA
