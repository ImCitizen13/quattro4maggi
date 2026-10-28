// ============================================================================
// Vortex source
// ============================================================================

/**
 * Where the vortex tiles get their pixels.
 *
 * - `snapshot` (default): the wrapped RN view is captured into a texture the
 *   hook owns when a swallow starts (~300 ms, the `capturing` state).
 * - `texture`: a caller-owned GPUTexture. No capture, no `capturing` state:
 *   `swallow()` starts the run at once. The scene samples it every frame, so a
 *   texture redrawn by Skia or WebGPU gives live tiles with no shader change.
 *   Scrubbing a live source replays the particle positions, but the tiles show
 *   the content as it is now.
 *
 * Texture rules: it needs `TEXTURE_BINDING` usage (and `RENDER_ATTACHMENT` if
 * Skia draws into it), the stage size is its width/height in physical px, and
 * the caller keeps it alive and destroys it; the vortex never does. Passing a
 * new or resized texture rebuilds the scene.
 */
export type VortexSource =
  | { kind: "snapshot" }
  | {
      kind: "texture";
      /** Caller-owned; never destroyed by the vortex. */
      texture: GPUTexture;
      /**
       * The device the texture lives on (a GPUTexture does not expose it).
       * For a Skia texture: `importDevice(Skia.getNativeDevice())`.
       */
      device: GPUDevice;
      /** Redrawn while the vortex runs (informational; the scene always samples the current content). */
      live: boolean;
    };

/** The default source. */
export const SNAPSHOT_SOURCE: VortexSource = { kind: "snapshot" };
