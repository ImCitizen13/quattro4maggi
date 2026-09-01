# May the Fourth rendering module

Reusable WebGPU scenes and supporting utilities for the
[`/may-the-fourth`](../../app/may-the-fourth/README.md) Expo Router screen.
Together they render a procedural hyperspace starfield, animated image
bubbles, and a refractive glass bubble.

## Tutorials

- [Sequential tutorial](./tutorials/SEQUENTIAL.md) — build the feature in six
  stages: WebGPU helper, image loading, layer composition, bubble shaders,
  galaxy shader, and the complete screen.
- [Plug-and-play guide](./tutorials/PLUG_AND_PLAY.md) — copy the scenes into
  another Expo/React Native project and choose the layer combination you need.

## Architecture

The feature separates lifecycle, drawing, and composition:

1. The route measures the canvas, owns interaction refs, and selects the
   layers.
2. `useWebGPU` creates and configures the GPU canvas, initializes the composed
   scene, runs the animation loop, forwards resizes, and performs cleanup.
3. Each layer creates its own pipeline and resources once, then receives a
   render target every frame.
4. `composeLayered` decides whether layers can draw directly to the swapchain
   or need offscreen textures for backdrop sampling.

### Layer contract

A layer is a factory that may initialize synchronously or asynchronously:

```ts
type LayerScene = (props: SceneProps) =>
  | LayerSceneResult
  | Promise<LayerSceneResult>;

interface LayerSceneResult {
  render(
    timestamp: number,
    attachment: {
      view: GPUTextureView;
      loadOp: "clear" | "load";
    },
    backdrop: GPUTextureView | null,
  ): void;
  resize?(width: number, height: number): void;
  cleanup?(): void | Promise<void>;
}
```

Layers do not call `context.getCurrentTexture()` themselves. They draw into
the attachment supplied by the composer. A layer marked `readsBackdrop`
receives the cumulative output of the layers behind it as a sampleable texture
view.

### Composition paths

If no layer reads the backdrop, `composeLayered` uses its fast path: every
layer draws directly to the swapchain. The first layer clears it and later
layers load the existing color.

When at least one layer reads the backdrop, the composer allocates two
sampleable render textures and ping-pongs between them:

```text
starfield ──clear──► texture A
bubbles   ──load───► texture A
center bubble:
  sample texture A ─► render to texture B
texture B ──blit───► swapchain ──present──► screen
```

Reader layers render to the texture opposite the current backdrop, avoiding
an illegal read/write of the same texture. The composer reallocates both
offscreen textures on resize and destroys them during cleanup.

## Rendered layers

### Procedural starfield

[`scene.ts`](./scene.ts) creates a fullscreen TypeGPU pipeline using
[`shaders.ts`](./shaders.ts). The fragment shader builds several randomized
star layers without image textures. Its uniforms control:

- canvas resolution;
- camera/look offset;
- accumulated rotation and forward time;
- radial hyperspace versus disc-star rendering;
- a spring-smoothed forward speed that morphs dots into streaks.

The CPU scene advances independent clocks only while their corresponding refs
are enabled. Forward speed uses a spring-damper response, while camera offset
uses exponential smoothing.

### Moving image bubbles

[`movingBubbleScene.ts`](./movingBubbleScene.ts) turns encoded Skia image data
into GPU textures and renders one alpha-blended quad per image. Each sprite:

- spawns near the center at a far depth;
- approaches the camera by decreasing its `z` value;
- moves outward naturally through perspective projection;
- grows with a depth curve and respawns after leaving the viewport;
- participates in a depth-based visibility wipe when forward flight toggles.

The simulation and projection functions live in
[`movingBubbleMath.ts`](./movingBubbleMath.ts), which has no React Native or
GPU dependencies and is covered by unit tests.

`createBubbleScene` accepts these useful options:

```ts
createBubbleScene({
  datas,
  forwardEnabledRef,
  speedFactor: 1.2,
  sizeRange: [0.25, 0.7],
  fadeRate: 2,
});
```

For lower-level tuning—spawn depth, acceleration, size curve, spawn radius,
or near-depth alpha—edit `DEFAULTS` in `movingBubbleMath.ts`.

### Center glass bubble

[`centerBubbleScene.ts`](./centerBubbleScene.ts) draws a centered quad around a
pixel-sized bubble. Its fragment shader samples the backdrop to produce lens
distortion, rim color separation, highlights, and a shadow halo. The route
currently creates it with a `200` px radius:

```ts
createCenterBubbleScene({ radiusPx: 200 });
```

Because the shader reconstructs the complete output from the sampled
backdrop, the layer clears its destination rather than alpha-blending over it.

