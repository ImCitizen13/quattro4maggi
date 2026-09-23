/**
 * bubbleIcon — the little glyph drawn above a bubble's label.
 *
 * THIS IS THE FILE TO EDIT to change the icon: swap `BUBBLE_ICON_PATH` for
 * any SVG path `d` string, set `BUBBLE_ICON_BOX` to the size of the box that
 * path was authored in, and the renderer scales it to `BUBBLE_ICON_SIZE` and
 * centres it over the text. Nothing else needs to change.
 *
 * It is drawn by `BubbleLabel.tsx` inside the label's own transform, so it
 * rides along with the bubble, scales with it, fades with it, and — because
 * labels are part of the backdrop — is refracted by the glass like the text.
 *
 * Placeholder for now: a filled red circle.
 */

/**
 * The icon's outline, an SVG path `d` string authored inside a
 * `BUBBLE_ICON_BOX` × `BUBBLE_ICON_BOX` box with its origin at the top left.
 * Currently a circle: two half-arcs, which is how a circle is expressed as a
 * path (an arc can't sweep a full 360° in one command).
 */
export const BUBBLE_ICON_PATH =
  "M 0 12 A 12 12 0 1 0 24 12 A 12 12 0 1 0 0 12 Z";

/** The box `BUBBLE_ICON_PATH` is authored in. Only used to scale it. */
export const BUBBLE_ICON_BOX = 24;

/** Drawn size, pt, at the bubble's REST radius — it scales with the bubble. */
export const BUBBLE_ICON_SIZE = 22;

/** Fill colour. */
export const BUBBLE_ICON_COLOR = "red";

/** Gap between the icon's bottom edge and the label's top edge, pt. */
export const BUBBLE_ICON_GAP = 8;
