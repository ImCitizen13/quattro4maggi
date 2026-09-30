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
 * - An icon sits above the text, passed in as a `BubbleIcon` (path + the box
 *   it was authored in, see `bubbleIcon.ts` for the shape and `IconPaths.ts`
 *   for the glyphs). Omit `icon` for the default circle; `showIcon={false}`
 *   drops it entirely for one label.
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
  BUBBLE_CONTENT_PAD,
  BUBBLE_ICON_COLOR,
  BUBBLE_ICON_GAP,
  BUBBLE_ICON_SIZE,
  DEFAULT_BUBBLE_ICON,
  type BubbleIcon,
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
  /** The glyph above the text. Default: `DEFAULT_BUBBLE_ICON`. */
  icon?: BubbleIcon;
  /** Draw the icon at all. Default: true. */
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
  icon = DEFAULT_BUBBLE_ICON,
  showIcon = true,
}: BubbleLabelProps) {
  const transform = useDerivedValue(() => [
    { translateX: bubble.x.value },
    { translateY: bubble.y.value },
    { scale: restRadius > 0 ? bubble.r.value / restRadius : 1 },
  ]);

  // The icon is authored in an `icon.box` box from its own top-left origin,
  // so it gets its own static transform: centred on x, sitting a `gap` above
  // the paragraph's top edge, scaled to `size`. It is inside the group above,
  // so it rides, scales and fades with the bubble for free.
  const iconSize = icon.size ?? BUBBLE_ICON_SIZE;
  const iconGap = icon.gap ?? BUBBLE_ICON_GAP;
  const iconScale = iconSize / icon.box;

  // Centre the WHOLE block — icon, gap, text — on the bubble's centre, then
  // nudge it down by BUBBLE_CONTENT_PAD. Without this the paragraph alone is
  // centred and the icon hangs off the top, so the block reaches
  // `h/2 + gap + size` upward but only `h/2` down: the icon crowds the rim
  // while the bottom of the bubble sits empty. `shiftY` moves both children
  // together, so their spacing to each other never changes.
  const blockAbove = showIcon ? iconGap + iconSize : 0;
  const shiftY = blockAbove / 2 + (showIcon ? BUBBLE_CONTENT_PAD : 0);

  const iconTransform = [
    { translateX: -iconSize / 2 },
    { translateY: -height / 2 - iconGap - iconSize + shiftY },
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
        y={-height / 2 + shiftY}
        width={width}
      />
      {/* Icon ABOVE the text. A `strokeWidth` glyph is an OPEN path (the book's
          rules and spine) and has to be stroked — in its own authoring units,
          since the group above is already scaled to `size`. */}
      {showIcon && (
        <Group transform={iconTransform}>
          <Path
            path={icon.path}
            color={icon.color ?? BUBBLE_ICON_COLOR}
            style={icon.strokeWidth ? "stroke" : "fill"}
            strokeWidth={icon.strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />

        </Group>
      )}
    </Group>
  );
}
