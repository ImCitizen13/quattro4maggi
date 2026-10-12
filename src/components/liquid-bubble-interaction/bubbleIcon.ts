/**
 * bubbleIcon — the little glyph drawn above a bubble's label.
 *
 * This file holds the SHAPE of an icon spec and the defaults every icon falls
 * back to. The actual glyphs live in `IconPaths.ts`, and a bubble is handed
 * one as a prop (`LabeledBubble` → `BubbleLabel`), so each bubble can carry
 * its own icon instead of every bubble sharing one module constant.
 *
 * An icon is drawn by `BubbleLabel.tsx` inside the label's own transform, so
 * it rides along with the bubble, scales with it, fades with it, and — because
 * labels are part of the backdrop — is refracted by the glass like the text.
 */

// ============================================================================
// Types
// ============================================================================

export type BubbleIcon = {
  /**
   * The outline, an SVG path `d` string authored inside a `box` × `box` box
   * with its origin at the top left.
   */
  path: string;
  /** The square box `path` was authored in. Only used to scale it. */
  box: number;
  /** Drawn size, pt, at the bubble's REST radius — it scales with the bubble. */
  size?: number;
  /** Fill (or stroke) colour. */
  color?: string;
  /** Gap between the icon's bottom edge and the label's top edge, pt. */
  gap?: number;
  /**
   * Stroke the path at this width (in the icon's OWN authoring units) instead
   * of filling it. Needed for glyphs drawn as open line segments — a filled
   * open path renders as a blob or not at all.
   */
  strokeWidth?: number;
};

// ============================================================================
// Defaults
// ============================================================================

/** Drawn size, pt, at the bubble's REST radius. */
export const BUBBLE_ICON_SIZE = 20;

/**
 * Extra breathing room between the content and the glass rim, pt at the
 * bubble's REST radius — the bubble-to-content padding knob.
 *
 * It shifts the whole icon + text block DOWN off centre by half of itself,
 * i.e. it trades bottom padding for top padding. Which is what you want,
 * because the icon is the part that runs into the rim: the block hangs above
 * the text, so the top is always the tight edge and the bottom always has
 * slack. 0 = the block sits exactly centred.
 */
export const BUBBLE_CONTENT_PAD = 6;

/** Fill colour. */
export const BUBBLE_ICON_COLOR = "#0f1725";

/** Gap between the icon's bottom edge and the label's top edge, pt. */
export const BUBBLE_ICON_GAP = 8;

/**
 * Fallback glyph for a bubble given no icon of its own: a filled circle — two
 * half-arcs, which is how a circle is expressed as a path (an arc can't sweep
 * a full 360° in one command).
 */
export const DEFAULT_BUBBLE_ICON: BubbleIcon = {
  path: "M 0 12 A 12 12 0 1 0 24 12 A 12 12 0 1 0 0 12 Z",
  box: 24,
};
