import { Skia, type SkFont, type SkPath } from "@shopify/react-native-skia";

/**
 * Split any `SkPath` into one open-stroke SVG string **per contour** — the reusable
 * core behind `ThreadsSpotlight`'s multi-path input. Feeding one entry per contour
 * (rather than the whole path as a single entry) is what lets the travelling bead
 * *jump* the gap between disjoint sub-strokes instead of a single `<Vertices>` strip
 * bridging them with a stray quad (see the multi-path gotcha in
 * docs/features/threads-spotlight.md).
 *
 * Works on any `SkPath` you already hold — a mandala's `linesPath`, a hand-built path,
 * etc. Positions are kept as-is (the spotlight fits + centers the union of all paths);
 * only the contour *order* matters, as that becomes the sweep order.
 *
 * @returns SVG strings, one per non-degenerate contour (`[]` if the path has none).
 */
export function splitPathContours(path: SkPath | null): string[] {
  if(path === null) return [""]
   const iter = Skia.ContourMeasureIter(path, false, 1);
  const paths: string[] = [];
  for (let contour = iter.next(); contour; contour = iter.next()) {
    const len = contour.length();
    if (len <= 0) continue; // skip zero-length contours (e.g. text spaces contribute none)
    // Extract the whole contour as its own path; toSVGString gives a string entry.
    paths.push(contour.getSegment(0, len, true).toSVGString());
  }
  return paths;
}

/**
 * Turn a run of text into an array of open-stroke SVG path strings — one per glyph
 * *contour* — ready to feed straight into `ThreadsSpotlight`'s `paths`.
 *
 * Two steps: `Skia.Path.MakeFromText` lays the whole string out (advances + kerning)
 * into one `SkPath` whose contours are, in order, each glyph's outline(s) left to
 * right; then {@link splitPathContours} splits that into one entry per contour. Per
 * *contour*, not per glyph, means a letter's outline and its counter (the hole in `a`,
 * `b`, `o`, …) become separate entries, so the bead jumps between a letter's parts
 * cleanly. (Hand an existing `SkPath` — e.g. a mandala's `linesPath` — straight to
 * `splitPathContours` instead; this just prepends the text-layout step.)
 *
 * The paths are in Skia text space: baseline at y = 0, glyphs extending upward (into
 * negative y). Absolute position doesn't matter — the spotlight fits + centers the
 * union of all paths — but the left-to-right *order* becomes the sweep order.
 *
 * @returns SVG path strings in reading order, or `[]` if the text has no outlines
 *   (empty string, whitespace only, or a font with no matching glyphs).
 */
export function textToGlyphPaths(text: string, font: SkFont): string[] {
  const full = Skia.Path.MakeFromText(text, 0, 0, font);
  return full ? splitPathContours(full) : [];
}

export default textToGlyphPaths;
