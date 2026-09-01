# Gooey Border Perf — full session handoff · 2026-06-19 20:07

> **Resume guide for a fresh agent.** Read this top-to-bottom, then look at the final report at `temp/reports/gooey-border-final-report.md` for the long-form story. Don't re-explore the codebase blind — the relevant files and current state are listed below.

---

## Where the user is

- **Investigation is essentially done.** The performance issue is solved; the demo ships at 120fps on iPhone 16 Pro.
- **Two possible next directions** the user is weighing:
  1. **Write a dev.to blog post** about the journey ("React Native Skia at 120fps, but with some sacrifices" — title basically decided)
  2. **Start the react-native-wgpu + TypeGPU rewrite** to push past the Skia architectural ceilings for future demos with higher ball counts
- Branches: `demo/border-shader-test` has the perf work. Main project may be on a different branch (e.g. `testflight`) for unrelated TestFlight prep. The branches have likely diverged; sync as needed.

---

## What the work was

A React Native metaball border animation rendered with Skia (`RuntimeEffect`) + Reanimated worklets. Initial symptom: visible stutter on iPhone 16 Pro, ProMotion display locked at 60Hz instead of 120Hz, ~42% of frames overshooting 16.7 ms.

**Root cause: Hermes' computed-property-write path.** Each frame was building a `number[]` of `N × 4` floats and assigning it to a SharedValue. The writes (`buffer[idx] = x` style) hit `putComputedWithReceiver_RJS` — Hermes' slow path. At 192 balls × 4 fields = 768 writes/frame, the worklet ran ~17 ms per frame, missing the 8.33 ms ProMotion budget and the 16.7 ms 60Hz fallback.

**Confirmed via Instruments** (Metal System Trace + Time Profiler). GPU was not the bottleneck — encoder times stayed sub-millisecond throughout. The hot functions across every CPU-heavy trace were `Interpreter::interpretFunction`, `putComputedWithReceiver_RJS`, `HiddenClass::findProperty`, and `_xzm_xzone_malloc_tiny`/`_xzm_free`.

**The cliff** is at writes-per-frame, not at ball count:

```
256 writes/frame  →  120fps, 0% miss   (fits in 8.33ms)
512 writes/frame  →  104fps, 15% miss  (borderline)
768 writes/frame  →   80fps, 42% miss  (broken)
```

---

## Phases tried (chronological)

| # | Phase | Result |
|---|---|---|
| 1 | **Double-buffered module-scope arrays** — alternate `BUF_A`/`BUF_B`, flip a `writeToggle` SharedValue each frame so Reanimated sees a new reference | ✅ **Shipped.** 80 → 104 fps. Killed per-frame allocation. |
| 2 | Per-ball SharedValues (scratch-2d-type-gpu pattern) | ❌ Reverted. +80% CPU, no fps gain. Pattern works at ~32 elements, fails at ~192. |
| 3 | `Float32Array` typed buffer | ❌ Skia binding rejects: `Incorrect uniform size for: u_balls. Expected 512 got 4`. Skia reads `BYTES_PER_ELEMENT` (4) as length. `Array.from(float32Array)` workaround defeats the saving. |
| 4 | Reduce ball count from 192 → 64 | ✅ **120 fps, 0% miss.** Validated the cliff theory. |
| 5 | Buffer shape `vec4 → vec3` + shader-side radius/pulse + full PixelRatio supersampling (3×) | ❌ Crashed to 52 fps. PixelRatio = 9× pixel cost crossed the GPU pixel-fill cliff. |
| 6 | Revert buffer-shape, keep PixelRatio | ⚠️ 68 fps. Eliminated catastrophic frames but still locked at 60Hz. PixelRatio was the dominant remaining cost. |
| 7 | Drop PixelRatio entirely (logical-resolution rendering) | ✅ **120 fps, 0.1% miss.** |
| 8 | Partial supersampling at `PixelRatio × 0.75 ≈ 2.25×` via layer-Paint sandwich | ✅ **Final shipping config.** 120 fps, 0.1% miss, sharper edges, supports rendering children inside the metaball. |

---

## Final shipping configuration (Phase 8)

- **Ball count:** 64 total. 256 writes/frame fit comfortably in the 8.33 ms budget.
- **Buffer:** double-buffered `number[]` at module scope, alternating reference flip per frame.
- **Buffer layout:** `vec3` per ball (x, y, radius). Type field removed.
- **Supersampling:** `SUPERSAMPLE_SCALE = 0.75`, applied via the layer-Paint sandwich pattern:

