/**
 * Soap Film — builds the squircle `SkPath` reactively on the UI thread.
 * Design notes: README.md → "hooks/useSquirclePath.ts".
 *
 * Superellipse `|x|^n + |y|^n = 1`, parametrized by angle so it can be
 * sampled at a fixed vertex count instead of solved per-point:
 * `x = sign(cosθ)·|cosθ|^(2/n)`, `y = sign(sinθ)·|sinθ|^(2/n)`.
 */

import { Skia, type SkPath, type SkSize } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { SQUIRCLE_PATH_SEGMENTS } from "../soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

export type UseSquirclePathParams = {
  /** Canvas size from `<Canvas onSize>`; the squircle is centered in it. */
  canvasSize: SharedValue<SkSize>;
  /** Half-size in points (already `SQUIRCLE_BASE_SIZE * scale`). */
  halfSize: SharedValue<number>;
  /** Superellipse exponent `n`; higher = squarer corners. */
  exponent: SharedValue<number>;
};

// ============================================================================
// Hook
// ============================================================================

export function useSquirclePath({
  canvasSize,
  halfSize,
  exponent,
}: UseSquirclePathParams): SharedValue<SkPath> {
  return useDerivedValue(() => {
    "worklet";
    const path = Skia.Path.Make();
    const centerX = canvasSize.value.width / 2;
    const centerY = canvasSize.value.height / 2;
    const n = exponent.value;
    const hs = halfSize.value;
    const segments = SQUIRCLE_PATH_SEGMENTS;

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const x = Math.sign(c) * Math.pow(Math.abs(c), 2.0 / n) * hs;
      const y = Math.sign(s) * Math.pow(Math.abs(s), 2.0 / n) * hs;
      if (i === 0) {
        path.moveTo(centerX + x, centerY + y);
      } else {
        path.lineTo(centerX + x, centerY + y);
      }
    }
    path.close();
    return path;
  });
}
