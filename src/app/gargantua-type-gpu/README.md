# May the Fourth screen

An interactive, full-screen WebGPU experience built with Expo Router,
`react-native-wgpu`, and TypeGPU. The route combines a procedural starfield,
image bubbles that fly toward the viewer, and a centered glass bubble that
refracts the layers behind it.

The reusable rendering implementation lives in
[`components/may-the-fourth`](../../components/may-the-fourth/README.md).

## Tutorials

- [Build it sequentially](../../components/may-the-fourth/tutorials/SEQUENTIAL.md)
- [Use it in another project](../../components/may-the-fourth/tutorials/PLUG_AND_PLAY.md)

## Experience

- The screen opens on a stationary starfield and glass bubble.
- Tap anywhere to toggle forward flight.
- During forward flight, stars stretch into hyperspace streaks and image
  bubbles fade in, grow, and move radially toward the viewer.
- Tap again to slow the starfield and hide the moving bubbles.
- The canvas follows layout changes and resizes the WebGPU scene without
  rebuilding it.

## Route files

| File | Responsibility |
| --- | --- |
| [`index.tsx`](./index.tsx) | Owns interaction state, loads bubble assets, creates the layer stack, measures the canvas, and connects the scene to `useWebGPU`. |
| [`_layout.tsx`](./_layout.tsx) | Registers the route in a headerless Expo Router stack. |

The app home screen links to this route at `/may-the-fourth`.

## Layer stack

`index.tsx` builds one composed scene in back-to-front order:

```ts
composeLayered([
  { scene: starfield },
  { scene: bubbles },
  { scene: centerBubble, readsBackdrop: true },
]);
```

The moving-bubble layer is omitted until its image data has loaded. The center
bubble declares `readsBackdrop: true` because its shader samples the
accumulated starfield and moving bubbles to create refraction.

```text
starfield ──► moving image bubbles ──► refractive center bubble ──► screen
                                              ▲
                                              └─ samples prior layers
```

The screen uses
[`useWebGPU`](../../components/scratch-2d-type-gpu/useWebGPU.tsx) for device
setup, canvas configuration, the animation loop, resize handling, and cleanup.
See its [companion guide](../../components/scratch-2d-type-gpu/useWebGPU.md)
for the lifecycle contract.

## State and data flow

The screen keeps frequently read animation flags in refs so GPU scenes can
observe changes every frame without being recreated:

| Value | Current behavior |
| --- | --- |
| `forwardEnabledRef` | Toggled by tapping; drives star movement and moving-bubble visibility. |
| `rotationEnabledRef` | Present for starfield rotation, but currently remains disabled. |
| `hyperspaceEnabledRef` | Currently always enabled, selecting the radial star shader. |
| `cameraOffsetRef` | Currently `{ x: 0, y: 0 }`; available for tilt/look input. |
| `canvasSize` | Updated by `onLayout` and passed to `useWebGPU` for resize handling. |

Bubble images are loaded as encoded Skia data by `useLoadImages`. Decoding and
GPU upload happen later, inside the moving-bubble scene, so every texture is
created on the same `GPUDevice` that renders it.

## Run locally

Install dependencies and start a native build:

```sh
npm install
npm run ios
# or
npm run android
```

Because this feature depends on native WebGPU, use a development/native build
rather than Expo Go. Once the app opens, select **May the Fourth** on the home
screen.

## Where to make changes

- Change the layer order or screen interaction in [`index.tsx`](./index.tsx).
- Change star density, color, or streak appearance in
  [`shaders.ts`](../../components/may-the-fourth/shaders.ts).
- Change flight response in
  [`scene.ts`](../../components/may-the-fourth/scene.ts).
- Change moving-bubble speed, size, spawn, or fade behavior in
  [`movingBubbleMath.ts`](../../components/may-the-fourth/movingBubbleMath.ts)
  and
  [`movingBubbleScene.ts`](../../components/may-the-fourth/movingBubbleScene.ts).
- Change the glass lens in
  [`centerBubbleScene.ts`](../../components/may-the-fourth/centerBubbleScene.ts).
- Add or remove bubble art in `assets/Bubbles/128`, then update
  `assets/Bubbles/128/images.generated.ts` with matching static
  `require(...)` entries.

For scene contracts and implementation details, see the
[component README](../../components/may-the-fourth/README.md).
