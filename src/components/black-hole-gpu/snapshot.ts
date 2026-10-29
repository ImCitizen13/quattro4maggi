import type { RefObject } from "react";
import type { View } from "react-native";

// ============================================================================
// Snapshot texture
// ============================================================================

/**
 * Allocates the texture a view is captured into, sized in physical pixels
 * (points × PixelRatio).
 *
 * RENDER_ATTACHMENT keeps the copy on the GPU (without it the pixels go
 * through the CPU); TEXTURE_BINDING lets shaders sample it.
 */
export const createSnapshotTexture = (
  device: GPUDevice,
  width: number,
  height: number,
): GPUTexture =>
  device.createTexture({
    label: "view-snapshot",
    size: [width, height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

// ============================================================================
// Capture
// ============================================================================

/**
 * Rasterizes a React Native view into an existing texture on `device`.
 *
 * Uses react-native-webgpu's non-spec `queue.drawElementImageToTexture`. The
 * view is drawn on the platform UI thread and the texture write is issued just
 * before the promise resolves, so only submit work that samples the texture
 * after awaiting. The source view needs `collapsable={false}`; the texture
 * comes from `createSnapshotTexture` (same device) and can be captured into
 * repeatedly.
 */
export const captureInto = async (
  device: GPUDevice,
  view: RefObject<View | null>,
  texture: GPUTexture,
): Promise<void> => {
  await device.queue.drawElementImageToTexture(
    { source: view },
    { texture, premultipliedAlpha: true, size: [texture.width, texture.height] },
  );
};
