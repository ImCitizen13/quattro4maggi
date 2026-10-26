# Black Hole GPU

A React Native view is snapshotted into a WebGPU texture, cut into tile
particles (one per 8 / 4 / 2 px tile, up to ~470K on an iPhone 17 Pro), and
swallowed by a black hole. Physics and rendering are all GPU: a compute pass
steps the particles, one instanced draw renders them, and a gravitational
lens layer bends the result. No Skia, no Atlas. The only CPU readback is a
small throttled death histogram (progress). The render loop runs on the UI
runtime. A run is a deterministic function of an integer step index, so it
can be paused, scrubbed forward and backward, and replayed.

**Status:** id 11 done, id 12 done except the 120 Hz device reading (12f lens
shipped), id 15 (progress-driven run: Destroy, Pause/Reset, scrubbable bar,
settings panel) verified on the Simulator (15a-15d). See
[Status & handoff](#status--handoff).

## Architecture

```
push transition ends (transitionEnd, 1 s fallback)
  └─ snapshot texture (layout px) + standby scene, built once
       rebuilt only on tile change or layout size change
          │ setup, JS thread (vortexScene.ts)
          ▼
     TypeGPU root · Params uniform (~120 B) · Particle buffer (32 B × N)
     death histogram (8192 × atomic<u32>) · keyframe buffer (S × N × 32 B)
     MAP_READ staging buffer · init / step compute · tile render pipeline
     bind groups                                       ← all built once
     lensScene.ts (shares root + Params via LensShared): sampler · lens pipeline
          │ transferred to the UI runtime (useWebGPUOnDevice, ui-worklet)
          ▼
composeLayered (per frame) — layers: [vortex (base), lens (readsBackdrop)]
   a layer returning false vetoes the frame: skips the rest + blit, composer
   returns false (hook skips present); undefined = drawn

vortex render(ts, attachment) 'worklet' — reads SharedValues:
   phase  0 → one transparent frame, then return false (veto)
          new id → reset step state + keyframes + histogram, write seed/sticky,
                   init dispatch + frame 0 in one submit, scheduleOnRN(onStarted)
   speed  timeScale 0.25×–4× (clamped in the worklet)
   paused true → 0 steps (frames still drawn, no catch-up burst on resume)
   seekTarget ≥ 0 → seek (below) instead of stepping by time
   frame: step clock: accumulator (h = 1/120) decides how many steps n this frame
          runs; substep s is absolute step step0+s+1 at t = f32(idx)·h
          → writePartial(Params) → [restore copy | init] → step compute (n steps,
          hole = closed form of t, deaths[idx]++ at kill) → keyframe copy
          → histogram copy to staging → tile pass into the composer attachment
          (clears to SPACE_COLOR) + 6 × N instanced tiles → submit
   readback: staging.mapAsync(1) on the UI runtime, one in flight; bins →
          cum[step] (tiles swallowed by step) → progress = cum[shown]/N, doneStep
   idle frame zeroes `hole`, so the lens passes the transparent frame through

lens render(ts, attachment, backdrop) 'worklet':
   per-frame bind group (params, backdrop, sampler) from a local layout alias
   (migration doc 5.6) → fullscreen pass (no blend) → submit

Seek: S keyframe slots (copyBufferToBuffer of the particle buffer, GPU-side),
   slot j filled at the first frame at/after (j+1)·K steps; step 0 = re-run init.
   Target step = first step with cum ≥ f·N (binary search); beyond what is read
   back = chase forward (≤ 120 steps ahead of the read-back). Restore the nearest
   keyframe, replay ≤ maxSeek steps in ONE dispatch per frame. Steps ≤ frontier
   don't touch the histogram (recordFrom), so replays never double count.

HUD:  [ progress bar / scrubber ]   progress, seekTarget, paused SharedValues
      [ Destroy ] [ Pause | Reset ]  gear (header) → SettingsPanel (Sim | Lens)
Run state: idle ─Destroy→ capturing ─→ running ⇄ paused (Pause / Destroy / scrub)
           running|paused ─→ done (onDone);  Reset (paused|done) ─→ idle
Destroy  ─► (idle) 120 ms ─► captureInto(scene texture) (~0.3 s) ─► phase = ++runId
         ─► (paused) paused = false
Pause    ─► paused = true;  Reset ─► phase = 0, progress 0, show the RN view
Scrub    ─► finger down: seekTarget = x/width; up: seekTarget = -1, paused = false
Sticky / tile change mid-run ─► restart (Sticky: phase = ++runId, same texture;
                                 tile: scene rebuild, same texture)
```

Timeline of one run (sim time, scaled by speed): the hole grows in from 0 s
(closed-form spring, overshoots once); the radial release wave starts at
0.6 s; each tile's forces ramp in over `ramp` s. Sticky tiles release up to
1.6 s late and ramp up to 3× slower.

## Files

- `src/app/black-hole-gpu/index.tsx` — route (plain `View`, not `ThemeView`)
- `BlackHoleGpu.tsx` — state only: transition gate, snapshot texture, scene memo (deps: snapshot texture, tile), run state machine, phase/seed/sticky/speed/progress/paused/seekTarget SharedValues, HUD
- `ProgressBar.tsx` — progress bar + percent readout + scrubber (pan, minDistance 0); writes `seekTarget`, all on the UI thread
- `SettingsPanel.tsx` — bottom-docked panel via Portal, Sim | Lens tabs; Sim: status line, Speed slider, tile chips, Sticky chip
- `LensPanel.tsx` — `LensTab`: Gravity / Glass groups, presets, slider grid (the Lens tab body)
- `DemoContent.tsx` — the RN view that gets swallowed (`collapsable={false}`, reports image load)
- `snapshot.ts` — `createSnapshotTexture`, `captureInto` (`queue.drawElementImageToTexture`)
- `vortexScene.ts` — base layer of `composeLayered`: setup, `frame` / `clearFrame` / `render` worklets, step clock, histogram readback, keyframes + seek, `VortexConfig` defaults; draws into the composer attachment and fills `LensShared`
- `vortexShaders.ts` — raw WGSL bodies in TypeGPU shells (`initFn`, `stepFn`, `fullscreenVs`, `tileVs`), `tileFs` in TGSL; helpers `hash`, `holeAt`, `horizonOf`, `cellHash`, `stickOf`
- `lensScene.ts` — lens layer (`readsBackdrop`); `LensShared` hands over the vortex `root` + `Params`
- `lensShaders.ts` — `lensFs`: point-mass lens `src = r - RE²/r`, `RE = 1.8 × horizon × hole`, far-field falloff (6 RE), chromatic split `0.03 × deflection`, black disc at the current horizon, accretion glow (moved from the old `bgFs`)
- `gpuTypes.ts` — `Particle` (pos, vel, home, release, state) and `Params` schemas
- `layouts.ts` — compute (uniform, particles, deaths), render and lens bind group layouts (all group 0)
- `../gargantua-type-gpu/composeLayered.ts` — layer composer; a layer returning `false` skips the rest + blit and returns `false`
- `../gargantua-type-gpu/hooks/useWebGPU.tsx` — shared hook; `useWebGPUOnDevice` shares the snapshot's device; `render` returning `false` skips `present()`
- `babel.config.js` — `importForwarding` entry for this folder

## Physics

- Velocity field, not forces: sink + point vortex, `v = c/r · (inward + swirl · tangent)`.
  Inflow is always positive, so no orbit can balance it; paths are log spirals.
- Velocity relaxes toward the field at `max(drag, 3 · |field| / r)`, so tiles
  accelerate from rest and don't ring near the hole.
- A tile is consumed when it crosses the (hole-scaled) horizon.
- The hole is the exact underdamped step response (k 70, d 9) `1 − e^{−4.5τ}(cos ωτ + (4.5/ω) sin ωτ)`,
  ω ≈ 7.05, evaluated per substep in WGSL (`holeAt`) and on the CPU for the frame's
  `hole` (lens + tile shrink). It replaced the CPU semi-implicit spring: same look,
  one overshoot ≈ 13 %, and a pure function of sim time.
- Integer step clock: substep `idx` runs at `t = f32(idx)·h` (never `t += h`), so any
  chunking of the same steps is bit-identical on one GPU → deterministic replay. A
  run is particle buffer + step index.
- Stickiness: value noise on the home position (cell ≈ 0.06 × short side,
  smoothstep 0.5–0.8 → about a third of the screen) plus ±0.1 per-tile jitter.
  A new seed each run; the Sticky chip writes `sticky = 0` (off).
- Progress = tiles swallowed / N. The death histogram (8192 bins = 68 s of sim)
  counts kills per step; cumulative sums map step ↔ fraction (binary search for seek).

## Controls

| Control | Effect | Rebuild? |
|---|---|---|
| Destroy | idle: capture + start a run; paused: resume; disabled while capturing / running / done | no |
| Pause / Reset | one button: Pause while running; Reset once paused or done (RN view back, 0 %); disabled idle | no |
| Progress bar | scrub: drag or tap seeks to that fraction, forward and backward; release resumes | no |
| ⚙ (header) | toggles the settings panel (floats over the HUD, stage never resizes) | no |
| Sim tab: Speed × | 0.25×–4×, live, sim time per real second | no |
| Sim tab: 8 / 4 / 2 px | particle count | yes (mid-run: restarts at once on the same texture) |
| Sim tab: Sticky | patches on/off (mid-run or done: restart) | no |
| Lens tab | Gravity / Glass sub-tabs, presets, 14 live knobs | no |

## Measurements (iPhone 17 Pro Simulator, 60 Hz cap)

| | Value |
|---|---|
| Tiles (8 / 4 / 2 px), 1206×1764 px stage | 33,371 / 133,182 / 531,846 |
| Encode ms (CPU in `frame`) | ~0.6–1.0 |
| Capture (`drawElementImageToTexture`) | ~300 ms, blocks the platform UI thread (FpsOverlay max 293 ms at Destroy) |
| Release tap → first GPU frame | 433–458 ms (120 ms delay + capture + ~20 ms) |
| Arrival | one ~216 ms hitch ~0.4 s after the push ends (pre-build handoff, still screen) |
| Cold motion AE (8 / 4 / 2 px) | 295K / 283K / 271K (only `0` = frozen is a fail) |
| 905f1e8 (lens) cold AE (8 / 4 / 2 px) | 307K / 340K / 348K, 60 fps |
| 905f1e8 mid-run (Release 4 px → 8 px → Sticky → re-Release) | all moving, AE 310K / 340K / 302K / 300K; Reset AE 0, no residue |
| 905f1e8 Release → first visible change | 0.68–1.03 s over 3 runs (screenshot-polled, ~350 ms resolution; first frame matches the RN view until the hole grows); no 1 s drawable stall with the composer's extra passes |

Task 15 (progress-driven run), same Simulator:

| | Value |
|---|---|
| Motion AE 2.5 s after Destroy, 1 s apart, crop 700×700+250+700 (8 / 4 / 2 px) | 259K / 321K / 336K; ui 58–60 fps |
| Destroy → 100 % at 1× (Sticky on, 2 runs) | 11.7 / 12.0 s (incl. ~0.5 s capture; 0.2 s poll) |
| Destroy → 100 % at 1× (Sticky off, 4 runs) | 11.6 / 11.8 / 11.9 / 12.3 s; 50 % at ~6.6 s vs ~7.3 s with Sticky |
| Destroy → 100 % at 2× (Sticky on, 2 runs) | 7.7 / 7.9 s; 50 % at ~4.2 s (the tail is gated by readback lag + the last tile, so the full run is ~1.5× not 2×) |
| Pause at 41 % | stage crop AE 0 over 2 s and still 41 % 5 s later; resume 41 % → 42 % in 0.15 s |
| Hitches (FpsOverlay max ms, describe-polled) | 293 ms at Destroy (capture); Pause / resume / scrub / Reset ≤ 37 ms (≈ the polling noise floor) |
| Readback | 1 `mapAsync` in flight, lag a few frames; encode 0.6–1.0 ms |

Keyframes / seek (15c, 1206×1764 px stage, Lest 1656 steps vs ~1320 measured):

| tile | tiles | slots S | K (steps) | maxSeek (steps / frame) |
|---|---|---|---|---|
| 8 px | 33,371 | 32 | 52 | 1198 |
| 4 px | 133,182 | 15 | 111 | 300 |
| 2 px | 531,846 | 3 | 552 | 75 (backward scrub may take ~8 frames) |

Seek behavior: hold at 30 % from done lands at 30 % (tiles back) and resumes to
100 %; paused 1 % → hold 70 % lands exactly; 50 % reached from below (chase) and
from above (keyframe + replay) gives identical stage crops (AE 0). Scrub fps: 4 px 60,
8 px / 2 px 56–60.

## Lessons learned

Each of these cost a debugging session.

### Metal / Core Animation

- **A canvas at `opacity: 0` stalls for 1 s.** Core Animation doesn't recycle
  drawables of a fully transparent layer; once the swapchain's drawables are
  used up, `getCurrentTexture()` waits out Metal's 1 s `nextDrawable` timeout.
  Keep the canvas at `0.01` whenever a scene exists but isn't showing, and
  make the idle frame transparent. Same at every particle count, which is how
  it was told apart from GPU load.
- **Snapshotting blocks the UI thread ~0.3–0.4 s.** Never do it on mount (it
  froze the push transition: 425 ms stall). Capture on the user's action,
  after a short delay so the press animation settles.

### WGSL / TypeGPU

- `target` and `patch` are reserved words (a `Params.patch` field throws in
  TypeGPU). A backtick inside a WGSL comment ends the JS template literal.
- The resolver treats **every `in` token** as an external, including the word
  in body comments, and warns; the LogBox toast covers the HUD and swallows
  taps. Entries with location inputs (`tileFs`) are TGSL shell form.
- A raw body must not include its own header. Bind via `$uses({ C })` and
  write `C.$.u.x` / `C.$.ps[i]` in the body.
- A failed shader module drops the whole submit → blank canvas.
- Verify offline: `tgpu.resolve([fnA, fnB])` in a throwaway `.ts`, run with
  `bun` (raw WGSL only; TGSL needs the babel plugin).
- `root.destroy()` on an `initFromDevice` root does not destroy the device.
- `useDevice()` makes a new device per call: the snapshot and the scene must
  share one (`useWebGPUOnDevice`).

### UI runtime

- Everything `render` / `frame` capture must cross runtimes: TypeGPU
  resources, native GPU objects, SharedValues, plain data. No `d.*` / `std.*`
  / layout imports inside worklets. Audit the captured set in
  `node_modules/react-native-worklets/.worklets/<hash>.js` after
  `bunx expo export --platform ios`.
- Bind groups are built once in setup; per-frame `createBindGroup` from an
  imported layout breaks on the UI runtime. So the snapshot texture is owned
  by the component and refilled in place, never swapped.
- TypeGPU's one-time `WeakRef is not available…` warning is ignored in
  `LogBox` (its toast swallowed a chip tap).
- Worklet captures (re-audited at task 15d; no `d` / `std` / layouts /
  `GPUBufferUsage` / `GPUMapMode` / shared / context in any):
  - vortex `render`: phase, lastPhase, progress, paramBuffer, clearFrame, speed,
    SPEED_MIN/MAX, frame, seed, sticky, onStarted, last, statsStart, frames,
    STATS_EVERY, onStats, count, encodeMs
  - `frame`: run, MAX_STEPS, onDone, paramBuffer, seekTarget, count, LAST_STEP,
    CHASE_AHEAD, maxSeek, paused, MAX_SUBSTEPS, H, holeAtCpu, config, HOLE_DECAY,
    HOLE_FREQ, device, rawDeaths, initPipeline, computeGroup, groups, keys, bytes,
    rawParticles, stepPipeline, keyEvery, staging, SPACE_COLOR, tilePipeline,
    renderGroup, progress (+ `scheduleOnRN` import)
  - `holeAtCpu`: none; `clearFrame`: device
  - ProgressBar (7 small worklets): seekTarget, progress, paused, width,
    onScrubEnd, shown, seekFromX
  - lens `render`: tuneBuffer, tune, root, layout, params, sampler, pipeline
- `.worklets/` accumulates stale factories from earlier edits; pick the
  current ones by mtime / the factory suffix after `bunx expo export`.
- `performance.now` exists on the UI runtime; avoid `toLocaleString` there
  (stats are formatted on JS).
- **`mapAsync` works from the UI runtime.** It resolves through the runtime's
  `setTimeout` pump, a few frames later; keep one map in flight and gate
  re-entry with a flag cleared in `finally` (+ `unmap`). A readback from an
  older run is dropped by a run-generation check.
- **Use the literal `1` for `GPUMapMode.READ` in worklets** (the global may not
  exist on the UI runtime); `GPUBufferUsage.*` is fine in setup (JS thread).
- **Typed arrays are allocated lazily inside the worklet** (`run.cum ??= new
  Uint32Array(...)`): a typed array captured from setup does not cross runtimes.
- **Mutable captured state is copied per worklet.** Two worklets capturing the
  same `let` / object each get their own copy: give each piece of state exactly
  one owner (all run state lives in one `run` object touched only by `frame`;
  stats counters only by `render`).
- **Deterministic replay needs `t = f32(idx)·h`, not `t += h`** (and a hole that
  is a closed form of `t`): otherwise different chunking of the same steps drifts
  and a seek back-and-forward doesn't land on the same picture.

### Physics

- A tangential *force* + gravity traps tiles on a ring where v_t²/r = g; use
  a velocity field with positive inflow. Instant velocity kicks look like
  snapping; ramp forces from rest.

### Verifying on the Simulator

- Verify motion, not presence: two 1:1 crops 1 s apart, `magick compare
  -metric AE`, after a cold start.
- argent screen recording drops frames on the Sim; use timestamped
  screenshot timelines.
- For timing, temporary `console.log` with `Date.now()` deltas from the tap,
  read via `argent run debugger-log-registry`; from a worklet, log through
  `scheduleOnRN` with a JS-defined function.
- Drive the HUD with `argent run gesture-tap` / `gesture-swipe` (normalized
  coords) and read the percent readout (`AXTextField value="NN%"`), button
  labels and the `ui NN fps · max ms` line from `argent run describe`.
- Motion check per tile size: Destroy, wait 2.5 s, two 1:1 screenshots 1 s apart,
  crop `700x700+250+700`, `magick compare -metric AE` (non-zero = moving).
  Pause check: the same crop 2 s apart must be AE 0 (the full frame differs by
  the FpsOverlay text).
- Scrub with `gesture-swipe` on the bar (y ≈ 0.862, x 0.04 → 0.96) with a
  near-zero horizontal span and a long duration to hold a fraction.
- Re-check the settings panel's tap targets after layout changes: the panel
  covers the HUD, so a chip tap with the panel closed hits Destroy. Toggling
  Sticky while a run is done restarts the run (by design).

## Status & handoff

| What | Where |
|---|---|
| Orchestrator handoff (state, lessons, testing, start prompt) | `backlog/docs/black-hole-gpu-handoff.md` |
| Task specs | `backlog/tasks/` — `bl show --id 12` |
| Phase 1 CPU demo (comparison) | `src/components/black-hole-text/` |

| Backlog id | Task | State |
|---|---|---|
| 11 | GPU v1: snapshot → compute vortex | done |
| 12 | GPU v2: speed, no shatter, stickiness, UI loop, lens | 12a–12f done; 120 Hz device reading open |
| 13 | GPU v3: white-explosion choreography | blocked by 12 |
| 14 | Wrapper that swallows any view by ref | todo |
| 15 | Progress-driven run: Destroy, Pause/Reset, scrubbable bar, settings panel | 15a–15d done (Simulator) |
