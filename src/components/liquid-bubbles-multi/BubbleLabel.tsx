/**
 * BubbleLabel — one intro bubble's text, drawn where the bubble is.
 * Design notes: README.md → "BubbleLabel.tsx".
 *
 * FLOW:
 *   bubble.x / y  → group translate      (it rides along to the corner)
 *   bubble.r      → group scale          (grows with the inflate spring)
 *   bubble.labelOpacity → group opacity  (fades in on arrival)
 *
 * KEY FEATURES:
 * - Drawn BEFORE the bubble passes, so the glass refracts its own label.
 * - The paragraph is laid out once by the caller at the bubble's rest size;
 *   only the transform animates, so nothing re-renders or re-measures.
 */

import { Group, Paragraph, type SkParagraph } from "@shopify/react-native-skia";
import React from "react";
import { useDerivedValue } from "react-native-reanimated";

import type { IntroBubble } from "./hooks/useIntroTimeline";

// ============================================================================
// Types
// ============================================================================

export type BubbleLabelProps = {
  /** The bubble this label lives inside. */
  bubble: IntroBubble;
  /** Laid out at `width`, centered on the bubble. */
  paragraph: SkParagraph | null;
  /** Wrap width the paragraph was laid out at, pt. */
  width: number;
  /** The paragraph's measured height, pt. */
  height: number;
  /** Radius the layout above corresponds to: scale = r / restRadius. */
  restRadius: number;
};

// ============================================================================
// Component
// ============================================================================

export function BubbleLabel({
  bubble,
  paragraph,
  width,
  height,
  restRadius,
}: BubbleLabelProps) {
  const transform = useDerivedValue(() => [
    { translateX: bubble.x.value },
    { translateY: bubble.y.value },
    { scale: restRadius > 0 ? bubble.r.value / restRadius : 1 },
  ]);

  if (!paragraph) {
    return null;
  }

  return (
    <Group transform={transform} opacity={bubble.labelOpacity}>
      <Paragraph
        paragraph={paragraph}
        x={-width / 2}
        y={-height / 2}
        width={width}
      />
    </Group>
  );
}
