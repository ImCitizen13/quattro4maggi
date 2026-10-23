# Black Hole GPU

A React Native view is snapshotted into a WebGPU texture, cut into tile
particles (one per 8 / 4 / 2 px tile, up to ~470K on an iPhone 17 Pro), and
swallowed by a black hole. Physics and rendering are all GPU: a compute pass
steps the particles, one instanced draw renders them. No Skia, no Atlas, no
CPU readback. The render loop runs on the UI runtime.

**Status:** id 11 done, id 12 done except 12f (lens layer) and the 120 Hz
device reading. See [Status & handoff](#status--handoff).

## Architecture

```
push transition ends (transitionEnd, 1 s fallback)
  └─ snapshot texture (layout px) + standby scene, built once
       rebuilt only on tile change or layout size change
          │ setup, JS thread (vortexScene.ts)
          ▼
     TypeGPU root · Params uniform (96 B) · Particle buffer (32 B × N)
     init / step compute · bg / tile render pipelines · bind groups   ← all built once
          │ transferred to the UI runtime (useWebGPUOnDevice, ui-worklet)
          ▼
render(ts) 'worklet', every frame — reads SharedValues:
   phase  0 → one transparent frame, then return false (hook skips present)
          new id → reset clock + hole spring, write seed/sticky,
                   init dispatch + frame 0 in one submit, scheduleOnRN(onStarted)
   speed  timeScale 0.25×–4× (clamped in the worklet)
   frame: fixed-step accumulator (h = 1/120) → hole spring → writePartial
          → compute step → bg (clear) + 6 × N instanced tiles → submit

Release ─► 120 ms ─► captureInto(scene texture) (~0.3 s) ─► phase = ++runId
Reset   ─► phase = 0, show the RN view
Sticky / Release mid-run ─► phase = ++runId (same texture, no rebuild)
```

Timeline of one run (sim time, scaled by speed): the hole spring grows in
from 0 s and overshoots once; the radial release wave starts at 0.6 s; each
tile's forces ramp in over `ramp` s. Sticky tiles release up to 1.6 s late
and ramp up to 3× slower.

## Files

- `src/app/black-hole-gpu/index.tsx` — route (plain `View`, not `ThemeView`)
- `BlackHoleGpu.tsx` — state only: transition gate, snapshot texture, scene memo, phase/seed/sticky/speed SharedValues, HUD
- `DemoContent.tsx` — the RN view that gets swallowed (`collapsable={false}`, reports image load)
- `snapshot.ts` — `createSnapshotTexture`, `captureInto` (`queue.drawElementImageToTexture`)
- `vortexScene.ts` — scene factory for `useWebGPU`: setup, `frame` / `clearFrame` / `render` worklets, `VortexConfig` defaults
- `vortexShaders.ts` — raw WGSL bodies in TypeGPU shells (`initFn`, `stepFn`, `bgVs/Fs`, `tileVs`), `tileFs` in TGSL; helpers `hash`, `horizonOf`, `cellHash`, `stickOf`
- `gpuTypes.ts` — `Particle` (pos, vel, home, release, state) and `Params` schemas
- `layouts.ts` — compute vs render bind group layouts (both group 0)
- `../gargantua-type-gpu/hooks/useWebGPU.tsx` — shared hook; `useWebGPUOnDevice` shares the snapshot's device; `render` returning `false` skips `present()`
- `babel.config.js` — `importForwarding` entry for this folder

## Physics

- Velocity field, not forces: sink + point vortex, `v = c/r · (inward + swirl · tangent)`.
  Inflow is always positive, so no orbit can balance it; paths are log spirals.
- Velocity relaxes toward the field at `max(drag, 3 · |field| / r)`, so tiles
  accelerate from rest and don't ring near the hole.
- A tile is consumed when it crosses the (spring-scaled) horizon.
- Stickiness: value noise on the home position (cell ≈ 0.06 × short side,
  smoothstep 0.5–0.8 → about a third of the screen) plus ±0.1 per-tile jitter.
  A new seed each run; the Sticky chip writes `sticky = 0` (off).

## Controls

| Control | Effect | Rebuild? |
|---|---|---|
| Release | capture + start a run (mid-run: restart, no recapture) | no |
| Reset | idle, RN view back | no |
| 8 / 4 / 2 px | particle count | yes (mid-run: restarts at once on the same texture) |
| Sticky | patches on/off (mid-run: restart) | no |
| Speed × | 0.25×–4×, live | no |

## Measurements (iPhone 17 Pro Simulator, 60 Hz cap)

| | Value |
|---|---|
| Tiles (8 / 4 / 2 px) | 29,596 / 118,082 / 470,943 |
| Encode ms (CPU in `frame`) | ~0.5–0.9 |
| Capture (`drawElementImageToTexture`) | ~300 ms, blocks the platform UI thread |
| Release tap → first GPU frame | 433–458 ms (120 ms delay + capture + ~20 ms) |
| Arrival | one ~216 ms hitch ~0.4 s after the push ends (pre-build handoff, still screen) |
| Cold motion AE (8 / 4 / 2 px) | 295K / 283K / 271K (only `0` = frozen is a fail) |

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
- `performance.now` exists on the UI runtime; avoid `toLocaleString` there
  (stats are formatted on JS).

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

## Status & handoff

| What | Where |
|---|---|
| Orchestrator handoff (state, lessons, testing, start prompt) | `backlog/docs/black-hole-gpu-handoff.md` |
| Task specs | `backlog/tasks/` — `bl show --id 12` |
| Phase 1 CPU demo (comparison) | `src/components/black-hole-text/` |

| Backlog id | Task | State |
|---|---|---|
| 11 | GPU v1: snapshot → compute vortex | done |
| 12 | GPU v2: speed, no shatter, stickiness, UI loop, lens | 12a–12e done; 12f lens + 120 Hz device reading open |
| 13 | GPU v3: white-explosion choreography | blocked by 12 |
| 14 | Wrapper that swallows any view by ref | todo |
