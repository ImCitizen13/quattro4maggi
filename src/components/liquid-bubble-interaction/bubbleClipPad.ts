/**
 * bubbleClipPad — the backdrop clip's padding, extracted so a second caller
 * (the birth optics crossover) can compute it with different lever values
 * than `BaselineBubble`'s own live optics.
 */

import { CLIP_SLACK } from "@/components/liquid-bubble-live/liveConfig";

// ============================================================================
// Helpers
// ============================================================================

/**
 * How far past the rim a bubble's pass reads and draws, pt. R in pt.
 * `lens` only widens when negative (pincushion); `haloSpread` only counts when
 * the halo is actually drawn.
 */
export function bubblePadPt(
  refract: number,
  lens: number,
  dispersion: number,
  haloOpacity: number,
  haloSpread: number,
  R: number,
): number {
  "worklet";
  return (
    refract +
    R * (Math.max(0, -lens) + dispersion + (haloOpacity !== 0 ? haloSpread : 0)) +
    CLIP_SLACK
  );
}
