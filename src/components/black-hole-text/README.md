# Black Hole Text

A multi-threading showcase: a particle vortex orbiting a black hole, where the
**physics source is swappable** and the **render path is fixed** (Skia Atlas,
one draw call). Compare frame time, step time and max stable particle count
per execution strategy.

**Status:** Phase 1 (pipeline + dummy data).

## Architecture

```
Controls (SharedValues: count, center, mass, timeScale)
      │
      ▼
PhysicsSource ── init(state, out, count, bounds)   ← swappable
      │          step(state, out, count, params, dt)  (worklets, plain-number params)
      ▼
Driver ───────── decides WHERE/WHEN step runs        ← swappable
      │          (Phase 1: useUiDriver = useFrameCallback)
      ▼
out buffer ───── Float32Array, STRIDE 4: x, y, rotation, scale  ← render contract
      │
      ▼
ParticleRenderer ─ Canvas + Atlas (useRSXformBuffer), 1 draw call, UI thread
      │
      ▼
HUD ──────────── FpsOverlay (ui row) + source / count / step ms
```

- `state` is private to a source (its physics state). Only `out` is read by
  the renderer, so it is the only buffer that ever needs to cross threads.
- Sources take plain numbers, not SharedValues: the driver reads the
  SharedValues and passes values in, so one `step` can run on any runtime.

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
- `pipeline/constants.ts` — OUT_STRIDE, PARTICLE_COUNTS, sprite size, HUD interval
- `pipeline/types.ts` — ParticleBuffers, Bounds, StepParams, PhysicsSource
- `pipeline/particleBuffers.ts` — allocates `state` + `out` once, calls `source.init`
- `pipeline/sources/dummyOrbits.ts` — Kepler circular orbits (ω ∝ r^-1.5), worklet init/step
- `pipeline/drivers/useUiDriver.ts` — `useFrameCallback` driver; buffers in one SharedValue; `PhysicsDriver` type
- `pipeline/ParticleRenderer.tsx` — Canvas + single Atlas, `useRSXformBuffer`, black hole placeholder disc
- `pipeline/PipelineHud.tsx` — source / count / step ms readout + count chips
- `pipeline/ParticlePipeline.tsx` — measures size, wires buffers + driver + renderer
- `babel.config.js` — worklets `importForwarding` entry for this folder

## Notes

- The route uses a plain `View`, not `ThemeView`: `ThemeView` centers its
  children, which collapses a flex-only canvas to 0x0.
- `src/components/black-hole-text` is listed in `importForwarding.relativePaths`
  in `babel.config.js`. After babel config changes, run `bunx expo start --clear`.

## Tasks

- Task 0 — scaffold ✅
- Task 1 — Phase 1 pipeline + dummy orbits ✅ implemented (pending on-device check)
