/**
 * LabeledBubble — one bubble as ONE component: its label (icon + text) and
 * the glass pass that refracts it. Design notes: README.md → "LabeledBubble.tsx".
 *
 * FLOW:
 *   <Group pd>  BubbleLabel   ← backdrop, authored in points
 *   </Group>
 *   BaselineBubble            ← the pass, in device pixels, on top
 *
 * KEY FEATURES:
 * - **The order inside is the point.** The label is drawn BEFORE the pass, so
 *   the glass refracts its own contents. Putting the pair in one component
 *   means a caller can never split them or get the order wrong.
 * - **The DPR sandwich survives.** The label goes back into points with its
 *   own `pixelDensity` group (the screen's `DPR_UP`); the pass stays outside
 *   it and scales its own point uniforms. So this drops straight into the
 *   screen's outer `1 / pd` group. See `CRISP_BUBBLES` in the screen.
 * - **The icon is a prop** (`BubbleIcon` from `IconPaths.ts`), so every bubble
 *   carries its own glyph.
 * - Bubbles do not overlap, so interleaving label/pass per bubble reads the
 *   same as the old "all labels, then all passes" — with one Group more per
 *   bubble and no `saveLayer`.
 */

import { Group, type SkParagraph } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import type { DerivedValue, SharedValue } from "react-native-reanimated";

import type {
  BubbleOptics,
  BubbleUniforms,
} from "@/components/liquid-bubble-live/hooks/useBubbleOptics";

import { BaselineBubble } from "./BaselineBubble";
import type { BubbleIcon } from "./bubbleIcon";
import { BubbleLabel } from "./BubbleLabel";
import type { IntroBubble } from "./hooks/useIntroTimeline";

// ============================================================================
// Types
// ============================================================================

export type LabeledBubbleProps = {
  /** Where and how big — from `useIntroTimeline`. */
  bubble: IntroBubble;
  /** Slot in the flat param buffer (the physics writes the shape there). */
  index: number;
  /** `useMultiBubblePhysics`'s flat buffer (12 floats per bubble). */
  paramBuffer: SharedValue<number[]>;
  /** Shared optics uniforms — every bubble has the same look. */
  uniforms: DerivedValue<BubbleUniforms>;
  /** The live levers, for the pass's clip padding. */
  optics: BubbleOptics;
  /** Laid out once by the caller at `restRadius`; only the transform animates. */
  paragraph: SkParagraph | null;
  /** Wrap width the paragraph was laid out at, pt. */
  labelWidth: number;
  /** The paragraph's measured height, pt. */
  labelHeight: number;
  /** Radius that layout corresponds to: the label scales by `r / restRadius`. */
  restRadius: number;
  /** The glyph above the text. Default: the circle in `bubbleIcon.ts`. */
  icon?: BubbleIcon;
  /** Draw the icon at all. Default: true. */
  showIcon?: boolean;
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

export function LabeledBubble({
  bubble,
  index,
  paramBuffer,
  uniforms,
  optics,
  paragraph,
  labelWidth,
  labelHeight,
  restRadius,
  icon,
  showIcon = true,
  pixelDensity = 1,
}: LabeledBubbleProps) {
  // Undo the screen's `1 / pd`, so the label is authored in points like the
  // rest of the backdrop. Static — built once per pixelDensity.
  const toPoints = useMemo(
    () => [{ scale: pixelDensity }],
    [pixelDensity],
  );

  return (
    <>
      <Group transform={toPoints}>
        <BubbleLabel
          bubble={bubble}
          paragraph={paragraph}
          width={labelWidth}
          height={labelHeight}
          restRadius={restRadius}
          icon={icon}
          showIcon={showIcon}
        />
      </Group>
      <BaselineBubble
        index={index}
        paramBuffer={paramBuffer}
        uniforms={uniforms}
        optics={optics}
        pixelDensity={pixelDensity}
      />
    </>
  );
}
