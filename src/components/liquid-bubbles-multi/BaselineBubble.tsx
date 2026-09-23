/**
 * BaselineBubble — one of today's single-bubble passes, for one slot of the
 * multi buffer. Design notes: README.md → "BaselineBubble.tsx".
 *
 * FLOW:
 *   paramBuffer[index · 12 … + 11] → iParams (rest of the uniforms shared)
 *   × pixelDensity on every length → the filter's own space
 *   same 12 floats → a conservative clip around this bubble
 *   → BackdropFilter + liquid-bubble-live's shader  (~3 pass breaks)
 *
 * KEY FEATURES:
 * - Phase 2 stress baseline: N of these = "N current bubbles". Phase 3
 *   replaces all of them with one looping pass.
 * - Unmodified `liveBubbleEffect`: the same shader the single bubble runs.
 * - A waiting slot (R = 0) gets an empty clip.
 * - **`pixelDensity`**: a `RuntimeShader` image filter can't handle the
 *   canvas matrix, so Skia factors the scale out and rasterizes the backdrop
 *   at 1 texel per LOCAL unit. Under the screen's `1 / pd` group one local
 *   unit is one device pixel, so the snapshot — and the text seen through
 *   the glass — comes out at full resolution. Everything this component
 *   feeds the shader in points is multiplied by `pd` to match that space;
 *   the shader's other levers are fractions of R, so they follow for free.
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
  /**
   * Local units per point — `PixelRatio.get()` when the screen wraps the
   * canvas in the matching `1 / pd` group, 1 when it doesn't.
   * @default 1
   */
  pixelDensity?: number;
};

// ============================================================================
// Component
// ============================================================================

export function BaselineBubble({
  index,
  paramBuffer,
  uniforms,
  optics,
  pixelDensity = 1,
}: BaselineBubbleProps) {
  const base = index * PARAM_FLOATS;

  // Lengths → the filter's space. Only cx, cy, R (iParams 0..2), iRefract
  // and the rim width are in points; the harmonics are dimensionless and
  // every other length is a fraction of R.
  const bubbleUniforms = useDerivedValue(() => {
    const u = uniforms.value;
    const p = paramBuffer.value.slice(base, base + PARAM_FLOATS);
    p[0] *= pixelDensity;
    p[1] *= pixelDensity;
    p[2] *= pixelDensity;
    return {
      ...u,
      iParams: p,
      iRefract: u.iRefract * pixelDensity,
      iOptics: [
        u.iOptics[0],
        u.iOptics[1] * pixelDensity,
        u.iOptics[2],
        u.iOptics[3],
      ],
    };
  });

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
    // The clip lives in the same space as the filter, so it scales too.
    const h = (reach + pad) * pixelDensity;
    const cx = p[base] * pixelDensity;
    const cy = p[base + 1] * pixelDensity;
    return rect(cx - h, cy - h, 2 * h, 2 * h);
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
