import { AlphaType, ColorType, SkData, Skia } from "@shopify/react-native-skia";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { bubbleBindGroupLayout } from "./layouts";
import { perf } from "./perf/perfMarks";

/**
 * Props handed to the scene factory by the WebGPU lifecycle hook each mount.
 * Mirrors the shape of `useWebGPU`'s `SceneProps` (subset used here).
 */
interface BubbleSceneProps {
  /** Configured canvas context whose swapchain we draw into. */
  context: GPUCanvasContext;
  /** Logical GPU device used to create pipelines, buffers, bind groups. */
  device: GPUDevice;
  /** Swapchain texture format (e.g. "bgra8unorm") — pipeline target must match. */
  presentationFormat: GPUTextureFormat;
  /** Canvas width in layout points (pre-DPR). Unused here but part of the contract. */
  canvasWidth: number;
  /** Canvas height in layout points (pre-DPR). Unused here but part of the contract. */
  canvasHeight: number;
}

/**
 * Configuration for {@link createBubbleScene}.
 */
interface BubbleConfig {
  /**
   * Encoded sprite image bytes (PNG/JPEG). The scene factory decodes each via
   * Skia and uploads it as a `GPUTexture` on the device passed in scene props,
   * so the resulting textures are guaranteed to belong to the rendering device.
   * One draw call is issued per texture (no atlas/array batching) — intended
   * for small N (~tens).
   */
  datas: SkData[];
}

/**
 * Decode a Skia-loaded encoded image into a `GPUTexture` on the given device.
 *
 * Pixels are read as `RGBA_8888` / `Unpremul` to match the `rgba8unorm`
 * texture format and the straight-alpha blending used by the sprite pipeline.
 * The transient `SkImage` is disposed immediately after `readPixels` to keep
 * Skia's atlas heap bounded when batch-uploading many assets.
 *
 * @param device - GPU device used to allocate the texture and submit upload.
 * @param data - Encoded image bytes (PNG/JPEG) wrapped in `SkData`.
 * @returns A populated `GPUTexture`, or `null` if decoding/reading fails.
 */
function skDataToTexture(device: GPUDevice, data: SkData): GPUTexture | null {
  const img = perf.measure("decode", () =>
    Skia.Image.MakeImageFromEncoded(data),
  );
  if (!img) return null;

  const width = img.width();
  const height = img.height();
  const pixels = perf.measure("readPixels", () =>
    img.readPixels(0, 0, {
      width,
      height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    }),
  );
  if ("dispose" in img && typeof img.dispose === "function") {
    img.dispose();
  }
  if (!pixels) return null;

  // Measures JS-side encode only; writeTexture queues the upload, actual GPU work happens later.
  return perf.measure("createTexture+write", () => {
    const texture = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture },
      pixels.buffer,
      { bytesPerRow: width * 4, rowsPerImage: height },
      [width, height],
    );
    return texture;
  });
}

/**
 * Vertex stage for the textured-quad sprite pipeline.
 *
 * Synthesizes 6 vertices (two triangles) from the vertex index — no vertex
 * buffer needed. The unit-square corner is scaled and translated by the
 * sprite's `(x, y, w, h)` rect read from the bind-group uniform, producing
 * clip-space positions directly. The `uv` output (location auto-assigned by
 * typegpu) is forwarded to the fragment stage with Y flipped so top-down
 * decoded image rows display upright in NDC where +Y is up.
 */
// OLD
// const bubbleVertexFn = tgpu["~unstable"].vertexFn({
//   in: { vertexIndex: d.builtin.vertexIndex },
//   out: { outPos: d.builtin.position, uv: d.vec2f },
// })(({ vertexIndex }) => {
//   const corners = d.arrayOf(
//     d.vec2f,
//     6,
//   )([
//     d.vec2f(0.0, 0.0),
//     d.vec2f(1.0, 0.0),
//     d.vec2f(0.0, 1.0),
//     d.vec2f(0.0, 1.0),
//     d.vec2f(1.0, 0.0),
//     d.vec2f(1.0, 1.0),
//   ]);
//   const c = corners[vertexIndex];
//   const p = std.add(
//     d.vec2f(bubbleBindGroupLayout.$.rect.x, bubbleBindGroupLayout.$.rect.y),
//     std.mul(
//       c,
//       d.vec2f(bubbleBindGroupLayout.$.rect.z, bubbleBindGroupLayout.$.rect.w),
//     ),
//   );
//   return {
//     outPos: d.vec4f(p.x, p.y, 0.0, 1.0),
//     uv: d.vec2f(c.x, 1.0 - c.y),
//   };
// });

