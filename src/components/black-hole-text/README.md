# Black Hole Text

A multi-threading showcase: a particle vortex orbiting a black hole, where the
**physics source is swappable** and the **render path is fixed** (Skia Atlas,
one draw call). Compare frame time, step time and max stable particle count
per execution strategy.

**Status:** Phase 1 + P1b done. Next: Phase 2 (backlog id 5). See [Status & handoff](#status--handoff).

## Architecture

```
Controls (SharedValues: activeCount, cx/cy from onLayout, mass, timeScale)
      │
      ▼
PhysicsSource ── init(state, out, capacity, bounds)  ← swappable
      │          step(state, out, count, params, dt)  (worklets, plain-number params)
      ▼
Driver ───────── decides WHERE/WHEN step runs        ← swappable
      │          (Phase 1: useUiDriver = useFrameCallback), then frame += 1
      ▼
out buffer ───── Float32Array, STRIDE 4: x, y, rotation, scale  ← render contract
      │          (UI-runtime globalThis registry, key "black-hole", 100K seeded once)
      ▼
ParticleRenderer ─ useDerivedValue(frame, activeCount): out → pooled RSXforms
      │            (renderPool.ts, alternating arrays) → Canvas + Atlas,
      │            1 draw call, UI thread, no remount on count change
      ▼
HUD ──────────── FpsOverlay (ui row) + source / count / step ms
```

- `state` is private to a source (its physics state). Only `out` is read by
  the renderer, so it is the only buffer that ever needs to cross threads.
- Sources take plain numbers, not SharedValues: the driver reads the
  SharedValues and passes values in, so one `step` can run on any runtime.
- Driver and renderer share memory through a keyed registry on the UI
  runtime's `globalThis` (runtimes never share objects; captured values are
  copied). Skia's `useRSXformBuffer` is not used: here its mapper only re-ran
  on React renders, freezing particles.

## Roadmap

| Phase | What | Physics runs on |
|---|---|---|
| 1 | Pipeline + dummy Kepler orbits | UI thread (`useFrameCallback`) |
| 2 | Real `stepParticles` + three drivers, switchable at runtime | A: JS thread · B: UI worklet · C: background worklet runtime |
| 3 | Nitro module (C++ step) writing a native-owned buffer | Native thread |
| 4 (extra) | WebGPU / TypeGPU compute shader | GPU |

Open risks:
- **Phase 2, Case C:** a worklet `ArrayBuffer` is copied between runtimes, not
  shared. Real sharing likely needs native-owned memory (pulls part of Phase 3
  forward). Spike before building C.
- **High counts:** at 100K+ the Skia draw may cost more than the physics,
  making all cases look equal. Measure render-only cost as a baseline.
- **Phase 4:** handing a compute buffer to Skia's draw is unresolved.

## Files

- `src/app/black-hole-text/index.tsx` — route screen
- `src/components/black-hole-text/BlackHoleText.tsx` — screen composition
- `pipeline/constants.ts` — OUT_STRIDE, PARTICLE_COUNTS, MAX_PARTICLES, sprite size, HUD interval
- `pipeline/types.ts` — ParticleBuffers (capacity), Bounds, StepParams, PhysicsSource
- `pipeline/particleBuffers.ts` — UI-runtime `globalThis` registry: `ensureParticleBuffers` / `getParticleBuffers`
- `pipeline/sources/dummyOrbits.ts` — Kepler circular orbits (ω ∝ r^-1.5), uniform canvas seed with empty center
- `pipeline/drivers/useUiDriver.ts` — `useFrameCallback` driver, steps `activeCount` prefix; `PhysicsDriver` type
- `pipeline/renderPool.ts` — UI-runtime growing pool of RSXform/Rect + cached per-count views (`ensureRenderPool` / `ensureView`; Skia passed in, types only imported)
- `pipeline/ParticleRenderer.tsx` — sprite (CPU raster), `useDerivedValue` sprites/transforms from the pool, Atlas, disc from cx/cy
- `pipeline/PipelineHud.tsx` — source / count / step ms readout + count chips
- `pipeline/ParticlePipeline.tsx` — measures size, writes cx/cy in `onLayout`, wires driver + renderer
- `babel.config.js` — worklets `importForwarding` entry for this folder

## Notes

- The route uses a plain `View`, not `ThemeView`: `ThemeView` centers its
  children, which collapses a flex-only canvas to 0x0.
