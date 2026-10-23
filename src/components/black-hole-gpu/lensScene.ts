import type { TgpuBuffer, TgpuRoot, UniformFlag } from "typegpu";
import type {
  LayerScene,
  LayerSceneResult,
  SceneProps,
} from "../gargantua-type-gpu/composeLayered";
import type { Params } from "./gpuTypes";
import { lensLayout } from "./layouts";
import { lensFs } from "./lensShaders";
import { fullscreenVs } from "./vortexShaders";

// ============================================================================
// Types
// ============================================================================

/**
 * Handoff from the vortex layer to the lens layer. The vortex scene fills it
 * during setup (`root`, `params`); the lens scene reads it during its own
 * setup, which the composer runs afterwards. List the vortex layer first.
 */
export type LensShared = {
  /** The vortex layer's TypeGPU root. Owned by the vortex: the lens never destroys it. */
  root?: TgpuRoot;
  /** The vortex layer's per-frame Params uniform (hole, horizon, center). */
  params?: TgpuBuffer<typeof Params> & UniformFlag;
};

// ============================================================================
// Scene
// ============================================================================

/**
 * Layer scene: the gravitational lens over the vortex tiles.
 *
 * FLOW:
 *   setup ─► take `root` + `params` from the vortex layer (via `shared`)
 *         ─► linear sampler, one fullscreen render pipeline (no blend)
 *   per frame (composer, readsBackdrop) ─► bind group (params, backdrop, sampler)
 *         ─► one fullscreen pass into the composer's target ─► submit
 *
 * KEY FEATURES:
 * - Reads the tile pass as its backdrop and reconstructs the whole frame:
 *   point-mass lens (flipped second image inside the Einstein radius), small
 *   chromatic split, accretion glow and the black disc
 * - Exact passthrough of the backdrop (alpha included) until the hole exists,
 *   so the idle transparent frame stays transparent
 * - Shares the vortex layer's root and Params buffer: no copies, no extra
 *   uniform writes; the vortex layer owns and destroys both
 * - The bind group is built per frame because the backdrop ping-pongs
 */
export const createLensScene =
  (shared: LensShared): LayerScene =>
  ({ presentationFormat }: SceneProps): LayerSceneResult => {
    // Copy out of `shared` here: the worklet below must capture only these
    // locals, never the (non-serializable-by-design) handoff object.
    const root = shared.root;
    const params = shared.params;
    if (!root || !params) {
      throw new Error(
        "createLensScene: shared.root / shared.params missing. List the vortex layer before the lens layer.",
      );
    }

    const sampler = root.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    /**
     * Local alias of the imported layout: load-bearing, do not inline.
     *
     * `src/components/black-hole-gpu` is in the worklets plugin's
     * `importForwarding.relativePaths`, so a worklet that references
     * `lensLayout` directly gets it re-imported on the UI runtime with a new
     * identity, and the pipeline (built here, then transferred) rejects a bind
     * group made from that copy ("Missing bind groups for layouts"). A local
     * const is captured by value and transfers with the pipeline. Needed
     * because this layer builds its bind group per frame (see centerBubbleScene).
     */
    const layout = lensLayout;

    const pipeline = root.createRenderPipeline({
      vertex: fullscreenVs,
      fragment: lensFs,
      // No blend: the shader rebuilds the whole frame from the backdrop.
      targets: { format: presentationFormat },
      primitive: { topology: "triangle-list" },
    });

    return {
      render: (_t, attachment, backdrop) => {
        "worklet";
        // Defensive: the layer must be declared with readsBackdrop: true.
        if (!backdrop) return;
        const bindGroup = root.createBindGroup(layout, {
          u: params,
          backdrop,
          samp: sampler,
        });
        const encoder = root.device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: attachment.view,
              clearValue: [0, 0, 0, 0],
              loadOp: attachment.loadOp,
              storeOp: "store",
            },
          ],
        });
        pipeline.with(pass).with(bindGroup).draw(3);
        pass.end();
        root.device.queue.submit([encoder.finish()]);
      },
      // Nothing owned: the sampler belongs to the root, and the root and Params
      // buffer belong to the vortex layer, which destroys them.
      cleanup: () => {},
    };
  };
