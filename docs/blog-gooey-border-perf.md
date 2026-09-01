# Chasing Frames: A Gooey Shader Performance Investigation

*React Native · Skia · Reanimated · ProMotion · GPU fill*

---

I've been building an animation demo app — a collection of Skia shader experiments in React Native. One of the effects is a "gooey border": a rounded-rectangle border made of metaballs that merge together with a smooth, liquid join. The balls animate along the perimeter in border mode and gather into a blob in the centre on a tap. It looks great. It also brought a 120Hz iPhone 16 Pro to its knees.

This post is the full story: the wrong guesses, the right measurements, the surprising villain, and the ProMotion twist that made iOS look worse than Android even though the GPU load was identical. More than a postmortem — it's a record of the **methodology** that actually cracked it. Each false lead taught something worth keeping.

---

## What the animation does

The shader is a standard SDF metaball renderer, written in SkSL (Skia's variant of GLSL, used via Skia `RuntimeEffect`). Every frame a Reanimated worklet computes N ball positions on the UI thread, packs them into a flat JS array, and hands it to the shader as a uniform. The shader runs once per pixel, iterating over all N balls and blending their signed-distance fields using `smin` — the "smooth minimum" function that creates the gooey merge.

The architecture in one line:

```
JS Worklet (UI thread) → packed float array → SKSL shader (GPU)
                            uniform upload
```

On a 3× device at 120Hz, the frame budget is **8.33ms**. Miss that and ProMotion downshifts the panel to 60Hz, where the budget doubles to **16.67ms**. Miss *that* and a frame is dropped.

---

## Act 1: The stutter

The demo started with 192 balls (128 border + 64 floating). On device, the animation was visibly choppy. Profiling with Apple Instruments Metal System Trace gave us the first concrete number:

- **80.4fps effective** (should be 120).
- **42% of frames missed the 60Hz budget** — frames at 17–18ms.

The frame-delta histogram made the problem vivid: a bimodal distribution with a large cluster of frames sitting just over 16.7ms. These were frames that *nearly* fit the 60Hz window but didn't quite make it. Classic "working hard but not hard enough" signature.

### Four suspects, no verdict

Before touching anything, I wrote down every plausible cause:

1. **Per-frame array allocation** — the worklet was calling `new Array(MAX_META_BALLS * 4).fill(0)` every frame. That's 1024 slot allocations and an immediate fill, 120 times per second. GC pressure.
2. **Skia uniform marshalling** — packing floats into the GPU takes CPU even if the computation is cheap. 192 balls × 4 floats = 768 floats copied every frame.
3. **Trig-heavy worklet math** — each ball calls a `pointOnPerimeterWorklet` with `sin`/`cos`/`sqrt`. ~1000 trig ops per frame.
4. **GPU fragment fill** — the inner SDF loop runs once per ball per pixel. 192 balls × ~3M pixels ≈ 576M iterations per frame.

Any of these could be the bottleneck. Debating which is most likely is a waste of time. The answer is: *measure*.

### What Instruments told us

The Time Profiler call tree pointed immediately at the worklet thread:

- **`putComputedWithReceiver_RJS`** — Hermes's slow path for `arr[i] = value` writes on dictionary-shaped arrays. It was the top non-interpreter function.
- **`_xzm_xzone_malloc_tiny` and `_xzm_free`** — the per-frame buffer allocation was real; GC was actively running.
- Metal encoder times: **130µs p50, 380µs p99**. Sub-millisecond. GPU was idle.

GPU was not the bottleneck. The worklet itself was.

### Fix: double-buffered arrays

The per-frame `new Array().fill(0)` was the most obvious problem. Fix: allocate **two** arrays at module scope, alternate which one gets written each frame.

```ts
const BUF_A = new Array(MAX_META_BALLS * 4);
const BUF_B = new Array(MAX_META_BALLS * 4);

useFrameCallback(() => {
  "worklet";
  const buffer = writeToggle.value ? BUF_A : BUF_B;
  writeToggle.value = !writeToggle.value;
  // ... fill buffer in place (no .fill(0)) ...
  ballBuffer.value = buffer; // new reference every frame → Reanimated propagates
});
```

Why two buffers: Reanimated only propagates a SharedValue change when the new value has a **different reference**. A single reused buffer would look identical every frame and Skia would never see updated positions. With two, you always flip the reference, and whichever buffer you're writing to isn't the one Skia is currently reading.

**Result: 80fps → 104fps, 42% miss → 15% miss.** Not solved, but dramatically better.

### The alternative that didn't pay off

I also tried the "per-ball SharedValue" pattern — one `SharedValue<number>` per ball field, with direct `.value = x` writes bypassing the `arr[i] = x` slow path entirely. This works beautifully in smaller physics demos at 32 bodies. At 192 balls × 4 fields, it was worse: **+80% CPU, identical fps**. The `useDerivedValue` pack step still had to read 768 SharedValue accesses and write them into a new flat array every tick. The "avoid Hermes writes" saving was consumed by "now do 768 SharedValue reads instead." The pattern is right; the scale breaks it. Reverted.

---

## Act 2: The high-DPI render tax

104fps wasn't 120fps, and the Instruments trace had one more thing to say. The shader was rendering at **full 3× pixel ratio** — an offscreen layer 3× the logical size, then downsampled. The intent was quality (more native pixels → smoother blends). The reality: 9× more GPU work than a logical-res render.

Removing the `× PixelRatio` offscreen layer was a single-line change. **Result: 104fps → 120fps, 0.1% miss.** ProMotion was now hitting 120Hz consistently.

### New problem: jagged edges

Removing the supersample exposed the shader's hard edge. The old `smoothstep` used a fixed threshold of `u_threshold = 0.001` — a band of ≈0.8 logical pixels, effectively binary. The high-DPI supersample had been silently box-filtering that hard edge into a smooth gradient. Without it, the blob silhouette became stair-stepped.

The right fix: **analytic antialiasing in the shader**. SkSL has no `fwidth()` — you can't get derivative-based pixel size directly. But the field is normalized by `u_resolution.y` on both axes (the aspect correction puts x in height units too), so one device pixel = `1.0 / u_resolution.y` in field space.

```glsl
// before: fixed, hard
float alpha = smoothstep(0.0, -u_threshold, field);  // u_threshold = 0.001

// after: analytic, per-pixel
float aa = 1.0 / u_resolution.y;
float alpha = smoothstep(aa, -aa, field);
```

The AA band is now exactly one device pixel wide, centered on the iso-surface. **Edge quality: visually identical to the old high-DPI render. Cost: zero extra fill.** Best of both.

### Partial supersampling for extra crispness

With a working logical-res baseline, I added a `SUPERSAMPLE_SCALE` constant — a fractional multiplier on PixelRatio to trade some fill cost for sharper edges. At 64 balls, `SUPERSAMPLE_SCALE = 0.75` (~5.6× fill relative to logical res, ~2.25× relative to the old 9× render) gave visibly crisper edges with no frame drops.

Shipped config: **64 balls, float3 double-buffered, 0.75 supersample**.

---

## Act 3: The relapse — 128 balls

With the 64-ball config clean, I bumped to 128 balls. Frame drops came back.

The obvious theory: Hermes again. We'd fixed per-frame allocation and had a double-buffer, but 128 balls = 384 writes per frame (dropping `type`, so float3 per ball). Maybe the `putComputedWithReceiver_RJS` path was still the culprit at this scale.

This theory was wrong. Here's why that mattered: **changing ball count secretly moves three independent costs simultaneously.**

| Lever | What it controls |
|---|---|
| `MAX_META_BALLS` (compile-time constant) | Marshalled array length AND shader register/loop ceiling |
| `u_ballCount` (runtime uniform) | Per-pixel loop iterations + worklet writes |
| `SUPERSAMPLE_SCALE` | Pixel count (GPU fill area) |

Bump `MAX_META_BALLS` from 64 to 128 and you can't tell which of these caused the regression. You need to hold two constant and vary one.

### The experiment grid

I added two test knobs:
- **`PROFILE_WRITES`** — an in-worklet `performance.now()` bracket that logs write loop timing every 60 frames and on every dropped frame. Ran in a release build (Hermes profiling only makes sense in release).
- **`A3_ACTIVE_BALLS`** — override `u_ballCount` at runtime without changing `MAX_META_BALLS`.

Then ran the experiments:

**A1/A2 — Isolate worklet write cost:**
Profiling logs during 157 dropped frames: writeMs median **0.34ms**, max **0.90ms**, zero frames over 2ms. The write loop was *anti-correlated* with frame drops. On dropped frames, writes were *faster* than average, not slower. The Hermes theory was dead.

**A3 — Isolate compile ceiling vs. active ball count:**
Hold `MAX_META_BALLS = 128` (384 floats marshalled, shader ceiling at 128), force `u_ballCount = 64` at runtime. Result: **clean** (122fps, 0.3% miss). Identical compile overhead to the janky 128-ball case — but clean. Cost tracks active balls, not array size.

**A4 — Isolate GPU fill:**
128 active balls, drop `SUPERSAMPLE_SCALE` to `1.0/PixelRatio` (logical res, ~5× less fill area). Result: **clean** on both devices — **123.9fps / 0.0% miss** on the Galaxy S24, **119fps / 0.3% miss** on the iPhone 16 Pro.

Two independent levers (fewer active balls, fewer pixels) both fixed it. That's a fragment fill root cause, not CPU.

---

## Act 4: The cost model

The root cause reduces to one formula:

> **work ≈ active_balls × (PixelRatio × SUPERSAMPLE_SCALE)²**

On a 3× device at `SUPERSAMPLE_SCALE = 0.75`: `ss = 3 × 0.75 = 2.25`, `ss² ≈ 5.06`.

| Config | Balls | Fill (ss²) | Work units | Janky? |
|---|---|---|---|---|
| 128 @ 0.75 (Android, baseline) | 128 | 5.06 | **648** | ❌ |
| 64 @ 0.75 (A3 control) | 64 | 5.06 | **324** | ✅ |
| 128 @ logical (A4 fix) | 128 | 1.0 | **128** | ✅ |

The cliff sits between **324 and 648 work units**. The logical-res render comfortably clears it on both devices. To ship 128 balls with the 0.75 supersample: `ss² × 128 ≤ 324` → `ss ≤ ~1.59` → `SUPERSAMPLE_SCALE ≤ ~0.53`. The current 0.75 setting was validated at 64 balls only; at 128 it's over the cliff.

---

## Act 5: The ProMotion twist

Here's the counterintuitive part. The overloaded config (128 balls @ 0.75) was measured on both devices:

| Device | Effective fps | >16.7ms frames | Signature |
|---|---|---|---|
| Galaxy S24 (pinned 120Hz) | 115fps | 1.5% | Individual scattered drops |
| iPhone 16 Pro (ProMotion) | **107fps** | **11.2%** | **342 frames locked at ~16.7ms** |

The iPhone looked substantially worse. Same GPU workload. Why?

ProMotion isn't a fixed 120Hz display — it's **adaptive**. When the system senses that the app is consistently overshooting 8.33ms, it collapses the panel from 120Hz to 60Hz. A brief overshoot becomes a *sustained* collapse. Those 342 frames at ~16.7ms aren't individual drops; they're the panel pinned at 60Hz for seconds at a time.

The Android S24 was running with the panel pinned at 120Hz. The same 1.5% of frames that overshoot just show as individual drops, not a mode shift. **Same GPU, different display policy, very different visible outcome.** If you pinned the Android panel to adaptive too, it would collapse the same way.

This means any 120Hz ProMotion device will amplify GPU overshoot more than a device with a fixed-rate panel. Profiling headroom matters: you don't need to hit 8.33ms 100% of the time, but you need to hit it *consistently* or the whole panel drops.

---

## What actually helps vs. what doesn't

The investigation ruled out several plausible fixes that would have been wasted effort:

**Does NOT help:**
- WGPU / TypeGPU storage-buffer rewrite. This targets CPU marshalling and Hermes writes — both already cheap after the double-buffer fix. Fragment fill is intrinsic to the per-pixel metaball loop.
- Typed arrays (`Float32Array`). Skia's JSI binding reads `BYTES_PER_ELEMENT` as the array length. A 128-element Float32Array looks like length-4 to Skia. `Array.from()` workaround defeats the saving.
- Per-ball SharedValues (at this N). Already measured: +80% CPU.

**Does help:**
- Fewer active balls (`u_ballCount`).
- Lower `SUPERSAMPLE_SCALE`.
- Logical-res render with analytic AA (the AA is free; the fill reduction is enormous).

**Would help at the architectural level (not yet implemented):**
- Low-res SDF field texture + upsample (render the metaball field at e.g. ÷4 resolution, then upsample).
- Spatial culling (skip balls whose influence radius can't reach the current pixel tile).

Both of these attack fill at the algorithmic level rather than fighting the constant factor.

---

## Lessons

**1. Measure the layer you suspect.**
I was confidently wrong about "GPU is the bottleneck" after an eyeball reading of an Instruments chart — until the Time Profiler call tree showed Hermes. And then I was confidently wrong about "Hermes again" for the 128-ball relapse — until the in-worklet bracket showed 0.34ms writes on dropped frames. Instruments' GPU track and a frame-rate number together weren't enough. Each phase needed a different measurement.

**2. Change one variable.**
Ball count secretly moved three: marshalling cost, shader ceiling, and GPU fill area. The A3 experiment (hold array size constant, vary active count) was the key that cracked the root cause. If I'd just dropped ball count and seen an improvement, I'd have concluded "CPU marshalling" and been wrong.

**3. "GPU fill-bound" ≠ "CPU-bound" in the Perfetto/Instruments label.**
Android Perfetto labeled the misses `App Deadline Missed`, not `GpuDeadlineMissed`. The jank label was technically correct — the *app* missed its deadline — but it described the symptom from the RenderThread's point of view, not the GPU's. iOS Metal timeline encoder times (sub-ms) were the real signal.

**4. A 120fps average can hide 60Hz collapse.**
On ProMotion, read the **frame-time histogram**, not just the average. 107fps average at P90=17.0ms, 11.2% >16.7ms is a fundamentally different situation than 115fps average at P90=15.5ms, 1.5% >16.7ms, even though both "look like 60-ish fps."

**5. Analytic AA in SkSL doesn't need `fwidth()`.**
If your SDF is normalized by resolution, `1.0 / u_resolution.y` gives you the exact one-pixel band width. Symmetric `smoothstep(aa, -aa, field)` centers the band on the iso-surface without eroding the silhouette. Free; same quality as 3× supersample.

---

## Current state

Shipped: **64 balls, float3 double-buffered, 0.75 supersample, analytic AA** — 120fps, <0.1% miss.

To ship 128 balls: `SUPERSAMPLE_SCALE ≤ 0.5` (≈288 work units, under the cliff).

To scale past that without sacrificing crispness: low-res field texture + upsample is the right architectural move.

---

*The investigation tooling lives in `temp/testing/`: `analyze-trace.py` for Instruments traces, `perfetto/capture.sh` + `analyze.py` for Android. The in-worklet profiling bracket (`PROFILE_WRITES` flag in `useGooeyBorder.ts`) was essential for phase 3 — JS profilers on the main thread can't see the Reanimated worklet thread.*
