/**
 * BouncingImage — one picture inside the bouncing-images bubble. Reads its
 * own x/y from the shared bodies buffer, so there are no React renders per
 * frame.
 */

import { FilterMode, Image, MipmapMode, useImage } from "react-native-skia";
import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { STRIDE } from "./hooks/bouncingImagesMath";

// ============================================================================
// Types
// ============================================================================

export type BouncingImageProps = {
  source: number;
  index: number;
  /** This image's size multiplier (IMAGE_SIZE_MUL_MIN..MAX). */
  sizeMul: number;
  /** Base image side for the current bubble size, pt. */
  baseSize: DerivedValue<number>;
  bodies: SharedValue<number[]>;
  /**
   * `useBubbleShape`'s `iParams` buffer; `[0..1]` = the center the glass draws
   * this frame. Reading `bubbleX/Y` instead can put the images a frame off
   * the glass.
   */
  paramBuffer: SharedValue<number[]>;
};

// ============================================================================
// Image (one per body — own hooks, so the count isn't a hook-order problem)
// ============================================================================

export function BouncingImage({
  source,
  index,
  sizeMul,
  baseSize,
  bodies,
  paramBuffer,
}: BouncingImageProps) {
  const image = useImage(source);
  // Empty until useBubbleShape's first frame → size 0 (nothing drawn).
  const size = useDerivedValue(() =>
    paramBuffer.value.length < 3 ? 0 : baseSize.value * sizeMul,
  );
  const x = useDerivedValue(() => {
    const p = paramBuffer.value;
    return p.length < 3
      ? 0
      : p[0] + bodies.value[index * STRIDE] - size.value / 2;
  });
  const y = useDerivedValue(() => {
    const p = paramBuffer.value;
    return p.length < 3
      ? 0
      : p[1] + bodies.value[index * STRIDE + 1] - size.value / 2;
  });
  if (!image) return null;
  return (
    <Image
      image={image}
      fit="contain"
      x={x}
      y={y}
      width={size}
      height={size}
      sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.Linear }}
    />
  );
}