// NEW
const bubbleVertexFn = ({ $vertexIndex }: { $vertexIndex: number }) => {
  "use gpu";
  const corners = d.arrayOf(
    d.vec2f,
    6,
  )([
    d.vec2f(0.0, 0.0),
    d.vec2f(1.0, 0.0),
    d.vec2f(0.0, 1.0),
    d.vec2f(0.0, 1.0),
    d.vec2f(1.0, 0.0),
    d.vec2f(1.0, 1.0),
  ]);
  const c = corners[$vertexIndex];
  const p = std.add(
    d.vec2f(bubbleBindGroupLayout.$.rect.x, bubbleBindGroupLayout.$.rect.y),
    std.mul(
      c,
      d.vec2f(bubbleBindGroupLayout.$.rect.z, bubbleBindGroupLayout.$.rect.w),
    ),
  );

  return {
    $position: d.vec4f(p.x, p.y, 0.0, 1.0),
    uv: d.vec2f(c.x, 1.0 - c.y),
  };
};
/**
 * Fragment stage for the textured-quad sprite pipeline.
 *
 * Samples the bound texture at the interpolated UV using the bound filtering
 * sampler. The pipeline's blend state combines the result with the swapchain
 * via straight alpha blending.
 */
// OLD
// const bubbleFragmentFn = tgpu["~unstable"].fragmentFn({
//   in: { uv: d.vec2f },
//   out: d.vec4f,
// })(({ uv }) => {
//   return std.textureSample(
//     bubbleBindGroupLayout.$.tex,
//     bubbleBindGroupLayout.$.samp,
//     uv,
//   );
// });

const bubbleFragmentFn = ({ uv }: { uv: d.v2f }) => {
  "use gpu";
  return std.textureSample(
    bubbleBindGroupLayout.$.tex,
    bubbleBindGroupLayout.$.samp,
    uv,
  );
};

/**
 * Create a scene factory that composites a grid of textured sprites on top of
 * the existing swapchain contents using straight alpha blending.
 *
 * The render pass uses `loadOp: "load"` so it preserves whatever an earlier
 * pass (e.g. the starfield) wrote into the same frame's swapchain texture.
 * All N sprite draws share a single render pass via `root.beginRenderPass`.
 *
 * @param config - {@link BubbleConfig} carrying the encoded sprite bytes.
 * @returns A scene factory consumed by `useWebGPU`.
 */
