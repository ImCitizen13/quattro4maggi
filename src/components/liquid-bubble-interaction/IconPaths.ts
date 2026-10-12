/**
 * IconPaths — the glyphs a bubble can wear, as `BubbleIcon` specs.
 *
 * Each path is an SVG `d` string plus the square box it was authored in: the
 * X mark comes from a 24 viewBox, the three hand-drawn ones from a 100 box.
 * `BubbleLabel` scales whatever it is handed to the icon's `size`, so mixing
 * authoring boxes is fine as long as each one declares its own.
 *
 * `INTRO_ICONS` is the order the four intro bubbles take, matching
 * `INTRO_LABELS` in `multiBubbleConfig.ts` — index i of one goes with index i
 * of the other.
 */

import type { BubbleIcon } from "./bubbleIcon";

// ============================================================================
// Raw paths
// ============================================================================

export const X_ICON_PATH =
  "M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z";
export const PODCAST_ICON_PATH =
  "M42,23 A8,8 0 0,1 50,15 A8,8 0 0,1 58,23 L58,47 A8,8 0 0,1 50,55 A8,8 0 0,1 42,47 Z M28,50 A22,22 0 0,0 72,50 L67,50 A17,17 0 0,1 33,50 Z M48,72 L52,72 L52,84 L48,84 Z M36,84 L64,84 L64,88 L36,88 Z";
export const READING_ICON_PATH =
  "M50,25 C44,20 30,17 18,18 L18,72 C30,71 44,74 50,79 C56,74 70,71 82,72 L82,18 C70,17 56,20 50,25 Z M50,25 L50,79 M22,28 C30,27 40,29 46,32 M22,38 C30,37 40,39 46,42 M22,48 C30,47 40,49 46,52 M54,32 C60,29 70,27 78,28 M54,42 C60,39 70,37 78,38 M54,52 C60,49 70,47 78,48";
export const MEETING_ICON_PATH =
  "M35,30 L35,22 C35,19 37,17 40,17 L60,17 C63,17 65,19 65,22 L65,30 L85,30 C88,30 90,32 90,35 L90,75 C90,78 88,80 85,80 L15,80 C12,80 10,78 10,75 L10,35 C10,32 12,30 15,30 Z M42,24 L58,24 L58,30 L42,30 Z M45,50 L55,50 L55,58 L45,58 Z";




// ============================================================================
// Specs
// ============================================================================

/** X / Twitter mark. Authored in a 24 viewBox, filled. */
export const X_ICON: BubbleIcon = { path: X_ICON_PATH, box: 24 };

/** Microphone on a stand. Closed sub-paths, filled. */
export const PODCAST_ICON: BubbleIcon = { path: PODCAST_ICON_PATH, box: 100 };

/**
 * Open book. Mostly OPEN line segments (the spine and the text rules), so it
 * has to be stroked — filling it would swallow the rules and blob the covers.
 */
export const READING_ICON: BubbleIcon = {
  path: READING_ICON_PATH,
  box: 100,
  strokeWidth: 4,
};

/** Paper plane. One closed outline, filled. */
export const MEETING_ICON: BubbleIcon = { path: MEETING_ICON_PATH, box: 100 };

/** One per `INTRO_LABELS`, same order. */
export const INTRO_ICONS: readonly BubbleIcon[] = [
  PODCAST_ICON,
  READING_ICON,
  MEETING_ICON,
  X_ICON,
];
