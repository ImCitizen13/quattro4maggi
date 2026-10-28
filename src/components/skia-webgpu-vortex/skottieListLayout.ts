// ============================================================================
// Skottie list layout (physical px, no Skia imports: safe on both runtimes)
// ============================================================================

/** Logical (pt) design values, scaled by the device pixel ratio. */
export const LIST_CARD_RADIUS = 12;
export const LIST_PADDING = 16;
export const LIST_GAP = 16;
/** Card height as a fraction of card width. */
export const LIST_CARD_ASPECT = 0.75;

/** Fixed geometry of the list for one stage size, in physical px. */
export type SkottieListLayout = {
  /** Stage size, physical px. */
  width: number;
  height: number;
  /** Device pixel ratio the values below were scaled with. */
  dpr: number;
  radius: number;
  padding: number;
  cardWidth: number;
  cardHeight: number;
  /** Distance between two card tops. */
  stride: number;
  count: number;
  /** Total scrollable content height. */
  contentHeight: number;
  /** Max scroll offset (0 when the content fits the stage). */
  maxOffset: number;
};

/** A card to draw this frame, stage coordinates (scroll already applied). */
export type VisibleCard = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Build the list geometry for a stage of `width` x `height` physical px. */
export const createSkottieListLayout = (
  width: number,
  height: number,
  dpr: number,
  count: number,
): SkottieListLayout => {
  const padding = LIST_PADDING * dpr;
  const cardWidth = Math.max(0, width - padding * 2);
  const cardHeight = cardWidth * LIST_CARD_ASPECT;
  const stride = cardHeight + LIST_GAP * dpr;
  const contentHeight = padding + count * stride;
  return {
    width,
    height,
    dpr,
    radius: LIST_CARD_RADIUS * dpr,
    padding,
    cardWidth,
    cardHeight,
    stride,
    count,
    contentHeight,
    maxOffset: Math.max(0, contentHeight - height),
  };
};

/**
 * Cards intersecting the stage for a scroll `offset` (px, 0 = top). Only these
 * are drawn. Runs on the UI runtime inside `drawSource`.
 */
export const getVisibleCards = (
  layout: SkottieListLayout,
  offset: number,
): VisibleCard[] => {
  "worklet";
  const out: VisibleCard[] = [];
  const first = Math.max(0, Math.floor((offset - layout.padding) / layout.stride));
  for (let i = first; i < layout.count; i++) {
    const y = layout.padding + i * layout.stride - offset;
    if (y >= layout.height) break;
    if (y + layout.cardHeight <= 0) continue;
    out.push({
      index: i,
      x: layout.padding,
      y,
      width: layout.cardWidth,
      height: layout.cardHeight,
    });
  }
  return out;
};

/**
 * Largest rect with the animation's aspect centred in a card, inset by
 * `padding`. Card-local coordinates.
 */
export const fitInCard = (
  layout: SkottieListLayout,
  animWidth: number,
  animHeight: number,
): { x: number; y: number; width: number; height: number } => {
  const availW = layout.cardWidth - layout.padding * 2;
  const availH = layout.cardHeight - layout.padding * 2;
  const scale = Math.min(availW / animWidth, availH / animHeight);
  const w = animWidth * scale;
  const h = animHeight * scale;
  return {
    x: (layout.cardWidth - w) / 2,
    y: (layout.cardHeight - h) / 2,
    width: w,
    height: h,
  };
};