- `src/components/black-hole-text` is listed in `importForwarding.relativePaths`
  in `babel.config.js`. After babel config changes, run `bunx expo start --clear`.

- Metro is patched (`patches/metro@0.84.5.patch`, `metro-runtime@0.84.5.patch`,
  backlog id 10) so worklet edits hot-reload without a Metro restart.

## Lessons learned

Each of these cost a debugging session. Read before touching the pipeline.

### Runtimes & worklets (bundle mode)

- **Runtimes don't share memory.** JS, UI and each worker runtime are separate
  Hermes VMs; captured values are *copied* into a worklet. Share within one
  runtime via a keyed `globalThis` registry (`particleBuffers.ts`,
  `renderPool.ts`). Across runtimes you need a copy or native-owned memory.
- **Imports inside a worklet re-evaluate on the UI runtime.** A value import of
  `react-native-skia` used in a worklet throws "Accessing TurboModules is not
  allowed on Worklet Runtimes". Capture on JS (`const skia = Skia`) and pass
  it in; import Skia as types only in worklet modules. Same for logging:
  `scheduleOnRN(console.log, …)` fails, pass a JS-defined `log` function.
- **The plugin strips a bare `void sv.value;` statement**, which drops `sv` from
  the worklet's `__closure`, so a derived value never re-runs (frozen
  particles). Make the read do work (`if (frame.value === 0) return EMPTY`).
  The truth is the factory params in
  `node_modules/react-native-worklets/.worklets/<hash>.js`.

### Reanimated

- **SharedValue initial values are built on JS and copied to UI.** Build big
  render arrays lazily on UI inside worklets. `useDerivedValue` runs once on
  JS at mount, so return an empty constant when the UI registry is absent.
- **A derived value must depend on whatever makes its inputs ready.** The
  first UI run precedes the driver's allocation; with only `activeCount` as a
  dependency it never re-runs (blank canvas). Depend on `frame`.
- **Listeners are skipped when the new value `===` the old one.** Returning
  the same mutated array never redraws Atlas, so alternate two arrays.

### Skia

- **`useRSXformBuffer`'s mapper did not re-run per frame here** (only on React
  renders), and `useRectBuffer` starts a mapper per render (leak). Own the
  buffers and drive them from `frame`.
- **Native `drawAtlas` throws if transforms/sprites lengths differ**, and the
  throw kills the whole Canvas picture. Derive one length from the other.
- **Draw sprites on `Skia.Surface.Make` (CPU raster).** `MakeOffscreen` can
  return null before the GPU context exists.

### Layout

- iOS lays the screen out at full height first; the header corrects it later.
  Never seed geometry from `useSharedValue(initial)`; write it in `onLayout`.

### Verifying on the Simulator

- **Verify motion, not presence.** Diff two 1:1 crops taken 1 s apart
  (`magick compare -metric AE`) after a **cold** start. A hot reload can leave
  a frozen last frame that looks like success.
- Downscaled full-screen captures hide 3–5 px sprites. Crop at full
  resolution before calling a canvas blank.
- "Blank on open, works after re-entering" was once stale, unpatched Metro
  serving mismatched `.worklets` files. Rule out Metro first.

## Status & handoff

Where everything lives (backlog is local/gitignored):

| What | Where |
|---|---|
| Orchestrator handoff: current state, lessons, testing, start prompt | `backlog/docs/black-hole-handoff.md` |
| Task specs | `backlog/tasks/` — `bl board` (ids below) |
| Original brief | claude.ai doc "RN Multi-Threading Showcase — Black Hole Vortex" |
| Code | `src/components/black-hole-text/pipeline/` (see Files) |

| Backlog id | Task | State |
|---|---|---|
| 4 | P1 pipeline + dummy orbits | done |
| 8 | P1b growing RSXform pool + `useDerivedValue`, no remount | done (verified on Simulator) |
| 9 | P1c blank canvas after dev reload | done |
| 5 | P2 real physics + JS / UI / worker drivers | **next**: plan + subtasks 5a–5g in spec |
| 6 | P3 Nitro C++ step | todo |
| 7 | P4 WebGPU/TypeGPU compute | todo |
| 10 | Metro picks up `.worklets` without restart | done |

## Tasks

- Task 0 — scaffold ✅
- Task 1 — Phase 1 pipeline + dummy orbits ✅ working on Simulator (P1b/P1c follow-ups)
- Task 8 — P1b no-remount count switching ✅
