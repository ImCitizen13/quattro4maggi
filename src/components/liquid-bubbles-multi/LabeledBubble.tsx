/**
 * LabeledBubble — one bubble as ONE component: its label (icon + text) and
 * the glass pass that refracts it. Design notes: README.md → "LabeledBubble.tsx".
 *
 * FLOW:
 *   <Group pd>  BubbleLabel   ← backdrop, authored in points
 *   </Group>
 *   BaselineBubble            ← the pass, in device pixels, on top
 *   <Group pd>  BubbleFilmOverlay  ← optional soap film over the glass
 *   </Group>
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
 * - **`birthOptics` is glass-only.** `useBirthOptics` blends the bubble's
 *   uniforms (and the clip pad they imply) from this exaggerated "birth" look
 *   toward the live optics once `bubble.inflate` crosses `BIRTH_SWAP_START`,
 *   over a fixed `BIRTH_SWAP_MS` on its own clock (not scrubbable — see the
 *   hook). The label is untouched either way.
 */

import { Group, type SkParagraph } from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import type {
  BubbleOptics,
  BubbleOpticsValues,
  BubbleUniforms,
} from "@/components/liquid-bubble-live/hooks/useBubbleOptics";

import { BaselineBubble } from "./BaselineBubble";
import { BubbleFilmOverlay, type BubbleFilm } from "./BubbleFilmOverlay";
import type { BubbleIcon } from "./bubbleIcon";
import { BubbleLabel } from "./BubbleLabel";
import { useBirthOptics } from "./hooks/useBirthOptics";
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
  /**
   * The exaggerated glass this bubble wears while it inflates, crossing over
   * to the live optics once its own scale curve reaches `BIRTH_SWAP_START` —
   * then over a fixed `BIRTH_SWAP_MS`, not the rest of the inflate curve.
   * Needs `bubble.inflate`; undefined = the live look throughout.
   */
  birthOptics?: Partial<BubbleOpticsValues>;
  /**
   * Soap film drawn over the glass (liquid-bubble-live's overlay pass). When
   * set, the glass's own cosine film is zeroed — the overlay replaces it.
   * Undefined = the built-in film only.
   */
  film?: BubbleFilm;
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
  birthOptics,
  film,
}: LabeledBubbleProps) {
  // Undo the screen's `1 / pd`, so the label is authored in points like the
  // rest of the backdrop. Static — built once per pixelDensity.
  const toPoints = useMemo(
    () => [{ scale: pixelDensity }],
    [pixelDensity],
  );

  const born = useBirthOptics({
    uniforms,
    optics,
    radius: bubble.r,
    inflate: bubble.inflate,
    birth: birthOptics,
  });

  // With the overlay on, the glass drops its built-in film (as in
  // liquid-bubble-live). Fixed for the mount, so a plain boolean capture.
  const hasFilm = film !== undefined;
  const glassUniforms = useDerivedValue(() =>
    hasFilm ? { ...born.uniforms.value, iFilm: 0 } : born.uniforms.value,
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
        uniforms={glassUniforms}
        optics={optics}
        pixelDensity={pixelDensity}
        padOverride={born.clipPad}
      />
      {film && (
        <Group transform={toPoints}>
          <BubbleFilmOverlay
            index={index}
            paramBuffer={paramBuffer}
            uniforms={born.uniforms}
            optics={optics}
            film={film}
          />
        </Group>
      )}
    </>
  );
}