```tsx
const ss = PixelRatio.get() * SUPERSAMPLE_SCALE;

<Group transform={[{ scale: 1 / ss }]}>
  <Group
    transform={[{ scale: ss }]}
    layer={<Paint><Shader source={GooeyBorderShader} uniforms={uniforms} /></Paint>}
  >
    {children}
  </Group>
</Group>
```

- **AA strategy:** `smoothstep` on the field iso-surface inside the shader. Low-frequency metaball edges don't benefit from supersampling beyond ~2.25× on this hardware.

---

## Architectural ceilings (don't retry)

- **Skia uniform binding does not accept typed arrays.** `Float32Array` reads as length 4. Confirmed independently in scratch-2d-type-gpu's perf doc. The workaround (`Array.from`) defeats the entire point.
- **Per-ball SharedValues scale poorly past ~100 elements.** scratch-2d's pattern works at ~32 bodies; at 192 the JSI access overhead exceeds the writes it replaces.
- **`useDerivedValue` for shader uniforms can't avoid the per-frame allocation.** Skia unwraps exactly one layer of SharedValue. Nested SharedValues inside the uniforms object are not resolved.
- **Reanimated needs a new array reference** to propagate a SharedValue change. Mutating a single buffer in place is silently a no-op.
- **ProMotion variable refresh masks CPU savings that don't cross the 8.33 ms cliff.** Always measure relative to the cliff, not absolute fps.
- **Apple GPU dynamic clock-state ramp is real and non-monotonic.** A "lighter" shader at a low clock can perform *worse* than a heavier one that triggers a higher clock state. Observed when the shimmer/refraction shader felt smoother despite more per-pixel work.
- **Supersampling has a cliff too.** On iPhone 16 Pro: 2.25× safe, 3× breaks GPU pixel fill.

---

## Files that matter

- `src/components/border-shader/useGooeyBorder.ts` — the hook with the double-buffered frame callback. Module-scope `BUF_A`/`BUF_B`. Phase 1 fix lives here.
- `src/components/border-shader/GooeyBorderView.tsx` — the Skia view with the layer-Paint supersampling sandwich. Phase 8 lives here.
- `src/components/border-shader/gooeyBorderShader.ts` — the SKSL fragment shader.
- `src/components/border-shader/shimiringGooeyBorderShader.ts` — the prismatic refraction variant, with rainbow rim and chromatic aberration. Uses `image.eval` to sample the background.
- `src/components/border-shader/constants.ts` — `MAX_META_BALLS`, `BORDER_META_BALLS`, `MOVING_META_BALLS`, `SUPERSAMPLE_SCALE`, `BORDER_META_BALL_SCALE_FACTOR`.

---

## Tooling we built

- `temp/testing/analyze-trace.py` — Python 3 script that runs `xcrun xctrace export` against `.trace` bundles, computes frame-cadence stats (percentiles, 7-bucket histogram, % >16.7ms), encoder duration distributions, hang counts, and (with `--funcs`) Time Profiler thread + leaf-function breakdowns. Accepts multiple traces for side-by-side comparison. Caches exports at `/tmp/_xt_<hash>_*.xml`. README at `temp/testing/README.md`.
- 8 `.trace` files in `temp/` covering the full investigation:
  - `gooey-shader-test-double-buffer.trace` (Phase 1 baseline)
  - `gooey-shader-test-split-shared-value.trace` (Phase 2 — reverted)
  - `gooey-shader-test-double-buffer-low-count.trace` (Phase 4 — 64 balls)
  - `gooey-shader-NEW_SOLUTION.trace` (Phase 5 — regression)
  - `gooey-shader-NEW_SOLUTION_FIX.trace` (Phase 6 — partial recovery)
  - `gooey-shader-NEW_SOLUTION_NO_PD.trace` (Phase 7)
  - `gooey-shader-NEW_SOLUTION_NO_PD_AA.trace` (Phase 7 with AA)
  - `gooey-shader-NEW_SOLUTION_WITH_PD_.trace` (Phase 8 — final)

---

## Reports already written

All inside `temp/reports/`:

