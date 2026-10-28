import { Skia } from "react-native-skia";
import { importDevice } from "react-native-webgpu";

// ============================================================================
// Skia <-> WebGPU shared device (dev proof for the vortex texture source)
// ============================================================================

let skiaDevice: GPUDevice | null = null;

/**
 * The GPUDevice Skia renders with, imported once:
 * `importDevice(Skia.getNativeDevice())`. A texture made on it can be drawn
 * into by Skia (`Surface.MakeFromGPUTexture`) and sampled by the vortex when
 * this same device is passed as `source.device`.
 */
export const getSkiaDevice = (): GPUDevice => {
  skiaDevice ??= importDevice(Skia.getNativeDevice());
  return skiaDevice;
};

/** Texture Skia can draw into (RENDER_ATTACHMENT) and WebGPU can sample (TEXTURE_BINDING). */
export const createSkiaTexture = (width: number, height: number): GPUTexture =>
  getSkiaDevice().createTexture({
    label: "skia-shared",
    size: [width, height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

/** Skia clears `texture` to a solid color, zero-copy, then flushes. */
export const fillSolid = (texture: GPUTexture, color: string): void => {
  const surface = Skia.Surface.MakeFromGPUTexture(texture);
  surface.getCanvas().clear(Skia.Color(color));
  surface.flush();
};
