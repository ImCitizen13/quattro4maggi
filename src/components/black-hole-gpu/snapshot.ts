import type { RefObject } from "react";
import type { View } from "react-native";

// ============================================================================
// Types
// ============================================================================

export type ViewSnapshot = {
  texture: GPUTexture;
  /** Texture size in physical pixels (points × PixelRatio). */
  width: number;
  height: number;
};

// ============================================================================
// Capture
// ============================================================================

/**
 * Rasterizes a React Native view into a GPU texture on `device`.
 *
 * Uses react-native-webgpu's non-spec `queue.drawElementImageToTexture`. The
 * view is drawn on the platform UI thread and the texture write is issued just
 * before the promise resolves, so only submit work that samples the texture
 * after awaiting. The source view needs `collapsable={false}`.
 *
 * RENDER_ATTACHMENT keeps the copy on the GPU (without it the pixels go
 * through the CPU); TEXTURE_BINDING lets shaders sample it.
 */
export const captureView = async (
  device: GPUDevice,
  view: RefObject<View | null>,
  width: number,
  height: number,
): Promise<ViewSnapshot> => {
  const texture = device.createTexture({
    label: "view-snapshot",
    size: [width, height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  await device.queue.drawElementImageToTexture(
    { source: view },
    { texture, premultipliedAlpha: true, size: [width, height] },
  );
  return { texture, width, height };
};
