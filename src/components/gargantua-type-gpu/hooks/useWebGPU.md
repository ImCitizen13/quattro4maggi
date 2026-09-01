# `useWebGPU` + `composeLayered` — A Small Tutorial

Two pieces, one idea: **separate "how a frame gets on screen" from "what the
frame looks like."** `useWebGPU` owns the lifecycle; scenes own the drawing;
`composeLayered` stacks scenes together. None of the three knows the others'
internals.

> Companion read: [`app/may-the-fourth/README.md`](../../app/may-the-fourth/README.md)
> has the full architecture writeup and the slow-path diagram.

---

## TL;DR

- **`useWebGPU(sceneFactory, deps, size)`** is a React hook that handles all the
  boilerplate of WebGPU on `react-native-wgpu`: acquiring the device, sizing the
  canvas, configuring the swapchain, running the `requestAnimationFrame` loop,
  resizing, cleanup, and wrapping setup in GPU error scopes. You give it a
  **scene factory** and a measured **size**; it gives you a `canvasRef`.
- A **scene** is just a factory: it runs setup once (buffers, pipelines, bind
  groups) and returns `{ render(timestamp), cleanup?, resize? }`.
- **`composeLayered([...])`** merges several scenes into one. Layers render in
  stack order; a layer can read everything drawn behind it with
  `readsBackdrop: true`. The composer decides where each layer draws and whether
  it clears or loads — scenes stay unaware of their position.

---

## How to use it

### 1. A minimal scene

```ts
const myScene: Scene = ({ device, context, presentationFormat, canvasWidth }) => {
  // ── setup runs ONCE ──
  const pipeline = /* build pipeline, buffers, bind groups */;

  return {
    render: (timestamp) => {
      // ── runs EVERY frame ──
      // draw into the swapchain
    },
    cleanup: () => {
      // release GPU resources
    },
    resize: (w, h) => {
      // refresh anything cached at setup (iResolution, layout, …)
    },
  };
};
```

### 2. Wire it into a screen

```tsx
export default function Screen() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const scene = useMemo(() => myScene, []);
  const canvasRef = useWebGPU(scene, [scene], size);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill} />
    </View>
  );
}
```

Passing the measured `size` is the recommended path: setup waits for the first
non-zero size and any later layout change triggers a clean resize (swapchain +
`context.configure` + `scene.resize`) **without tearing down the scene**. Omit
`size` to fall back to the legacy poll-then-freeze behaviour.

### 3. Stack scenes with `composeLayered`

```ts
const scene = composeLayered([
  { scene: starfield },                          // base layer
  { scene: bubbles },                            // stacked on top
  { scene: centerBubble, readsBackdrop: true },  // glass — samples what's behind it
]);

const canvasRef = useWebGPU(scene, [scene], size);
```

`composeLayered` returns a scene factory that's contract-compatible with
`useWebGPU`, so the hook can't tell the difference between a single scene and a
composed one.

---

## The compose mechanism in one picture

```
                    composeLayered([ starfield, bubbles, centerBubble* ])
                                              │  (* readsBackdrop)
                    ┌─────────────────────────┴──────────────────────────┐
                    │                                                      │
        FAST PATH (no backdrop reader)              SLOW PATH (≥1 reader)
        every layer → swapchain directly            ping-pong texA / texB
                                                     + final blit to swapchain

  FAST:  starfield ─clear─►┐
         bubbles   ─load──►│ swapchain ──► present()
                           ┘

  SLOW:  starfield ─clear─► texA ┐
         bubbles   ─load──► texA │ (still accumulating)
         centerBubble: read texA as backdrop, write texB (clear)
                           │
                           └─ blit texB ──► swapchain ──► present()
```

The composer owns three decisions so each scene doesn't have to:

| Decision | Fast path | Slow path |
|---|---|---|
| **Where do I draw?** | swapchain | a ping-pong texture (`texA`/`texB`) |
| **Clear or load?** | layer 0 clears, rest load | first write to a texture clears, rest load; readers always clear |
| **What can I read?** | nothing (`backdrop = null`) | a reader gets a view of the cumulative image behind it |

A reader renders into the *other* texture while sampling the current one — so
there's no need to copy the swapchain or stall the pipeline. After all layers, a
**blit** (fullscreen-triangle passthrough pass) copies the final offscreen image
onto the swapchain.

---

## Advantages over the raw approach

The "raw approach" = each screen hand-writes `useDevice` + RAF loop +
`context.configure` + manual draw wiring inline.

| | Raw, hand-wired | `useWebGPU` + `composeLayered` |
|---|---|---|
| **Lifecycle** | re-implemented per screen, easy to leak (forgotten `cancelAnimationFrame`, no cleanup) | centralised: RAF start/stop, unmount teardown, async-init cancellation all handled once |
| **Resize** | usually frozen at first layout, or a bespoke listener | push-based via `onLayout` → swapchain + `context.configure` + `scene.resize`, no scene teardown |
| **Error visibility** | silent GPU validation failures | setup wrapped in `withValidate` error scopes → surfaces in RN logs |
| **Composition** | layers tangled into one render fn; hard to reorder/add/remove | drop a layer into an array; reorder = reorder the array |
| **Backdrop effects** | manual offscreen textures, ping-pong bookkeeping, blit, clear/load logic per screen | composer owns ping-pong + blit + clear/load; opt in with one flag |
| **Scene reuse** | coupled to a specific screen's swapchain | a scene renders into *any* attachment → reusable and testable in isolation |
| **Zero-cost when simple** | n/a | fast path renders straight to swapchain — no overhead vs hand-wiring when no layer reads the backdrop |

The core win: **scenes are small and position-agnostic.** A scene never grabs
`context.getCurrentTexture()` itself — it renders into whatever `attachment` it's
handed and optionally samples a `backdrop`. That single contract change is what
makes scenes stackable and the composer possible.

---

## Future improvements

(From the README's ranked list — first three are throughput wins that don't touch
the scene contract.)

1. **Eliminate the final blit** when the last layer is a backdrop reader (it
   clears its own target anyway) — point its attachment at the swapchain
   directly. Saves one full-screen read+write every frame. No visual change.
2. **Cache per-frame bind groups & views.** The blit bind group is rebuilt every
   frame though `finalView` is deterministic, and the fast path calls
   `getCurrentTexture().createView()` inside the layer loop. Build once,
   re-create on resize. Less GC churn, lower CPU encode cost.
3. **Merge adjacent simple post-effect layers into one fragment pass** instead of
   one offscreen pass each — fewer texture round-trips as the stack grows.
4. **Move the RAF loop to a Reanimated UI-thread worklet** (`useFrameCallback`)
   so animation is immune to JS-thread jank. Highest effort; a smoothness win,
   not a throughput one — do only after profiling shows JS jank.

### Things that *don't* fit
- Driving from `onFrameOutput` (Vision Camera) — there's no camera here.
- `externalTex.destroy()` after submit — `composeLayered` imports no external
  frames. Both become relevant only if a real camera/video layer is added.
```
