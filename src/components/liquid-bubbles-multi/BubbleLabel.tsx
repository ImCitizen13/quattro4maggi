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
 * - An icon sits above the text, from `bubbleIcon.ts` — that file is the only
 *   place to change its shape, size, colour or gap. `showIcon={false}` drops
 *   it for one label.
 * - The paragraph is laid out once by the caller at the bubble's rest size;
 *   only the transform animates, so nothing re-renders or re-measures.
 */

import {
  Group,
  Paragraph,
  Path,
  type SkParagraph,
} from "@shopify/react-native-skia";
import React from "react";
import { useDerivedValue } from "react-native-reanimated";

import {
  BUBBLE_ICON_BOX,
  BUBBLE_ICON_COLOR,
  BUBBLE_ICON_GAP,
  BUBBLE_ICON_PATH,
  BUBBLE_ICON_SIZE,
} from "./bubbleIcon";
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
  /** Draw the icon from `bubbleIcon.ts` above the text. Default: true. */
  showIcon?: boolean;
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
  showIcon = true,
}: BubbleLabelProps) {
  const transform = useDerivedValue(() => [
    { translateX: bubble.x.value },
    { translateY: bubble.y.value },
    { scale: restRadius > 0 ? bubble.r.value / restRadius : 1 },
  ]);

  // The icon is authored in a BUBBLE_ICON_BOX box from its own top-left
  // origin, so it gets its own static transform: centred on x, sitting a
  // BUBBLE_ICON_GAP above the paragraph's top edge, scaled to
  // BUBBLE_ICON_SIZE. It is inside the group above, so it rides, scales and
  // fades with the bubble for free.
  const iconScale = BUBBLE_ICON_SIZE / BUBBLE_ICON_BOX;
  const iconTransform = [
    { translateX: -BUBBLE_ICON_SIZE / 2 },
    { translateY: -height / 2 - BUBBLE_ICON_GAP - BUBBLE_ICON_SIZE },
    { scale: iconScale },
  ];

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
      {/* Icon ABOVE the text — see bubbleIcon.ts to change it. */}
      {showIcon && (
        <Group transform={iconTransform}>
          <Path path={BUBBLE_ICON_PATH} color={BUBBLE_ICON_COLOR} />
        </Group>
      )}
    </Group>
  );
}
