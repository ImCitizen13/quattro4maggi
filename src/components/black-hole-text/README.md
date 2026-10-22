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
| 5 | P2 real physics + JS / UI / worker drivers | spec has physics + product decisions |
| 6 | P3 Nitro C++ step | todo |
| 7 | P4 WebGPU/TypeGPU compute | todo |
| 10 | Metro picks up `.worklets` without restart | done |

## Tasks

- Task 0 — scaffold ✅
- Task 1 — Phase 1 pipeline + dummy orbits ✅ working on Simulator (P1b/P1c follow-ups)
- Task 8 — P1b no-remount count switching ✅
