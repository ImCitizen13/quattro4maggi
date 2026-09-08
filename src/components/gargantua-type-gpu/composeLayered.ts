import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

/**
 * Layered-scene composer.
 *
 * Composes a stack of scene "layers" into a single scene factory compatible
 * with `useWebGPU`. Each layer renders in stack order; layers can opt into
 * sampling everything rendered behind them by setting `readsBackdrop: true`.
 *
 * - Fast path (no `readsBackdrop` layer): every layer renders directly into
 *   the swapchain — zero overhead vs. hand-wired composition.
 * - Slow path (any reader): composer owns two offscreen color textures and
 *   ping-pongs between them. Reader layers render into the *other* texture
 *   while sampling the current one (no `copyTextureToTexture` needed).
 *   After all layers, a tiny fullscreen "blit" pass copies the final image
 *   to the swapchain.
 *
 * Layers conform to a slightly extended contract: their `render` receives the
 * color attachment (view + loadOp) and an optional backdrop texture view from
 * the composer, instead of grabbing the swapchain themselves. This is the
 * one source of truth for "where to render this frame, and from what to read."
 */

/**
 * Standard `useWebGPU` scene props (mirrored locally to avoid a circular
 * dependency on the hook module).
 */
export interface SceneProps {
  context: GPUCanvasContext;
  device: GPUDevice;
  gpu: GPU;
  presentationFormat: GPUTextureFormat;
  canvas: { width: number; height: number };
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * The color attachment a layer must render into for the frame. The composer
 * decides `view` (ping-pong target or swapchain) and `loadOp` (`"clear"` on
 * the first write to a texture in a frame, `"load"` afterwards).
 */
export interface LayerAttachment {
  view: GPUTextureView;
  loadOp: "clear" | "load";
}

/**
 * Per-frame `render` arguments for a layer. Backdrop is non-null only for
 * layers declared with `readsBackdrop: true`.
 */
export type LayerRender = (
  timestamp: number,
  attachment: LayerAttachment,
  backdrop: GPUTextureView | null,
) => void;

export interface LayerSceneResult {
  render: LayerRender;
  cleanup?: () => void | Promise<void>;
  resize?: (canvasWidth: number, canvasHeight: number) => void;
}

/**
 * Standard scene result the composer hands back to `useWebGPU` — a single-arg
 * `render(timestamp)` matching the hook's contract.
 */
export interface ComposedSceneResult {
  render: (timestamp: number) => void;
  cleanup?: () => void | Promise<void>;
  resize?: (canvasWidth: number, canvasHeight: number) => void;
}

export type LayerScene = (
  props: SceneProps,
) => LayerSceneResult | Promise<LayerSceneResult>;

export interface Layer {
  scene: LayerScene;
  /**
   * If true, the composer guarantees `backdrop` is a non-null view of the
   * cumulative output of all prior layers. Default false.
   */
  readsBackdrop?: boolean;
}

/** ── Blit pipeline (slow path only) ────────────────────────────────────────
 * One bind group: a sampled texture + a linear sampler. The vertex synthesizes
 * a fullscreen triangle pair from the vertex index. The fragment is a plain
 * passthrough. Used to flip-blit the final ping-pong texture into the
 * swapchain after all layers have rendered.
 */
const blitLayout = tgpu.bindGroupLayout({
  src: { texture: d.texture2d(d.f32) },
  samp: { sampler: "filtering" },
});

// OLD
// const blitVertexFn = tgpu["~unstable"].vertexFn({
//   in: { vertexIndex: d.builtin.vertexIndex },
//   out: { outPos: d.builtin.position, uv: d.vec2f },
// })(({ vertexIndex }) => {
//   const corners = d.arrayOf(
//     d.vec2f,
//     6,
//   )([
//     d.vec2f(-1.0, -1.0),
//     d.vec2f(1.0, -1.0),
//     d.vec2f(-1.0, 1.0),
//     d.vec2f(-1.0, 1.0),
//     d.vec2f(1.0, -1.0),
//     d.vec2f(1.0, 1.0),
//   ]);
//   const c = corners[vertexIndex];
//   return {
//     outPos: d.vec4f(c.x, c.y, 0.0, 1.0),
//     // Map clip-space corner → uv. Y is flipped because NDC Y is up but
//     // texture rows are top-down.
//     uv: d.vec2f((c.x + 1.0) * 0.5, 1.0 - (c.y + 1.0) * 0.5),
//   };
// });
//

// NEW
const blitVertexFn = ({ $vertexIndex }: { $vertexIndex: number }) => {
  'use gpu';
  const corners = d.arrayOf(
      d.vec2f,
      6,
    )([
      d.vec2f(-1.0, -1.0),
      d.vec2f(1.0, -1.0),
      d.vec2f(-1.0, 1.0),
      d.vec2f(-1.0, 1.0),
      d.vec2f(1.0, -1.0),
      d.vec2f(1.0, 1.0),
    ]);
    const c = corners[$vertexIndex];
    return {
      $position: d.vec4f(c.x, c.y, 0.0, 1.0),
      // Map clip-space corner → uv. Y is flipped because NDC Y is up but
      // texture rows are top-down.
      uv: d.vec2f((c.x + 1.0) * 0.5, 1.0 - (c.y + 1.0) * 0.5),
    };
}

// OLD
// const blitFragmentFn = tgpu["~unstable"].fragmentFn({
//   in: { uv: d.vec2f },
//   out: d.vec4f,
// })(({ uv }) => {
//   return std.textureSample(blitLayout.$.src, blitLayout.$.samp, uv);
// });
//
// NEW
const blitFragmentFn = ({ uv }: { uv: d.v2f }) => {
  'use gpu';
  return std.textureSample(blitLayout.$.src, blitLayout.$.samp, uv);
}

/**
 * Compose `layers` into a single scene that `useWebGPU` can run. The returned
 * factory matches the standard scene contract (`render(t)`, optional
 * `cleanup`, optional `resize`).
 */
export function composeLayered(layers: Layer[]) {
  const anyReader = layers.some((l) => l.readsBackdrop);

  return async (props: SceneProps): Promise<ComposedSceneResult> => {
    const { context, device, presentationFormat, canvas } = props;

    // Initialize child layers up front so every scene's setup runs once.
    const initialized: LayerSceneResult[] = [];
    for (const layer of layers) {
      const result = await layer.scene(props);
      initialized.push(result);
    }

    // Flatten the layer list into plain arrays BEFORE building the render
    // closure. `initialized` carries `cleanup`/`resize` and `layers` carries the
    // scene factories — all ordinary functions, not worklets. Capturing either
    // into a `'worklet'` render would make the serializer try to convert those
    // functions when the closure crosses to the UI runtime. Only `render` (a
    // worklet) and a boolean flag are actually needed per frame, so capture
    // exactly that and nothing else.
    const renders: LayerRender[] = initialized.map((r) => r.render);
    const readsBackdropFlags: boolean[] = layers.map(
      (l) => l.readsBackdrop === true,
    );

    // ── Fast path: no layer reads backdrop. Render straight to swapchain.
    if (!anyReader) {
      const compose: LayerRender = () => {};
      void compose; // placeholder to keep parity with the slow-path shape
      return {
        render: (t: number) => {
          "worklet";
          for (let i = 0; i < renders.length; i++) {
            const view = context.getCurrentTexture().createView();
            renders[i](t, { view, loadOp: i === 0 ? "clear" : "load" }, null);
          }
        },
        cleanup: async () => {
          for (const r of initialized) await r.cleanup?.();
        },
        resize: (w: number, h: number) => {
          for (const r of initialized) r.resize?.(w, h);
        },
      };
    }

    // ── Slow path: at least one reader. Allocate ping-pong textures + blit.
    const root = tgpu.initFromDevice({ device });
    const sampler = root.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
    // OLD
    // const blitPipeline = root["~unstable"]
    //   .withVertex(blitVertexFn, {})
    //   .withFragment(blitFragmentFn, { format: presentationFormat })
    //   .withPrimitive({ topology: "triangle-list" })
    //   .createPipeline();

    // NEW
    const blitPipeline = root.createRenderPipeline({
      primitive: { topology: "triangle-list" },
      vertex: blitVertexFn,
      fragment: blitFragmentFn,
      targets: {format: presentationFormat}
    })

    /** Two ping-pong color targets matching the swapchain's format + size. */
    let texA: GPUTexture | null = null;
    let texB: GPUTexture | null = null;
    let viewA: GPUTextureView | null = null;
    let viewB: GPUTextureView | null = null;

    const allocTextures = () => {
      const w = Math.max(1, canvas.width);
      const h = Math.max(1, canvas.height);
      texA?.destroy();
      texB?.destroy();
      texA = device.createTexture({
        size: [w, h],
        format: presentationFormat,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      texB = device.createTexture({
        size: [w, h],
        format: presentationFormat,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      viewA = texA.createView();
      viewB = texB.createView();
    };
    allocTextures();

    return {
      render: (t: number) => {
        "worklet";
        // Per-frame ping-pong state. `current` is the texture index that
        // holds (or will hold) the cumulative image after the current layer.
        // `written` flags drive `loadOp` so the composer owns first-write
        // clear semantics — layer authors don't need to know they're first.
        let current: 0 | 1 = 0;
        const written: [boolean, boolean] = [false, false];

        for (let i = 0; i < renders.length; i++) {
          const child = renders[i];

          if (readsBackdropFlags[i]) {
            // Reader: render into the OTHER texture, sample current as backdrop.
            const next = (1 - current) as 0 | 1;
            const targetView = next === 0 ? viewA! : viewB!;
            const backdrop = current === 0 ? viewA! : viewB!;
            // Reader passes always clear their destination — the layer's
            // shader is responsible for compositing the backdrop in.
            child(t, { view: targetView, loadOp: "clear" }, backdrop);
            written[next] = true;
            current = next;
          } else {
            // Non-reader: stack into the current target. First write to that
            // target this frame clears; subsequent writes load.
            const targetView = current === 0 ? viewA! : viewB!;
            const loadOp = written[current] ? "load" : "clear";
            child(t, { view: targetView, loadOp }, null);
            written[current] = true;
          }
        }

        // Final composite: blit the current ping-pong texture to swapchain.
        const finalView = current === 0 ? viewA! : viewB!;
        const bg = root.createBindGroup(blitLayout, {
          src: finalView,
          samp: sampler,
        });
        blitPipeline
          .withColorAttachment({
            view: context.getCurrentTexture().createView(),
            clearValue: [0, 0, 0, 1],
            loadOp: "clear" as const,
            storeOp: "store" as const,
          })
          .with(bg)
          .draw(6);
      },
      cleanup: async () => {
        for (const r of initialized) await r.cleanup?.();
        texA?.destroy();
        texB?.destroy();
        root.destroy();
      },
      resize: (w: number, h: number) => {
        // useWebGPU has already updated canvas.width/height before calling.
        allocTextures();
        for (const r of initialized) r.resize?.(w, h);
      },
    };
  };
}
