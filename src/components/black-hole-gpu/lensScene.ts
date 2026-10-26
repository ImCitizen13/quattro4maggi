import type { TgpuBuffer, TgpuRoot, UniformFlag } from "typegpu";
import type {
  LayerScene,
  LayerSceneResult,
  SceneProps,
} from "../gargantua-type-gpu/composeLayered";
import { LENS_MAX_COLORS, LensTune, type Params } from "./gpuTypes";
import { lensLayout } from "./layouts";
import { lensFs } from "./lensShaders";
import type { LensTuneValues } from "./lensTune";
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

/** One color slot as written to the uniform: rgb 0..1, w unused. */
type Vec4Tuple = [number, number, number, number];

// ============================================================================
// Scene
// ============================================================================

/**
 * Layer scene: the tunable gravitational lens + glass bubble over the vortex tiles.
 *
 * FLOW:
 *   setup ─► take `root` + `params` from the vortex layer (via `shared`)
 *         ─► LensTune uniform buffer (seeded from the `tune` SharedValues)
 *         ─► linear sampler, one fullscreen render pipeline (no blend)
 *   per frame (composer, readsBackdrop) ─► write the tune knobs + the three
 *         color lists (packed to 6 vec4 each, plus counts)
 *         ─► bind group (params, tune, backdrop, sampler)
 *         ─► one fullscreen pass into the composer's target ─► submit
 *
 * KEY FEATURES:
 * - Reads the tile pass as its backdrop and reconstructs the whole frame:
 *   point-mass lens (flipped second image inside the Einstein radius), small
 *   chromatic split, glass bubble (gargantua look) with rim, halo and
 *   specular color lists (1..6 colors, gradients, optional glow); every knob
 *   and list is a live SharedValue (no rebuild)
 * - Exact passthrough of the backdrop (alpha included) until the hole exists,
 *   so the idle transparent frame stays transparent
 * - Shares the vortex layer's root and Params buffer: no copies, no extra
 *   uniform writes; the vortex layer owns and destroys both
 * - The bind group is built per frame because the backdrop ping-pongs
 */
export const createLensScene =
  (shared: LensShared, tune: LensTuneValues): LayerScene =>
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

    // Local copy: the worklets below capture a number, not the gpuTypes import
    // (which importForwarding would re-evaluate, typegpu included, on the UI runtime).
    const maxColors = LENS_MAX_COLORS;

    /**
     * A flat rgb list (1..maxColors colors) as maxColors vec4 tuples, padded
     * with the last color (unused slots are never read: the count clamps).
     */
    const packColors = (flat: number[]): Vec4Tuple[] => {
      "worklet";
      const count = Math.max(1, Math.min(maxColors, Math.floor(flat.length / 3)));
      const out: Vec4Tuple[] = [];
      for (let i = 0; i < maxColors; i++) {
        const j = Math.min(i, count - 1) * 3;
        out.push([flat[j] ?? 1, flat[j + 1] ?? 1, flat[j + 2] ?? 1, 0]);
      }
      return out;
    };

    const countOf = (flat: number[]) => {
      "worklet";
      return Math.max(1, Math.min(maxColors, Math.floor(flat.length / 3)));
    };

    /** Every LensTune field from the SharedValues (JS for the seed, UI per frame). */
    const readTune = () => {
      "worklet";
      const rimFlat = tune.colors.rim.value;
      const haloFlat = tune.colors.halo.value;
      const specFlat = tune.colors.spec.value;
      return {
        einstein: tune.einstein.value,
        falloff: tune.falloff.value,
        chroma: tune.chroma.value,
        bubble: tune.bubble.value,
        refraction: tune.refraction.value,
        shapeN: tune.shapeN.value,
        edge: tune.edge.value,
        dispersion: tune.dispersion.value,
        rim: tune.rim.value,
        specular: tune.specular.value,
        halo: tune.halo.value,
        spread: tune.spread.value,
        rainbow: tune.rainbow.value,
        glow: tune.glow.value,
        rimCount: countOf(rimFlat),
        haloCount: countOf(haloFlat),
        specCount: countOf(specFlat),
        rimColors: packColors(rimFlat),
        haloColors: packColors(haloFlat),
        specColors: packColors(specFlat),
      };
    };

    // Seeded from the SharedValues (not the defaults) so a scene rebuild
    // resumes at the user's current tuning.
    const tuneBuffer = root.createBuffer(LensTune, readTune()).$usage("uniform");

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
        tuneBuffer.write(readTune());
        const bindGroup = root.createBindGroup(layout, {
          u: params,
          t: tuneBuffer,
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
      // Owns only the tune buffer: the sampler belongs to the root, and the
      // root and Params buffer belong to the vortex layer, which destroys them.
      cleanup: () => {
        tuneBuffer.destroy();
      },
    };
  };
