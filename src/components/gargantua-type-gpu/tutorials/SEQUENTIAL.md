# Build the May the Fourth effect, step by step

This tutorial builds the feature in six stages. Each stage introduces one
piece of the rendering system, and the last stage assembles the complete
interactive screen.

The finished result has three visual layers:

```text
procedural galaxy
  └─► moving image bubbles
       └─► centered glass bubble that refracts everything behind it
```

This is a React Native/Expo native feature. It uses `react-native-wgpu`,
TypeGPU, and Skia image decoding, so run it in a native development build
rather than Expo Go.

> **Video placeholder — finished effect**
>
> Add a 10–15 second portrait recording showing the stationary galaxy, a tap
> to enter forward flight, moving image bubbles, the center glass refraction,
> and a second tap to stop. Suggested file:
> `media/sequential/00-finished-effect.mp4`.

## Media placeholder convention

The callouts labeled **Image placeholder** and **Video placeholder** are
editorial markers. Replace each callout with the final media and its caption
when the asset is ready. Suggested filenames are relative to this tutorial's
future `media` directory; they are not links yet, so the document remains free
of broken assets.

## Before you start

The relevant project pieces are:

```text
components/
├── scratch-2d-type-gpu/
│   └── useWebGPU.tsx
└── may-the-fourth/
    ├── hooks/useLoadImages.tsx
    ├── composeLayered.ts
    ├── movingBubbleScene.ts
    ├── movingBubbleMath.ts
    ├── centerBubbleScene.ts
    ├── scene.ts
    ├── shaders.ts
    ├── layouts.ts
    └── gpuTypes.ts
```

TypeGPU source transformation is enabled in
[`babel.config.js`](../../../babel.config.js):

```js
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["unplugin-typegpu/babel"],
  };
};
```

## 1. Use the WebGPU helper

[`useWebGPU.tsx`](../../scratch-2d-type-gpu/useWebGPU.tsx) keeps WebGPU
lifecycle code out of the feature. You do not need to understand its internals
to build a scene.

Give the hook:

- a scene factory;
- a dependency list;
- the measured layout size of the canvas.

It gives you a ref for `react-native-wgpu`'s `Canvas`:

```tsx
const canvasRef = useWebGPU(scene, [scene], canvasSize);

return (
  <View style={StyleSheet.absoluteFill} onLayout={onCanvasLayout}>
    <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
  </View>
);
```

The helper handles the repetitive work:

- waits for a GPU device and a non-zero canvas size;
- configures the WebGPU canvas at the device pixel ratio;
- initializes the scene once;
- calls `scene.render(timestamp)` every animation frame;
- presents each frame;
- forwards layout changes to `scene.resize`;
- stops the loop and calls `scene.cleanup` on unmount.

The screen should measure layout points rather than guessing the canvas size:

```tsx
const [canvasSize, setCanvasSize] = useState<{
  width: number;
  height: number;
} | null>(null);

const onCanvasLayout = (event: LayoutChangeEvent) => {
  const { width, height } = event.nativeEvent.layout;

  setCanvasSize((current) =>
    current?.width === width && current?.height === height
      ? current
      : { width, height },
  );
};
```

That is all the helper knowledge needed for this feature. The remaining
sections focus on what gets rendered.

> **Image placeholder — lifecycle overview**
>
> Add a simple diagram of `Screen → useWebGPU → scene.render → present`, with
> resize and cleanup shown as side paths. Suggested file:
> `media/sequential/01-webgpu-lifecycle.png`.

## 2. Load the bubble images

React Native image imports return numeric asset IDs. The feature resolves each
ID to a URI and asks Skia to load its still-encoded bytes as `SkData`:

```text
static require(...)
  └─► React Native asset ID
       └─► resolved URI
            └─► encoded SkData
```

The asset module must use static `require(...)` calls so Metro can bundle the
images:

```ts
export const imageArray = [
  require("./bubble-one.png"),
  require("./bubble-two.png"),
  require("./bubble-three.png"),
] as const;
```

The included [`useLoadImages`](../hooks/useLoadImages.tsx) hook imports this
project's list from `assets/Bubbles/128/images.generated.ts`, loads all images
in parallel, ignores individual failures, and returns:

