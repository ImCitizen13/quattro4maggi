# Skia + WebGPU Vortex

Route: `/skia-webgpu-vortex` (native tabs). Reuses the black-hole vortex from
`components/black-hole-gpu`.

| Tab | Status |
| --- | --- |
| Skottie | Working: scrollable Skottie list (`useSkottieListSource`) in `VortexCanvas`, full Black Hole GPU HUD + settings (`SkottieVortex`) |
| WebGPU | Working: `VortexCanvas` over a Skia-animated shared texture (`LiveCanvasCard`), Destroy/Reset, standby vs running frame stats |
| Snapshot | Working: `VortexSnapshot` around an RN card, Destroy/Reset |

Unfocused tabs unmount their content (`useIsFocused`) so no GPU work runs hidden.
A tab switch mid-run unmounts the canvas (scene teardown) and the texture owner
destroys the texture 200 ms later.

## Architecture

```
Skia (Skottie list, Skia.Surface.MakeFromGPUTexture)
   └─► shared GPU texture (WebGPU device shared with Skia, physical px)
         └─► VortexCanvas
               ├─ standby: vortex layer draws the texture 1:1 (no compute)
               └─ run:     tiles sample the same texture, fall into the hole
                     └─► lens layer ─► blit to the swapchain
```

Frame order (one UI-worklet frame, one present):
`drawSource(t)` (Skia clears, draws visible cards, `flush()`) ─► vortex layer ─►
lens layer ─► blit. The run's frame 0 samples the same texture as the last
standby frame, so Destroy has no pop and no capture step (no snapshot, no view swap).

Skottie tab: `SkottieVortex` measures the stage, `useSkottieListSource(stage)`
builds texture + `drawSource` + pan, and the HUD (Destroy, Pause/Reset, scrubbable
`ProgressBar`, gear → `SettingsPanel` Sim/Lens, Black hole lens preset) is the
Black Hole GPU one. The source stays live during the run (tiles keep animating);
the Sim tab has "Freeze content on Destroy" (the `drawSource` wrapper skips
drawing while a run is active).

## Gesture split

| State | List pan | Scrubber |
| --- | --- | --- |
| standby (`idle`) | scrolls (`scrollEnabled = true`) | dimmed |
| running / paused / done | ignored (`scrollEnabled = false`, momentum cancelled) | active |
| after Reset | scrolls again | dimmed |

## Measuring on device

Metro logs:
- `[SkottieVortex] tap→first running frame N ms` once per Destroy (press to the
  run's first presented frame; compare with the ~430 ms snapshot path).
- `[VortexCanvas] standby|running <fps> fps  <ms> ms/frame  encode <ms>  skia <ms>`
  every 30 frames (use the 4 px tile chip for the 60 fps check).

## Measurements

| Metric | Result |
| --- | --- |
| Tap → first GPU running frame (Skottie list) | 15 ms (iPhone 17 Pro simulator) |
| Tap → first GPU frame (snapshot path, baseline) | ~430 ms |
| Standby fps / ms per frame / skia ms | 60 fps / 16.67 ms / 0.4–1.2 ms, encode 0.3–0.8 ms (iPhone 17 Pro simulator) |
| Running fps / ms per frame, 8 px tiles | not measured (simulator run used 4 px tiles) |
| Running fps / ms per frame, 4 px tiles | 58–60 fps at 122,310 tiles, encode ~1.0 ms (1.1–1.6 ms in the Skia+WebGPU tab), skia 0.7–1.1 ms (iPhone 17 Pro simulator) |
| Raw Jitter Lottie (wabi-and-more_dark) plays, no crash | Pass on the iPhone 17 Pro simulator (Skia 3.8.1, no `nm` workaround) |

These are simulator numbers, not a physical iPhone.

## Skottie list source

`useSkottieListSource(stage)` (`useSkottieListSource.ts`, layout in
`skottieListLayout.ts`) returns `{ source, drawSource, gesture, scrollEnabled,
offset, layout }`. It parses each Lottie once, owns and delayed-destroys its
texture, and exposes draw cost as `sourceMs` in the canvas `onStats`.