## Asset pipeline

[`hooks/useLoadImages.tsx`](./hooks/useLoadImages.tsx) loads the generated
asset list from `assets/Bubbles/128/images.generated.ts` in parallel:

```text
React Native asset id
  └─► resolve URI
       └─► encoded SkData
            └─► decode inside scene factory
                 └─► GPUTexture on the rendering device
```

Keeping GPU upload inside the scene factory is important: WebGPU resources
belong to a specific device and cannot be bound to pipelines created by
another device.

To update the image set, add or remove images in `assets/Bubbles/128`, then
update `assets/Bubbles/128/images.generated.ts` with corresponding static
`require(...)` entries. The generic `generate:images` script currently targets
a different image collection, so it does not regenerate this feature's list.

## File map

| File | Purpose |
| --- | --- |
| [`composeLayered.ts`](./composeLayered.ts) | Layer contracts, direct-render fast path, offscreen ping-pong path, final blit, resize, and cleanup. |
| [`scene.ts`](./scene.ts) | Starfield scene factory and CPU-side animation response. |
| [`shaders.ts`](./shaders.ts) | Fullscreen starfield vertex and fragment shaders. |
| [`gpuTypes.ts`](./gpuTypes.ts) | Starfield uniform structure. |
| [`layouts.ts`](./layouts.ts) | TypeGPU bind-group layouts for the starfield and bubble pipelines. |
| [`movingBubbleScene.ts`](./movingBubbleScene.ts) | Animated textured-sprite pipeline and GPU resource ownership. |
| [`movingBubbleMath.ts`](./movingBubbleMath.ts) | Pure spawn, motion, projection, size, alpha, and exit math. |
| [`movingBubbleMath.test.ts`](./movingBubbleMath.test.ts) | Unit tests for the pure sprite simulation. |
| [`centerBubbleScene.ts`](./centerBubbleScene.ts) | Backdrop-sampling glass bubble shader and scene. |
| [`hooks/useLoadImages.tsx`](./hooks/useLoadImages.tsx) | Batch loading of encoded bubble image data. |
| [`perf/perfMarks.ts`](./perf/perfMarks.ts) | Development-only timing samples and percentile logging. |
| [`bubbleScene.ts`](./bubbleScene.ts) | Older static/grid bubble implementation; not used by the route. |
| [`StarWarsCredits.tsx`](./StarWarsCredits.tsx) | Optional Skia/Ease opening-crawl experiment; not used by this route. |
| [`imageAsStarsShader.ts`](./imageAsStarsShader.ts) | Experimental image/star shader utilities; not used by the current layer stack. |

## Adding another layer

Create a layer factory that follows the attachment contract:

```ts
const createOverlay = (): LayerScene => ({ device, presentationFormat }) => {
  // Create the pipeline, buffers, and bind groups once.

  return {
    render: (timestamp, attachment, backdrop) => {
      // Encode draws using attachment.view and attachment.loadOp.
    },
    resize: (width, height) => {
      // Refresh cached size-dependent state.
    },
    cleanup: () => {
      // Destroy resources owned by this layer.
    },
  };
};
```

Then add it in back-to-front order:

```ts
composeLayered([
  { scene: starfield },
  { scene: overlay },
  { scene: centerBubble, readsBackdrop: true },
]);
```

Set `readsBackdrop: true` only when the new layer actually samples the
accumulated image. Doing so selects the offscreen composition path for the
whole stack.

## Testing and debugging

Run the pure moving-bubble tests from the project root:

```sh
bun test components/may-the-fourth/movingBubbleMath.test.ts
```

TypeGPU shader compilation and WebGPU validation happen at runtime. If a
screen renders black, inspect the native development logs for validation or
shader errors. Setup is wrapped by `useWebGPU` error scopes, and
`perfMarks.ts` reports asset-loading and upload timings in development builds.

When changing GPU code, preserve these ownership rules:

- Create textures, buffers, bind groups, and pipelines with the device passed
  to the scene factory.
- Destroy every layer-owned GPU resource in `cleanup`.
- Rebuild size-dependent textures or cached dimensions in `resize`.
- Let the composer choose the render target and `loadOp`.
- Never sample a texture in the same pass that writes to it.

## Current limitations

- Moving sprites use one texture, bind group, and draw call per image; there is
  no texture atlas or instanced batching.
- Any backdrop-reading layer activates two full-size offscreen textures and a
  final fullscreen blit.
- The animation loop is managed by `useWebGPU`; the empty `useFrameCallback`
  in the route does not currently drive rendering.
- Rotation and device-tilt plumbing exist, but the current route only exposes
  tap-to-toggle forward flight.
