# Gooey-Border Perf Investigation — History Handoff

**For:** a new agent picking up the gooey-border performance story (blog + follow-on work).
**Date:** 2026-07-01.
**Purpose:** the *narrative history* of the investigation, especially the back half
(§6–§12 of the blog). Numbers here are grounded in `constants.ts` git history, the
Instruments/Perfetto traces, and `temp/testing/perfetto/DIAGNOSIS-CHECKLIST.md`.

Companion docs (read for detail):
- `docs/blog-gooey-border-perf.md` — the narrative blog (Acts 1–5 ≈ blog §1–§5).
- `temp/testing/perfetto/DIAGNOSIS-CHECKLIST.md` — the A1–A4 elimination experiments.
- `docs/perf-testing-methodology.md` — how captures are run on each platform.
- `temp/testing/reports/field-texture-*.md` — the field-texture follow-on (the fix).
- Memories: `gooey-border-128-cliff-fragment-fill`, `gooey-border-highdpi-shader-cost`.

---

## Ground truth: the ball-count chronology (from git)

Total balls = `BORDER_META_BALLS + MOVING_META_BALLS`. Verified progression:

| phase | BORDER + MOVING | total | note |
|---|---|---|---|
| original | 128 + 64 | **192** | asymmetric; the §1 stutter config |
| rebalance | 64 + 64 | **128** | symmetric |
| clean baseline | 32 + 32 | **64** | the known-clean reference |
| wobble | 35 + 35 | 70 | brief |
| relapse config | 64 + 64 | **128** | the cliff |
| (with SS=0.75) | 32 + 32 | 64 | supersample lever introduced here |
| **current** | 64 + 64 | **128** | `SUPERSAMPLE_SCALE = 1` today |

**Key reconciliation (a known point of confusion):** "192" and "128" are *both real*,
at different phases. §1–§5 discuss the **original 192** (128 border + 64 floating).
The diagnosis phase (§6+) uses the **symmetric** configs where **64 (32+32) is clean**
and **128 (64+64) is the cliff**. So §6's "relapse after increasing ball count" is
**64 → 128**, not a change from 192. When writing, always render counts as
"**128 total (64+64)**" to kill the ambiguity.

---

## Recap of §1–§5 (context for the back half)

- **§1 Stutter / §2 "obvious suspect" GPU:** 192 balls, visibly choppy. First guess:
  the shader/GPU. Metal encoder submit was microseconds (p50 ~140µs; the only >1ms
  frame was frame 1 = one-time SkSL→Metal compile). Cheap, steady submits + frames
  pinned at ~17ms said the cost wasn't the CPU→GPU handoff.
- **§3 Journey Upstream:** added **Time Profiler** alongside Metal System Trace. Thread
  breakdown: Main/UI thread ~72%, JS thread idle, Metal driver (AGX) near-zero. The
  Reanimated worklet runs on the **UI thread (= main thread on iOS)**, so "main thread
  busy + JS idle" = the worklet is the cost.
- **§4 The Worklet Was the Wall:** leaf functions named it — `putComputedWithReceiver_RJS`
  (Hermes slow path for indexed `buffer[i]=` writes, ~768/frame) + `_xzm_malloc_tiny`
  (per-frame `new Array(MAX*4).fill(0)` allocation/GC). **Not** the trig.
- **§5 The False Victory:** **double-buffered arrays** — two module-scope buffers, filled
  in place, flip each frame. Why two: Reanimated only propagates on a *reference change*,
  so a single reused array freezes the blob. **Killed allocation outright; only indirectly
  eased the writes** (dropped `.fill(0)`, removed GC pauses) — the indexed-write path was
  untouched. **Result: 80 → 104fps, 42% → 15% miss.** "False" because 104 ≠ 120 *and* it
  reinforced the wrong model ("Hermes is the bottleneck") that traps §6.
  - Note: 80/104 are **effective (average) fps**, not panel modes. A 120Hz ProMotion
    panel only runs 120/60/40/30; these numbers are the average of a **bimodal 120-or-60
    mix**. The fix shrank the 60Hz-fallback share (42%→15%), lifting the average.

---

## §6 — The Relapse at 128 Balls

