# Skia + WebGPU Vortex

Route: `/skia-webgpu-vortex` (native tabs). Reuses the black-hole vortex from
`components/black-hole-gpu`.

| Tab | Status |
| --- | --- |
| Skottie | Placeholder: Skia (Skottie) texture source, tasks 33/34 |
| WebGPU | Working: `VortexCanvas` over a Skia-animated shared texture (`LiveCanvasCard`), Destroy/Reset, standby vs running frame stats |
| Snapshot | Working: `VortexSnapshot` around an RN card, Destroy/Reset |

WebGPU tab flow: `drawSource(t)` (Skia draws a rotating gradient + dots into the
shared texture, flush) ─► vortex standby/run ─► lens ─► blit, one UI-worklet
frame. Frame stats print as `[VortexCanvas] standby|running ...` every 30 frames.

Unfocused tabs unmount their content (`useIsFocused`) so no GPU work runs hidden.

## Skottie list source (task 33, not mounted yet)

`useSkottieListSource(stage)` (`useSkottieListSource.ts`, layout in
`skottieListLayout.ts`) returns `{ source, drawSource, gesture, scrollEnabled,
offset, layout }`. Task 34 wraps `VortexCanvas` (`source`, `drawSource`) in a
`GestureDetector gesture={gesture}` and sets `scrollEnabled.value = false` while
the vortex runs. Draw cost is the canvas `onStats` `sourceMs`.
