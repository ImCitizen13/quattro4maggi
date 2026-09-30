/**
 * SelectCard — the frosted squircle that slides up under a chosen bubble,
 * with that bubble's points on it (the grown bubble above is the title).
 * Design notes: README.md → "SelectCard.tsx".
 *
 * FLOW:
 *   top (pt, from useBubbleSelect) → translate, in device pixels
 *   BackdropBlur clipped to the squircle  ← frosts whatever is behind
 *     └ white wash, same squircle
 *   rim stroke
 *   <Group pd> Paragraph </Group>        ← text back in points
 *
 * KEY FEATURES:
 * - **Device-pixel space, like the glass.** It sits directly under the
 *   screen's `1 / pd` group, so the blur snapshots at full resolution; the
 *   path, the blur sigma and the translate are all × `pixelDensity`. Only the
 *   translate animates — the path is built once per size.
 * - **Squircle** = straight edges + superellipse corners
 *   (`SELECT_CARD_CORNER_EXP`), not a circular-arc RRect.
 */

import {
  BackdropBlur,
  Group,
  Paragraph,
  Path,
  Skia,
  type SkParagraph,
  type SkPath,
} from "@shopify/react-native-skia";
import React, { useMemo } from "react";
import { useDerivedValue, type DerivedValue } from "react-native-reanimated";

import {
  SELECT_CARD_BLUR,
  SELECT_CARD_CORNER,
  SELECT_CARD_CORNER_EXP,
  SELECT_CARD_FILL,
  SELECT_CARD_PAD,
  SELECT_CARD_RIM,
  SELECT_CARD_WIDTH,
} from "./multiBubbleConfig";

// ============================================================================
// Types
// ============================================================================

export type SelectCardProps = {
  /** Canvas width, pt — the card is `SELECT_CARD_WIDTH` of it. */
  width: number;
  /** Card height, pt: the paragraph's height + `SELECT_CARD_PAD` × 2. */
  cardHeight: number;
  /** The card's top edge, pt. */
  top: DerivedValue<number>;
  /** The points, laid out by the caller at the card's inner width. */
  paragraph: SkParagraph | null;
  /** Local units per point (the screen's `PD`). @default 1 */
  pixelDensity?: number;
};

// ============================================================================
// Squircle path
// ============================================================================

/** Points sampled per corner — plenty for a smooth curve at device res. */
const CORNER_SEGMENTS = 32;

/**
 * A w × h squircle from (0, 0): straight edges joined by quarter
 * superellipses of radius `r`, exponent `n`. Traced clockwise from the top edge.
 */
export function makeSquirclePath(
  w: number,
  h: number,
  r: number,
  n: number,
): SkPath {
  const path = Skia.Path.Make();
  const e = 2 / n;
  const rr = Math.min(r, w / 2, h / 2);
  // Corner centres and the direction each quarter is swept, clockwise.
  const corners: [number, number, number, number, boolean][] = [
    [w - rr, rr, 1, -1, true], // top-right: top point → right point
    [w - rr, h - rr, 1, 1, false], // bottom-right: right → bottom
    [rr, h - rr, -1, 1, true], // bottom-left: bottom → left
    [rr, rr, -1, -1, false], // top-left: left → top
  ];
  let first = true;
  for (const [cx, cy, sx, sy, fromTop] of corners) {
    for (let k = 0; k <= CORNER_SEGMENTS; k++) {
      const f = k / CORNER_SEGMENTS;
      const t = (fromTop ? 1 - f : f) * (Math.PI / 2);
      const px = cx + sx * rr * Math.pow(Math.max(Math.cos(t), 0), e);
      const py = cy + sy * rr * Math.pow(Math.max(Math.sin(t), 0), e);
      if (first) {
        path.moveTo(px, py);
        first = false;
      } else {
        path.lineTo(px, py);
      }
    }
  }
  path.close();
  return path;
}

// ============================================================================
// Component
// ============================================================================

export function SelectCard({
  width,
  cardHeight,
  top,
  paragraph,
  pixelDensity = 1,
}: SelectCardProps) {
  const cardW = width * SELECT_CARD_WIDTH;
  const cardH = cardHeight;
  const left = (width - cardW) / 2;
  const pd = pixelDensity;

  const path = useMemo(
    () =>
      makeSquirclePath(
        cardW * pd,
        cardH * pd,
        SELECT_CARD_CORNER * pd,
        SELECT_CARD_CORNER_EXP,
      ),
    [cardW, cardH, pd],
  );

  const transform = useDerivedValue(() => [
    { translateX: left * pd },
    { translateY: top.value * pd },
  ]);

  const toPoints = useMemo(() => [{ scale: pd }], [pd]);

  return (
    <Group transform={transform}>
      <BackdropBlur blur={SELECT_CARD_BLUR * pd} clip={path}>
        <Path path={path} color={SELECT_CARD_FILL} />
      </BackdropBlur>
      <Path
        path={path}
        style="stroke"
        strokeWidth={pd}
        color={SELECT_CARD_RIM}
      />
      {paragraph && (
        <Group transform={toPoints}>
          <Paragraph
            paragraph={paragraph}
            x={SELECT_CARD_PAD}
            y={SELECT_CARD_PAD}
            width={cardW - 2 * SELECT_CARD_PAD}
          />
        </Group>
      )}
    </Group>
  );
}