1. **Stutter returns.** Pushing the clean **64 (32+32)** baseline up to **128 (64+64)**
   reintroduced misses: ~**115fps, ~1.5% frames >16.7ms**, p90 ~15.5ms, mean 8.60ms vs
   the 8.33ms budget. Subtle but real (64 was ~122–123fps, ~0.1%).
2. **The tempting wrong diagnosis: "Hermes again."** 128 balls = more writes/frame, so
   the reflex was "the `putComputedWithReceiver_RJS` path doesn't scale." This is the trap
   — trusting the model that won last time.
3. **The decisive move: measure the writes in the worklet.** `PROFILE_WRITES` — an
   in-worklet `performance.now()` bracket logging write-loop ms every 60 frames *and on
   every dropped frame*, in a **release build**. Needed because a main-thread JS profiler
   cannot see the Reanimated worklet thread.
4. **Result that killed the theory.** Over 157 dropped frames: writes **median 0.34ms,
   max 0.90ms, 0 frames >2ms**, and **anti-correlated** with drops (writes were *faster*
   on dropped frames).
5. **The tell inside the tell.** Writes were faster on dropped frames because those frames
   were **GPU-bound** — the worklet finished early and waited. The anti-correlation is the
   fingerprint of a bottleneck **downstream of the buffer write** (the render/GPU side).
6. **Pivot:** not allocation, not writes → the cost is in the shader/GPU. Investigation
   leaves the worklet for good.

**Theme:** the *second* "confidently wrong" (§2 = "it's the GPU"; §6 = "it's Hermes").
The fix that worked last time became the bias. Hero tool: the in-worklet bracket.

---

## §7 — One Variable Was Actually Three

"More balls" was really **three entangled knobs**, which is why naive A/Bs were noisy:

1. **`MAX_META_BALLS`** — the uniform array size / shader compile ceiling. Suspected of
   register-pressure / marshalling cost.
2. **`u_ballCount`** — the *active* balls actually iterated in the per-pixel SDF loop.
3. **`SUPERSAMPLE_SCALE`** — offscreen render density (rendered pixels), introduced around
   this phase.

Two de-confounding experiments (in `DIAGNOSIS-CHECKLIST.md`):
- **A3 — active vs MAX:** active=64 @ MAX=128 → **CLEAN** (122fps, 0.3% miss) vs 128 @
  MAX=128 → janky (115fps, 1.5%, 149 Display HAL). ⇒ cost is **active-count-driven**;
  **marshalling eliminated** (384 floats identical in both), **compile ceiling eliminated**
  (MAX=128 both).
- **A4 — supersample A/B:** 128 @ logical res (ss=1.0) → **123.9fps, 0.0% miss** vs
  128 @ 0.75 (ss=2.25) → 115fps, 1.5%. ⇒ **GPU fragment fill confirmed** as the driver.

Together: A3 says *active-count*, A4 says *GPU-not-CPU*. Two captures localize the cell.

---

## §8 — The Real Cost Model

**Cost ≈ `active_balls × rendered_pixels` = `active_balls × (PixelRatio × SUPERSAMPLE_SCALE)²`.**
The inner SDF loop runs once per ball per rendered pixel; supersampling multiplies the
pixel count (ss² on a 3× device).

Fill-unit table (S24, 3×):
| config | active | ss² fill | units | verdict |
|---|---|---|---|---|
| 128 @ 0.75 | 128 | 5.06 | ~648 | janky ❌ |
| 64 @ 0.75 | 64 | 5.06 | ~324 | clean ✅ |
| 128 @ logical | 128 | 1.0 | ~128 | clean ✅ |

Cliff sits ~**324–648** units. Both levers (active count *and* supersample) move you across
it — which is why they looked like "one variable" before A3/A4 split them.

---

## §9 — The ProMotion Twist

iOS punishes fill overshoot **harder** than Android. Same 128 @ 0.75:
- **iPhone 16 Pro:** 107fps, **11.2% miss**, p90 17.0ms — histogram shows **342 frames
  pinned at ~16.7ms** (the panel collapsing **120→60**) vs 3 frames at logical res.
- **Android S24:** more graceful; adaptive refresh absorbs more before collapsing.
- **A4 (128 @ logical) holds 120Hz on BOTH.**