- **`gooey-border-final-report.md`** — comprehensive 10-section write-up. The Phase 1–8 history, the cliff finding, final config, all architectural ceilings, the WGPU forward-look, and "key lessons for future-me." This is the canonical reference.
- `gooey-border-perf-investigation.md` — earlier (Phase 1–2 era) write-up, partially stale. Headline conclusion ("Option A wins") is correct but the report doesn't cover Phases 4–8.
- `gooey-border-issue-summary.md` — concise architecture + cliff + caveats summary. Shorter than the final report.

---

## What the user is considering next

### Option A: Write a dev.to blog post

- Title nearly settled: **"React Native Skia at 120fps, but with some sacrifices"**
- Format: "detective story" post-mortem genre (recommended structure already discussed)
- Target length: 1,800–2,500 words (8–12 min read)
- 11-section outline already drafted: hook → setup → wrong answer → diagnosis → cliff → what I tried → breakthrough → plot twist → final config → what I'd do next → takeaways
- Should reference but not reproduce the analyze-trace.py script

### Option B: Start the WGPU + TypeGPU rewrite

- Goal: bypass Skia's uniform-marshalling ceiling, push to 500–1000+ balls
- Architecture: react-native-wgpu + TypeGPU + compute shaders + GPU storage buffer
- The plan:
  - Worklet writes ~6 scalar uniforms per frame (mode, time, blob center, etc.) — Hermes barely involved
  - Compute pass: one thread per ball, computes positions from uniforms + static data, writes to storage buffer
  - Render pass: fragment shader reads positions from storage buffer
- **Reference implementation:** `/Users/meltohamy/Projects/experiments/type-gpu-app/components/scratch-2d-type-gpu` — a 2D physics engine using this exact pattern at ~32 bodies. Study `metaball/scene.ts` and `metaball/shaders.ts` first.
- **Pitfalls already identified:**
  - Skia ↔ WGPU does not compose. This is a new view, not a refactor of `GooeyBorderView`.
  - Shimmer/refraction shader (`shimiringGooeyBorderShader.ts`) needs porting to WGSL — `image.eval` pattern shaped differently in WGPU.
  - Requires Expo dev client (not Expo Go).
  - Android Vulkan support in react-native-wgpu was incomplete at last check — verify before committing.
  - Worklet ↔ WGPU render loop coordination is the rough edge. Two frame loops that don't naturally sync.
- **Suggested scope:** start with proof-of-concept in a separate route, don't replace the Skia path until POC validates the toolchain on the user's specific RN/Reanimated/Expo versions.

---

## Working hypotheses about state of the branch

- `demo/border-shader-test` has the perf history (Phases 1, 4, 7, 8 lived there at various points). Current state should be Phase 8 (shipping config).
- Main project may be on `testflight` for unrelated work. The user's actively iterating on multiple branches.
- The user has been hand-editing files between turns. **Don't assume the file state from old context** — re-read affected files before changing them. `git status` and a quick `Read` are cheap.

---

## Things the user wants the new agent to know

- **They prefer terse explanations and concrete numbers over generic framing.** Lead with the change and the measured result, not the narrative.
- **They have strong intuitions and will push back when you're hand-wavy.** "Smaller is better" is not an answer — "5× fewer pixels = ~5× less GPU fragment work" is.
- **They like trade-off tables.** When recommending an approach, contrast against alternatives.
- **They want trace-driven validation.** When you propose a change, also propose the metric you'd watch in the resulting trace to confirm it worked.
- **They'll do the edits themselves most of the time.** Spec changes precisely; don't auto-apply without sign-off.
- **For the blog post specifically:** they want to *tell a story*, not write a tutorial. Lean into the wrong-hypothesis-first arc and the failed experiments.

---

## How to start the new chat

Paste this handoff in. Then ask one question:

> *"Are we writing the blog post or starting the WGPU POC?"*

- If **blog post**: open `temp/reports/gooey-border-final-report.md`, then draft the hook + opening 3 sections using the detective-story structure. Target the outline above.
- If **WGPU POC**: open `/Users/meltohamy/Projects/experiments/type-gpu-app/components/scratch-2d-type-gpu/metaball/`, read `scene.ts` and `shaders.ts` first, then sketch a feature-parity POC route for the gooey border in WGPU. Reference scratch-2d's worklet ↔ WGPU integration pattern. Don't touch the existing Skia path; build alongside it.