```ts
const { datas, loading } = useLoadImages();
```

- `loading` is `true` while the batch is in flight.
- `datas` is `null` until loading finishes.
- Afterward, `datas` contains the successfully loaded encoded images.

The hook intentionally does **not** create `GPUTexture` objects. A WebGPU
texture belongs to the `GPUDevice` that created it. The moving-bubble scene
therefore performs the final decode and upload using the same device that owns
its render pipeline:

```text
SkData
  └─► Skia decode to RGBA pixels
       └─► device.createTexture(...)
            └─► device.queue.writeTexture(...)
```

This separation avoids device-mismatch validation errors and keeps React image
loading independent from GPU resource ownership.

> **Image placeholder — image pipeline**
>
> Add a horizontal diagram showing `require()` → asset URI → encoded `SkData`
> → decoded RGBA pixels → device-owned `GPUTexture`. Suggested file:
> `media/sequential/02-image-loading-pipeline.png`.

## 3. Understand shader layers and composition

Every visual element follows the layer contract from
[`composeLayered.ts`](../composeLayered.ts):

```ts
type LayerScene = (props: SceneProps) => {
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
};
```

The factory body runs once. It is where a scene creates pipelines, buffers,
samplers, textures, and bind groups. The returned methods have separate jobs:

| Method | When it runs | Responsibility |
| --- | --- | --- |
| `render` | Every frame | Update simulation/uniforms and encode draw calls. |
| `resize` | After a canvas size change | Refresh cached sizes or size-dependent resources. |
| `cleanup` | During teardown | Destroy resources owned by the layer. |

The important design rule is that a layer does not choose its render target.
It draws into `attachment.view` and respects `attachment.loadOp`.

Combine layers in back-to-front order:

```ts
const scene = composeLayered([
  { scene: galaxy },
  { scene: movingBubbles },
  { scene: glassBubble, readsBackdrop: true },
]);
```

### Layers that do not read the background

If no layer has `readsBackdrop: true`, the composer renders directly to the
on-screen swapchain:

```text
first layer  ── clear ──► swapchain
next layers  ── load  ──► same swapchain
```

### Layers that read the background

The glass bubble must sample the image behind it. WebGPU cannot sample from a
texture while writing to that same texture, so the composer switches to two
offscreen textures:

```text
galaxy         ──clear──► texture A
moving bubbles ──load───► texture A
glass bubble:
  read texture A ───────► write texture B
texture B       ──blit──► swapchain
```

The composer owns these textures, their resize lifecycle, and the final blit.
The glass layer only needs to declare that it reads the backdrop.

> **Image placeholder — layer composition**
>
> Add a labeled render-stack diagram with the galaxy and moving bubbles
> accumulating in texture A, the glass bubble sampling A into texture B, and
> the final blit to the screen. Suggested file:
> `media/sequential/03-layer-composition.png`.

## 4. Add the bubble shaders

“Bubble” refers to two different layers in this feature:

1. many moving, image-textured bubbles;
2. one centered glass bubble that refracts the completed background.

### 4.1 Moving image bubbles

Create the moving layer after `datas` has loaded:

```ts
const movingBubbles = createBubbleScene({
  datas,
  forwardEnabledRef,
});
```

[`movingBubbleScene.ts`](../movingBubbleScene.ts) performs the GPU work:

- decodes each `SkData`;
- creates one sampled texture per valid image;
- creates an alpha-blended quad pipeline;
- creates per-sprite rectangle and alpha uniform buffers;
- advances, projects, and draws each sprite every frame;
- destroys the buffers and textures during cleanup.

The vertex shader constructs two triangles from `vertexIndex`, so it needs no
vertex buffer. Each sprite's rectangle uniform places that quad in normalized
device coordinates. The fragment shader samples the image and multiplies its
alpha by the sprite's current visibility.

The actual flight model is ordinary TypeScript in
[`movingBubbleMath.ts`](../movingBubbleMath.ts):

```text
spawn near center at zFar
  └─► decrease z every frame
       └─► project x/z and y/z
            └─► grow near the camera
                 └─► respawn after leaving the viewport
```

Keeping this math outside the shader makes it easy to test:

```sh
bun test components/may-the-fourth/movingBubbleMath.test.ts
```

The scene's high-level controls are:

```ts
createBubbleScene({
  datas,
  forwardEnabledRef,
  speedFactor: 1.2,
  sizeRange: [0.25, 0.7],
  fadeRate: 2,
});
```

Use `forwardEnabledRef` to fade the layer in and out without rebuilding it.
The default visibility wipe reveals distant sprites before nearby ones. For
deeper tuning, edit `DEFAULTS` in `movingBubbleMath.ts`.

> **Video placeholder — moving image bubbles**
>
> Add a short recording with the glass layer temporarily disabled so the
> spawn, depth wipe, perspective growth, and respawn behavior are easy to see.
> Suggested file: `media/sequential/04-moving-image-bubbles.mp4`.

### 4.2 Center glass bubble

Create the glass layer independently of image loading:

```ts
const glassBubble = createCenterBubbleScene({
  radiusPx: 200,
  shapeN: 2,
  invertDistortion: false,
});
```

[`centerBubbleScene.ts`](../centerBubbleScene.ts) renders a fullscreen quad.
For pixels outside the bubble, its fragment shader passes the backdrop
through. Inside and around the bubble, it adds:

- radial lens distortion;
- chromatic separation near the edge;
- a six-color prismatic rim;
- a specular highlight;
- a soft outer halo.

`shapeN` changes the glass outline:

| Value | Shape |
| --- | --- |
| `1` | Diamond/pinched |
| `2` | Circle |
| `4`–`8` | Squircle |
| `16+` | Nearly square |

This layer must be registered with `readsBackdrop: true`:

```ts
const glassLayer = {
  scene: glassBubble,
  readsBackdrop: true,
};
```

Without a backdrop there is nothing for the lens to refract, and the layer
skips its draw.

> **Image placeholder — glass shader anatomy**
>
> Add a close-up still with callouts for lens distortion, chromatic edge,
> prismatic rim, specular highlight, and halo. Suggested file:
> `media/sequential/05-glass-bubble-anatomy.png`.
>
> **Video placeholder — shape and distortion variants**
>
> Add a short comparison cycling through `shapeN` values `2`, `6`, and `16`,
> followed by `invertDistortion` off/on. Suggested file:
> `media/sequential/06-glass-variants.mp4`.

## 5. Add the galaxy shader

The galaxy is split into CPU scene setup and GPU shader code:

- [`scene.ts`](../scene.ts) owns animation state, uniforms, and the pipeline.
- [`shaders.ts`](../shaders.ts) contains the TypeGPU vertex and fragment
  functions.
- [`gpuTypes.ts`](../gpuTypes.ts) defines the uniform structure.
- [`layouts.ts`](../layouts.ts) connects the uniform buffer to the shaders.

Create four stable refs and pass them to the scene:

```tsx
const rotationEnabledRef = useRef(false);
const forwardEnabledRef = useRef(false);
const cameraOffsetRef = useRef({ x: 0, y: 0 });
const hyperspaceEnabledRef = useRef(true);

const galaxy = createStarfieldScene({
  rotationEnabledRef,
  forwardEnabledRef,
  cameraOffsetRef,
  hyperspaceEnabledRef,
});
```

The scene reads these refs every frame, so changing `.current` immediately
affects rendering without allocating a new scene.

| Ref | Effect |
| --- | --- |
| `rotationEnabledRef` | Starts or pauses accumulated galaxy rotation. |
| `forwardEnabledRef` | Starts or pauses forward travel and springs star shape toward streaks or dots. |
| `cameraOffsetRef` | Moves the view direction; useful for tilt or pointer input. |
| `hyperspaceEnabledRef` | Chooses radial hyperspace stars when `true`, disc stars when `false`. |

The shader draws one fullscreen triangle and calculates every star
procedurally in the fragment stage. It:

1. converts the pixel coordinate into an aspect-corrected view ray;
2. applies camera offset and animated rotation;
3. hashes angular slices into stable star attributes;
4. creates several depth layers;
5. computes either radial streaks or grid-based disc stars;
6. converts a B–V-like temperature value into star color;
7. adds all layer contributions into the final pixel.

The most direct visual tuning constants are at the top of `shaders.ts`:

| Constant | Visual effect |
| --- | --- |
| `SLICES` | Angular star density in hyperspace mode. |
| `LAYERS` | Depth richness and shader work per pixel. |
| `DIMMER_EXP` | Distribution of bright versus dim stars. |
| `GRID_DENSITY` | Number of stars in disc mode. |
| `GRID_SHARPNESS` | Apparent size of disc-mode stars. |

The CPU-side launch/coast feel is controlled in `scene.ts` by
`SPEED_SPRING_K`, `SPEED_SPRING_D`, and `FORWARD_RATE`.

> **Video placeholder — galaxy modes**
>
> Add a side-by-side or sequential recording showing stationary dots,
> forward-flight streaks, rotation, camera offset, and disc-star mode.
> Suggested file: `media/sequential/07-galaxy-modes.mp4`.

## 6. Assemble the whole thing

The complete screen below contains only the essential feature code. It leaves
out the repository's optional performance markers and inactive experimental
controls.

```tsx
import React, { useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Canvas } from "react-native-wgpu";

import { useWebGPU } from "../../components/scratch-2d-type-gpu/useWebGPU";
import { createCenterBubbleScene } from "../../components/may-the-fourth/centerBubbleScene";
import { composeLayered } from "../../components/may-the-fourth/composeLayered";
import { useLoadImages } from "../../components/may-the-fourth/hooks/useLoadImages";
import { createBubbleScene } from "../../components/may-the-fourth/movingBubbleScene";
import { createStarfieldScene } from "../../components/may-the-fourth/scene";

export default function MayTheFourthScreen() {
  const [forwardEnabled, setForwardEnabled] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const forwardEnabledRef = useRef(forwardEnabled);
  forwardEnabledRef.current = forwardEnabled;

  const rotationEnabledRef = useRef(false);
  const cameraOffsetRef = useRef({ x: 0, y: 0 });
  const hyperspaceEnabledRef = useRef(true);

  const { datas } = useLoadImages();

  const scene = useMemo(() => {
    const galaxy = createStarfieldScene({
      rotationEnabledRef,
      forwardEnabledRef,
      cameraOffsetRef,
      hyperspaceEnabledRef,
    });

    const glassBubble = createCenterBubbleScene({
      radiusPx: 200,
      shapeN: 2,
    });

    if (!datas?.length) {
      return composeLayered([
        { scene: galaxy },
        { scene: glassBubble, readsBackdrop: true },
      ]);
    }

    return composeLayered([
      { scene: galaxy },
      {
        scene: createBubbleScene({
          datas,
          forwardEnabledRef,
        }),
      },
      { scene: glassBubble, readsBackdrop: true },
    ]);
  }, [datas]);

  const canvasRef = useWebGPU(scene, [scene], canvasSize);

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;

    setCanvasSize((current) =>
      current?.width === width && current?.height === height
        ? current
        : { width, height },
    );
  };

  return (
    <Pressable
      style={styles.container}
      onPress={() => setForwardEnabled((enabled) => !enabled)}
    >
      <View style={StyleSheet.absoluteFill} onLayout={onCanvasLayout}>
        <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
});
```

The key assembly rules are:

1. Keep interaction values in refs that scenes can read each frame.
2. Memoize the composed scene so React renders do not rebuild GPU resources.
3. Rebuild only when the loaded image data changes.
4. Put opaque/base layers first and visual overlays afterward.
5. Mark the glass bubble as a backdrop reader.
6. Pass the measured canvas size to `useWebGPU`.

At this point the feature is complete: tap the screen to launch or stop
forward flight.

> **Video placeholder — complete build**
>
> Add the final polished recording here, including the initial load, first
> interaction, full three-layer effect, resize/orientation handling if
> supported, and stop transition. Suggested file:
> `media/sequential/08-complete-build.mp4`.
>
> **Image placeholder — completed screen**
>
> Add a representative portrait screenshot for readers who cannot play the
> video. Suggested file: `media/sequential/09-completed-screen.png`.

## Next steps

- For a copy-oriented integration checklist, continue with the
  [plug-and-play guide](./PLUG_AND_PLAY.md).
- For a file-by-file technical reference, see the
  [rendering module README](../README.md).
- For more detail about the lifecycle helper, see the
  [`useWebGPU` companion guide](../../scratch-2d-type-gpu/useWebGPU.md).
