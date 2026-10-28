# Skia + WebGPU Vortex

Route: `/skia-webgpu-vortex` (native tabs). Reuses the black-hole vortex from
`components/black-hole-gpu`.

| Tab | Status |
| --- | --- |
| Skottie | Placeholder: Skia (Skottie) texture source, tasks 33/34 |
| WebGPU | Placeholder: animated TypeGPU gradient as a WebGPU texture source, later |
| Snapshot | Working: `VortexSnapshot` around an RN card, Destroy/Reset |

Unfocused tabs unmount their content (`useIsFocused`) so no GPU work runs hidden.
