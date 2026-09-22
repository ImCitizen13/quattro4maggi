/**
 * BaselineBubble — one of today's single-bubble passes, for one slot of the
 * multi buffer. Design notes: README.md → "BaselineBubble.tsx".
 *
 * FLOW:
 *   paramBuffer[index · 12 … + 11] → iParams (rest of the uniforms shared)
 *   same 12 floats → a conservative clip around this bubble
 *   → BackdropFilter + liquid-bubble-live's shader  (~3 pass breaks)
 *
 * KEY FEATURES:
 * - Phase 2 stress baseline: N of these = "N current bubbles". Phase 3
 *   replaces all of them with one looping pass.
 * - Unmodified `liveBubbleEffect`: the same shader the single bubble runs.
 * - A waiting slot (R = 0) gets an empty clip.
 */

import {
  BackdropFilter,
  RuntimeShader,
  rect,
} from "@shopify/react-native-skia";
import React from "react";
import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  AA_PAD,
  PARAM_FLOATS,
} from "@/components/liquid-bubble-live/bubbleModes";
import type {
  BubbleOptics,
  BubbleUniforms,
} from "@/components/liquid-bubble-live/hooks/useBubbleOptics";
import { CLIP_SLACK } from "@/components/liquid-bubble-live/liveConfig";
import { liveBubbleEffect } from "@/components/liquid-bubble-live/shaders";

// ============================================================================
// Types
// ============================================================================

export type BaselineBubbleProps = {
  /** Slot in the flat buffer. */
  index: number;
  /** `useMultiBubblePhysics`'s flat buffer (12 floats per bubble). */
  paramBuffer: SharedValue<number[]>;
  /** Shared optics uniforms from `useBubbleOptics` (every bubble has the same look). */
  uniforms: DerivedValue<BubbleUniforms>;
  /** The live levers, for the clip padding. */
  optics: BubbleOptics;
};

// ============================================================================
// Component
// ============================================================================

export function BaselineBubble({
  index,
  paramBuffer,
  uniforms,
  optics,
}: BaselineBubbleProps) {
  const base = index * PARAM_FLOATS;

  const bubbleUniforms = useDerivedValue(() => ({
    ...uniforms.value,
    iParams: paramBuffer.value.slice(base, base + PARAM_FLOATS),
  }));

  // Circle bound on the harmonic shape (r ≤ R·(1 + |a2| + |a3| + |a4|)),
  // grown by the same reads/draws past the rim as the single bubble's clip.
  const clipRect = useDerivedValue(() => {
    const p = paramBuffer.value;
    const R = p[base + 2];
    if (!(R > 0)) {
      return rect(0, 0, 0, 0);
    }
    const reach =
      R *
        (1 +
          Math.abs(p[base + 4]) +
          Math.abs(p[base + 6]) +
          Math.abs(p[base + 8])) +
      AA_PAD;
    const pad =
      optics.refract.value +
      R *
        (Math.max(0, -optics.lens.value) +
          optics.dispersion.value +
          (optics.haloOpacity.value !== 0 ? optics.haloSpread.value : 0)) +
      CLIP_SLACK;
    const h = reach + pad;
    return rect(p[base] - h, p[base + 1] - h, 2 * h, 2 * h);
  });

  return (
    <BackdropFilter
      clip={clipRect}
      filter={
        <RuntimeShader source={liveBubbleEffect} uniforms={bubbleUniforms} />
      }
    />
  );
}
