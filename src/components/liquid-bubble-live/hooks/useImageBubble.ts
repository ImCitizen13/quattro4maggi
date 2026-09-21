/**
 * useImageBubble — a picture that rides BEHIND the bubble, drawn before the
 * `BackdropFilter` so the glass refracts it like any other backdrop.
 * Design notes: README.md → "hooks/useImageBubble.ts".
 *
 * FLOW:
 *   mount (JS)  → pick IMAGE_BUBBLE_POOL_SIZE distinct random sources from
 *                 `imageArray` → preload each with `useImage`
 *   each spawn  → `onSpawn` (called via scheduleOnRN from useBubbleFloat)
 *                 → React state: random pool index → `image`
 *   every frame → x/y/size derived from the bubble's center and radius
 *                 (UI thread, no re-render): a 1.5R square, inside the rim
 *
 * KEY FEATURES:
 * - Preloaded pool: a spawn never waits on an image decode.
 * - One React render per spawn (~every 10 s), never per frame.
 * - Multi-bubble ready: one instance per bubble, inputs are parameters.
 */

import { useImage, type SkImage } from "@shopify/react-native-skia";
import { useCallback, useState } from "react";
import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { imageArray } from "../../../../assets/Bubbles/256/images.generated";

// ============================================================================
// Types
// ============================================================================

export type UseImageBubbleParams = {
  /** Bubble center, canvas points. */
  posX: SharedValue<number>;
  posY: SharedValue<number>;
  /** Bubble radius, points — the image is `1.5R` square. */
  radius: SharedValue<number>;
};

export type UseImageBubbleReturn = {
  /** Current bubble's picture; null until the pool has decoded one. */
  image: SkImage | null;
  /** Top-left and side of the image rect, canvas points. */
  x: DerivedValue<number>;
  y: DerivedValue<number>;
  size: DerivedValue<number>;
  /** Pick a new random picture from the pool — pass to useBubbleFloat. */
  onSpawn: () => void;
};

// ============================================================================
// Constants
// ============================================================================

/**
 * Images preloaded at mount (distinct, random from `imageArray`). Changing
 * this means changing the explicit `useImage` calls below — hooks cannot be
 * called in a variable-length loop.
 *
 * TUNE: more = more variety, more memory (256² RGBA ≈ 256 KB each).
 */
export const IMAGE_BUBBLE_POOL_SIZE = 8;

// ============================================================================
// Hook
// ============================================================================

export function useImageBubble({
  posX,
  posY,
  radius,
}: UseImageBubbleParams): UseImageBubbleReturn {
  // Partial Fisher–Yates: IMAGE_BUBBLE_POOL_SIZE distinct picks, once.
  const [sources] = useState(() => {
    const all = imageArray.slice();
    const count = Math.min(IMAGE_BUBBLE_POOL_SIZE, all.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (all.length - i));
      const swap = all[i];
      all[i] = all[j];
      all[j] = swap;
    }
    // Pad by repeating if the asset list is ever shorter than the pool.
    return Array.from(
      { length: IMAGE_BUBBLE_POOL_SIZE },
      (_, i) => all[i % count],
    );
  });

  // Explicit calls, one per pool slot (see IMAGE_BUBBLE_POOL_SIZE).
  const pool = [
    useImage(sources[0]),
    useImage(sources[1]),
    useImage(sources[2]),
    useImage(sources[3]),
    useImage(sources[4]),
    useImage(sources[5]),
    useImage(sources[6]),
    useImage(sources[7]),
  ];

  const [index, setIndex] = useState(0);
  const onSpawn = useCallback(() => {
    setIndex(Math.floor(Math.random() * IMAGE_BUBBLE_POOL_SIZE));
  }, []);

  // Still decoding → fall back to any image that is ready.
  const image = pool[index] ?? pool.find((img) => img !== null) ?? null;

  const x = useDerivedValue(() => posX.value - (radius.value * 0.75));
  const y = useDerivedValue(() => posY.value - (radius.value * 0.75));
  const size = useDerivedValue(() => 1.5 * radius.value);

  return { image, x, y, size, onSpawn };
}