export function createBubbleScene(config: BubbleConfig) {
  return ({
    context,
    device,
    presentationFormat,
    canvasWidth,
    canvasHeight,
  }: BubbleSceneProps) => {
    /** Typegpu root wrapping the rendering device. */
    const root = tgpu.initFromDevice({ device });

    /** Filtering sampler shared across all sprites. */
    const sampler = root.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    /**
     * Render pipeline with straight-alpha blending so transparent PNG edges
     * layer cleanly over the prior pass.
     */
    // OLD
    // const pipeline = root["~unstable"]
    //   .withVertex(bubbleVertexFn, {})
    //   .withFragment(bubbleFragmentFn, {
    //     format: presentationFormat,
    //     blend: {
    //       color: {
    //         srcFactor: "src-alpha",
    //         dstFactor: "one-minus-src-alpha",
    //         operation: "add",
    //       },
    //       alpha: {
    //         srcFactor: "one",
    //         dstFactor: "one-minus-src-alpha",
    //         operation: "add",
    //       },
    //     },
    //   })
    //   .withPrimitive({ topology: "triangle-list" })
    //   .createPipeline();

    // NEW
    const pipeline = root.createRenderPipeline({
      primitive: { topology: "triangle-list" },
      vertex: bubbleVertexFn,
      fragment: bubbleFragmentFn,
      targets: {
        format: presentationFormat,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
        },
      },
    });
    /**
     * Decode + upload each `SkData` to a `GPUTexture` on THIS device. Done
     * inside the factory (not in the loader hook) to guarantee the textures
     * belong to the same device that will bind and draw them — mismatches
     * trigger "is associated with [Device], and cannot be used with [Device]"
     * validation errors.
     */
    const textures = config.datas
      .map((dat) => skDataToTexture(device, dat))
      .filter((t): t is GPUTexture => t !== null);

    /** Total sprites to lay out. */
    const n = textures.length;
    /** Grid columns — square-ish layout via ceil(sqrt(N)). */
    const cols = Math.ceil(Math.sqrt(n));
    /** Grid rows derived from N and cols. */
    const rows = Math.ceil(n / cols);

    /**
     * Compute per-sprite NDC rect `(x, y, w, h)` for sprite index `i` given a
     * canvas size. Aspect compensation (`SIZE_Y = SIZE_X * w/h`) keeps sprites
     * pixel-square on portrait canvases. Pulled out so it runs once at setup
     * AND again on resize when the aspect changes (e.g. nav bar appearing).
     */
    const computeRect = (i: number, w: number, h: number) => {
      const aspect = w / h;
      const SIZE_X = Math.min(1.6 / cols, 1.6 / rows / aspect) * 0.9;
      const SIZE_Y = SIZE_X * aspect;
      const gap = SIZE_X * 0.1;
      const gapY = gap * aspect;
      const totalW = cols * SIZE_X + (cols - 1) * gap;
      const totalH = rows * SIZE_Y + (rows - 1) * gapY;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = -totalW / 2 + col * (SIZE_X + gap);
      const y = totalH / 2 - SIZE_Y - row * (SIZE_Y + gapY);
      return d.vec4f(x, y, SIZE_X, SIZE_Y);
    };

    /**
     * Per-sprite GPU resources: a `vec4f` uniform buffer holding `(x, y, w, h)`
     * in NDC, plus the bind group wiring rect, sampler, and texture view to
     * the bubble bind-group layout.
     */
    const items = textures.map((tex, i) => {
      /** Typegpu uniform buffer carrying this sprite's rect as a `vec4f`. */
      const rectBuffer = root
        .createBuffer(d.vec4f, computeRect(i, canvasWidth, canvasHeight))
        .$usage("uniform");

      /** Bind group wiring rect, sampler, and texture view to the layout. */
      const bindGroup = root.createBindGroup(bubbleBindGroupLayout, {
        rect: rectBuffer,
        samp: sampler,
        tex: tex.createView(),
      });
      return { rectBuffer, bindGroup };
    });

    return {
      /**
       * Draw all sprites for the current frame inside a single render pass
       * (`loadOp: "load"` preserves the prior starfield pass's contents).
       */
      render: () => {
        const encoder = root.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              loadOp: "load",
              storeOp: "store",
            },
          ],
        });

        for (const { bindGroup } of items) {
          pipeline.with(pass).with(bindGroup).draw(6);
        }
        pass.end();
        root.device.queue.submit([encoder.finish()]);
      },

      /**
       * Release per-sprite uniform buffers, the GPU textures decoded by this
       * factory, and the typegpu root.
       */
      cleanup: () => {
        for (const { rectBuffer } of items) rectBuffer.destroy();
        for (const tex of textures) tex.destroy();
        root.destroy();
      },
      /**
       * Hook calls this after the canvas is reconfigured at a new size.
       * Recompute every sprite's rect with the new aspect and write it to its
       * uniform buffer. ~50 small writes — negligible at this scale.
       */
      resize: (newW: number, newH: number) => {
        for (let i = 0; i < items.length; i++) {
          items[i].rectBuffer.write(computeRect(i, newW, newH));
        }
      },
    };
  };
}