Mechanism: ProMotion only presents at stable divisors (120/60/40/30). Miss the 8.33ms
budget and that frame is held to the next boundary (16.7ms = 60Hz). A modest overshoot
therefore reads as a **2× framerate collapse**, not gentle degradation — so the iPhone
"felt worse" than Android at identical fill. (This same mechanism is why the later
field-texture win is *dramatic* on iOS — see below.)

---

## §10 — What Did NOT Help

All target CPU/marshalling/writes, which were **already cheap after the double-buffer**:
- **Per-ball `SharedValue` pattern** — one SharedValue per ball field, direct `.value=`
  writes to dodge `arr[i]=`. Great at ~32 bodies; at 192×4 it was **+80% CPU, identical
  fps** — the `useDerivedValue` pack step just moved the cost to 768 SharedValue *reads* +
  a rebuild per tick. Reverted.
- **Typed arrays (`Float32Array`)** — same class of micro-opt on an already-cheap path.
- **WGPU / TypeGPU storage-buffer rewrite** — targets marshalling + Hermes writes, both
  already cheap. Would **not** touch fragment fill, which is intrinsic to the per-pixel
  metaball loop. Not worth the rewrite for this bottleneck.

Lesson: once fill is the bottleneck, CPU-side cleverness can't help.

---

## §11 — What Actually Helped

- **Fewer active balls** (`u_ballCount`) — directly cuts the `active × fill` product.
- **Lower `SUPERSAMPLE_SCALE`** — the other half of the product; biggest single lever.
- **Analytic 1px edge AA** (commit `a1a4454`) — dropped the fixed `u_threshold`; keeps the
  edge crisp at lower supersampling, so you can afford less fill.
- **The field-texture two-pass path** (the real fix, current work) — rasterize the metaball
  field at low res (`FIELD_SCALE × pd`), composite at full res. **Decouples fill from output
  resolution.** Validated on both platforms (2026-06-26):
  - iOS: brute-force light shader *naturally* cliffs (67fps/46% miss); field path recovers
    **120fps/0.1%** at FS=0.4.
  - Android: needed a *forced* cliff (SS=1.5) to show it; field holds 120fps.
  - **FS=0.4 is the cross-platform default.** iOS can't exceed it (FS=0.75 re-cliffs to
    90fps); Android tolerates FS=0.75 (smoother edge, still 120fps).
  - Trade-off: field edge is **more pixelated** than brute-force. Proposed next fix:
    **linear-sample the field + `fwidth`/`smoothstep` the composite threshold** (co-dependent;
    fwidth needs linear sampling). Not yet implemented/measured.

---

## §12 — Takeaway

Methodology, not tricks:
- **Isolate variables.** The whole cliff hid behind three entangled knobs (§7); the answer
  only appeared once A3/A4 split active-count / MAX / supersample into separate captures.
- **Measure, don't assume — and re-measure.** Two "confidently wrong" turns: "it's the GPU"
  (§2, was the worklet) and "it's Hermes again" (§6, was the GPU). The fix that worked last
  time is the bias that blinds you next time.
- **Each phase needs a different instrument.** fps + Instruments GPU track weren't enough;
  §3 needed the Time Profiler thread split, §4 the leaf functions, §6 an *in-worklet*
  bracket (main-thread profilers can't see the worklet), §7–8 supersample A/Bs.
- **Know your platform's failure mode.** ProMotion's 120→60 collapse (§9) makes the same
  fill overshoot look 2× worse on iOS — a per-frame-adaptive panel means effective-fps +
  miss-% tell you more than "the refresh rate."

---

## Current state / where to pick up

- Branch `gooey-border-analysis`. Constants at baseline: `USE_FIELD_TEXTURE=false`,
  `SUPERSAMPLE_SCALE=1`, `FIELD_SCALE=0.4`, 128 balls (64+64).
- Field-texture path validated both platforms (reports in `temp/testing/reports/`).
- **Open next steps:** (1) the linear-sample + fwidth/smoothstep edge-quality fix and
  re-measure; (2) **port field-texture to the shimmer/dark shader** — the real target,
  ~3× the light per-pixel cost, where the un-forced cliff lives and the field win should be
  largest (especially on iOS). Port questions are at the end of `FIELD-TEXTURE-TEST-PLAN.md`.
- Note: `docs/` and `temp/` are gitignored (local-only working docs).
</content>
