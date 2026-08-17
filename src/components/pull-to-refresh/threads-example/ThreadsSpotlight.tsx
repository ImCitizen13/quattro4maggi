import {
  Group,
  Path,
  Skia,
  Vertices,
  type SkPath,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import {
  Extrapolation,
  clamp,
  interpolate,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

export const THREADS_FINAL_PATH = "M921.461 259.645C829.961 83.1445 690.51 46.5124 549.643 52.6235C330.649 62.124 173.142 178.593 108.645 329.125C21.8131 531.787 28.9255 737.657 170.643 896.157C240.473 974.256 369.955 1026.36 507.143 1018.16C590.141 1013.19 762.799 976.188 846.143 825.157C929.487 674.125 812.279 581.038 772.961 555.644C733.643 530.251 502.141 473.125 389.641 537.125C344.778 562.647 298.641 627.657 348.599 709.625C398.558 791.593 616.641 812.157 683.641 627.657C716.566 536.99 699.141 412.657 683.641 376.157C668.141 339.657 628.102 287.157 520.101 287.157C437.702 293.551 389.641 309.644 348.599 376.157";
// Resting footprint as a fraction of `size` — same as LikeButton, so this icon
// sits at the identical visual weight when swapped in for the heart.
const ICON_REST_FRACTION = 0.5;

// Stroke thickness of the monoline, in path units. THREADS_FINAL_PATH is a single
// open stroke down the middle of the glyph; stroked round at roughly the logo's
// own weight, it reads as the Threads mark, and `Path.Trim` sweeps it cleanly —
// a constant-width stroke of an open path has no width to balloon at corners.
const STROKE_WIDTH = 115;

// Default resolution of the phase-1 gradient bead — the number of cross-sections
// the ribbon is built from along the window. The bead is a Skia `<Vertices>`
// triangle-strip whose per-vertex colours are Gouraud-interpolated in one draw, so
// the gradient is genuinely seamless (no abutting-stroke antialiasing hairlines) and
// follows *and* travels with the path. Higher ⇒ smoother on tight curves.
const SEGMENT_BANDS = 48;

// Resolution of the static colour LUT the bead samples (worklet-safe integer index
// instead of building colour strings on the UI thread).
const COLOR_LUT_STOPS = 128;

// Parse "#rgb" / "#rrggbb" into [r, g, b] (0–255).
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");

// Sample a multi-stop colour ramp at t ∈ [0,1], linearly in sRGB. One stop ⇒ that
// colour; N stops ⇒ evenly spaced with linear blend between neighbours.
function sampleGradient(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  const [ar, ag, ab] = hexToRgb(stops[i]);
  const [br, bg, bb] = hexToRgb(stops[i + 1]);
  return `#${toHex(ar + (br - ar) * f)}${toHex(ag + (bg - ag) * f)}${toHex(
    ab + (bb - ab) * f,
  )}`;
}

// How finely each (static) path is sampled into a polyline of positions + unit
// normals. A worklet then looks up the point *and* the perpendicular at any trim
// fraction by index, so the bead's ribbon can be offset ±½·strokeWidth to either
// edge of the stroke.
const PATH_SAMPLES = 256;

type Pt = { x: number; y: number };
// A sampled point on the path: position and the unit normal (perpendicular to the
// tangent) used to offset the ribbon edges.
type Sample = { x: number; y: number; nx: number; ny: number };

// Sample a path into ~`count` evenly arc-length-spaced points with unit normals,
// spread across *all* its contours proportionally to their length — computed once
// (the path never changes), off the UI thread. Returns the polyline and the path's
// total geometric length (so callers can size its share of the global timeline).
function samplePath(path: SkPath, count: number): { samples: Sample[]; length: number } {
  const it = Skia.ContourMeasureIter(path, false, 1);
  const contours: { c: ReturnType<typeof it.next>; len: number }[] = [];
  let total = 0;
  for (let c = it.next(); c; c = it.next()) {
    const len = c.length();
    contours.push({ c, len });
    total += len;
  }
  if (total === 0) return { samples: [], length: 0 };
  const out: Sample[] = [];
  for (const { c, len } of contours) {
    if (!c) continue;
    // Divide the sample budget by each contour's share of the length so the whole
    // polyline stays arc-length-uniform, matching how Path.Trim measures fractions.
    const n = Math.max(1, Math.round((count * len) / total));
    for (let i = 0; i <= n; i++) {
      const [pos, tan] = c.getPosTan((i / n) * len);
      const tl = Math.hypot(tan.x, tan.y) || 1;
      // normal = tangent rotated 90°, normalised.
      out.push({ x: pos.x, y: pos.y, nx: -tan.y / tl, ny: tan.x / tl });
    }
  }
  return { samples: out, length: total };
}

// Position + unit normal at fraction t ∈ [0,1] along the sampled polyline. Worklet —
// runs per cross-section, per frame, as the bead moves.
function sampleAt(samples: Sample[], t: number): Sample {
  "worklet";
  const n = samples.length;
  if (n === 0) return { x: 0, y: 0, nx: 0, ny: 0 };
  const x = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(Math.floor(x), n - 2);
  const f = x - i;
  const a = samples[i];
  const b = samples[i + 1];
  let nx = a.nx + (b.nx - a.nx) * f;
  let ny = a.ny + (b.ny - a.ny) * f;
  const nl = Math.hypot(nx, ny) || 1;
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    nx: nx / nl,
    ny: ny / nl,
  };
}

// The phase-1 bead as a window on the *global* timeline at pull `p`: its absolute
// start/end fractions plus the slice `[lo, hi]` of the colour ramp it currently
// shows. Continuous form of the old accordion — the trailing edge pins at the first
// tip while opening (revealing ramp `[0, hi]`), the window translates at full size
// across the plateau (`[0, 1]`), then the leading edge pins at the last tip while
// collapsing (revealing ramp `[lo, 1]`). No discrete bands, so nothing to seam.
function beadWindow(
  p: number,
  edge: number,
  window: number,
): { a: number; b: number; lo: number; hi: number } {
  "worklet";
  if (p <= edge) {
    const f = edge > 0 ? p / edge : 1; // openness 0 → 1
    return { a: 0, b: f * window, lo: 0, hi: f };
  }
  if (p >= 1 - edge) {
    const f = edge > 0 ? (1 - p) / edge : 1; // openness 1 → 0
    return { a: 1 - f * window, b: 1, lo: 1 - f, hi: 1 };
  }
  const tail = ((p - edge) / (1 - 2 * edge)) * (1 - window); // translate
  return { a: tail, b: tail + window, lo: 0, hi: 1 };
}

// Intersect the global bead window with one sub-path's timeline span `[s, e]`,
// returning the bead's *local* fractions on that path (`la`, `lb`) and the slice of
// the colour ramp that falls on it (`ra`, `rb`). `empty` when the window doesn't
// reach this path. This is what "divides the animation across all paths": the same
// travelling bead is projected onto whichever path(s) it currently overlaps, so the
// gradient stays continuous even as the bead jumps the gap between disjoint parts.
function beadSlice(
  p: number,
  edge: number,
  window: number,
  s: number,
  e: number,
): { empty: boolean; la: number; lb: number; ra: number; rb: number } {
  "worklet";
  const win = beadWindow(p, edge, window);
  const A = Math.max(win.a, s);
  const B = Math.min(win.b, e);
  const span = e - s || 1;
  const wspan = win.b - win.a;
  if (B <= A || wspan <= 0) return { empty: true, la: 0, lb: 0, ra: 0, rb: 0 };
  return {
    empty: false,
    la: (A - s) / span,
    lb: (B - s) / span,
    ra: win.lo + ((A - win.a) / wspan) * (win.hi - win.lo),
    rb: win.lo + ((B - win.a) / wspan) * (win.hi - win.lo),
  };
}

// Project a global reveal head (`0 → 1` over the whole concatenated timeline) onto
// one sub-path's span `[s, e]`, as a local `[start, end]` trim. Forward the reveal
// grows from the first path's start (`[0, head]`); reversed it grows from the last
// path's end (`[1 - head, 1]`). A path fully behind the head reads `[0, 1]` (drawn);
// fully ahead reads an empty span (undrawn) — so the reveal paints path after path.
function sliceReveal(
  head: number,
  s: number,
  e: number,
  reverse: boolean,
): { start: number; end: number } {
  "worklet";
  const span = e - s || 1;
  if (reverse) {
    return { start: clamp((1 - head - s) / span, 0, 1), end: 1 };
  }
  return { start: 0, end: clamp((head - s) / span, 0, 1) };
}

// One sub-path of the glyph, drawn in its own coordinate space (the parent Group
// carries the shared fit/centre transform). Everything it draws is derived from the
// *global* heads plus this path's timeline span `[s, e]`, so the animation is one
// continuous sweep divided across the paths.
type SubPathLayerProps = {
  path: SkPath;
  samples: Sample[];
  /** This path's slice of the global timeline, by cumulative arc length. */
  s: number;
  e: number;
  /** Global heads/opacities, shared across every sub-path (clamped in the parent). */
  progress: SharedValue<number>;
  whiteHead: SharedValue<number>;
  yellowHead: SharedValue<number>;
  glyphOpacity: SharedValue<number>;
  accentOpacity: SharedValue<number>;
  window: number;
  segmentEdge: number;
  /** Live monoline thickness (a slider can drive it), in path units. */
  strokeWidth: SharedValue<number>;
  segments: number;
  colorLUT: string[];
  colorLutStops: number;
  color: string;
  accentColor: string;
  reverse: boolean;
  /** Live override of the reveals' direction; falls back to `reverse`. */
  revealReverse?: SharedValue<boolean>;
};

function SubPathLayer({
  path,
  samples,
  s,
  e,
  progress,
  whiteHead,
  yellowHead,
  glyphOpacity,
  accentOpacity,
  window,
  segmentEdge,
  strokeWidth,
  segments,
  colorLUT,
  colorLutStops,
  color,
  accentColor,
  reverse,
  revealReverse,
}: SubPathLayerProps) {
  // The bead ribbon on this path: the global window sliced onto `[s, e]`, then built
  // as two edge vertices per cross-section (a triangle strip [L0, R0, L1, R1, …]).
  // When the window doesn't reach this path the slice is empty ⇒ every cross-section
  // collapses to one point ⇒ a degenerate strip that draws nothing.
  const ribbonVertices = useDerivedValue(() => {
    const sl = beadSlice(clamp(progress.value, 0, 1), segmentEdge, window, s, e);
    const la = sl.empty ? 0 : sl.la;
    const lb = sl.empty ? 0 : sl.lb;
    const hw = strokeWidth.value / 2;
    const verts: Pt[] = [];
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      const frac = la + u * (lb - la);
      const sm = sampleAt(samples, reverse ? 1 - frac : frac);
      verts.push({ x: sm.x + sm.nx * hw, y: sm.y + sm.ny * hw });
      verts.push({ x: sm.x - sm.nx * hw, y: sm.y - sm.ny * hw });
    }
    return verts;
  });

  // Per-vertex colours, sampled from the ramp slice this path currently shows. Both
  // edge vertices of a cross-section share a colour; Skia Gouraud-interpolates
  // between cross-sections (and, across paths, the ramp params are continuous), so
  // the whole travelling bead stays one seamless gradient.
  const ribbonColors = useDerivedValue(() => {
    const sl = beadSlice(clamp(progress.value, 0, 1), segmentEdge, window, s, e);
    const ra = sl.empty ? 0 : sl.ra;
    const rb = sl.empty ? 0 : sl.rb;
    const cols: string[] = [];
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      let phi = ra + u * (rb - ra);
      if (reverse) phi = 1 - phi;
      const c = colorLUT[Math.round(clamp(phi, 0, 1) * colorLutStops)];
      cols.push(c, c);
    }
    return cols;
  });

  // The reveals' direction can differ from the bead's: `revealReverse` is read
  // live inside the worklet, so a caller can point the draw at whichever tip
  // the bead just folded into with no React re-render (and no stale frame).
  const whiteTrim = useDerivedValue(() =>
    sliceReveal(
      clamp(whiteHead.value, 0, 1),
      s,
      e,
      revealReverse ? revealReverse.value : reverse,
    ),
  );
  const yellowTrim = useDerivedValue(() =>
    sliceReveal(
      clamp(yellowHead.value, 0, 1),
      s,
      e,
      revealReverse ? revealReverse.value : reverse,
    ),
  );
  const whiteStart = useDerivedValue(() => whiteTrim.value.start);
  const whiteEnd = useDerivedValue(() => whiteTrim.value.end);
  const yellowStart = useDerivedValue(() => yellowTrim.value.start);
  const yellowEnd = useDerivedValue(() => yellowTrim.value.end);

  return (
    <Group>
      {/* Base line — dims on the pull, held dim across the reveal, lifted at the end. */}
      <Path
        path={path}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="butt"
        strokeJoin="round"
        color={color}
        opacity={glyphOpacity}
      />

      {/* Phase 1 — the travelling gradient bead sliced onto this path: one
          `<Vertices>` triangle-strip ribbon, Gouraud-interpolated in a single draw. */}
      <Vertices
        mode="triangleStrip"
        vertices={ribbonVertices}
        colors={ribbonColors}
      />

      {/* Phase 2 — the white draw: the stroke trimmed to this path's share of the head. */}
      <Path
        path={path}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="square"
        strokeJoin="round"
        color={color}
        start={whiteStart}
        end={whiteEnd}
      />

      {/* Phase 3 — the yellow draw: same trim in the accent colour, fading at the end. */}
      <Path
        path={path}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="square"
        strokeJoin="round"
        color={accentColor}
        opacity={accentOpacity}
        start={yellowStart}
        end={yellowEnd}
      />
    </Group>
  );
}

type ThreadsSpotlightProps = {
  /** Size of the Canvas this is drawn into (not the window). */
  width: number;
  height: number;
  /**
   * Footprint of the glyph, matching LikeButton's `size`. Pass a `SharedValue` (e.g. a
   * slider) to rescale live — the fit transform is reactive, so it follows on the UI
   * thread without a React re-render.
   */
  size: number | SharedValue<number>;
  /**
   * The artwork as one or more open **monolines**. A single path animates as before;
   * multiple paths are stitched into one continuous timeline by cumulative arc length,
   * so the sweep paints path 0 fully, then path 1 starting where 0 ended, and so on.
   * Defaults to the Threads mark.
   */
  paths?: string[];
  /** Phase 1 — the drag. `0 → 1` head of the travelling *segment*; returns on release. */
  progress: SharedValue<number>;
  /** Length of the phase-1 segment, as a fraction of the *whole* timeline (a travelling window). */
  window?: number;
  /**
   * Colour *stops* of the phase-1 gradient bead. Sampled into a `<Vertices>` ribbon
   * whose per-vertex colours are Gouraud-interpolated in one draw, so the bead is a
   * seamless gradient. The bead grows out of the first path's start tip, travels at
   * full size (jumping the gaps between paths), then folds into the last path's end
   * tip (see `beadWindow` / `beadSlice`). Omit for a single-colour bead in `color`.
   */
  segmentColors?: string[];
  /**
   * Number of cross-sections the ribbon is built from along the window — the bead's
   * *resolution*, decoupled from the colour-stop count. More ⇒ smoother on tight
   * curves, at a linear cost per frame. Defaults to `SEGMENT_BANDS`.
   */
  segmentBands?: number;
  /**
   * Fraction of the pull over which the bead grows (at the very start) and, mirrored,
   * folds away (at the very end). The middle `[edge, 1 - edge]` stays full.
   */
  segmentEdge?: number;
  /** Phase 2 — `0 → 1` white draw that paints the whole timeline start → end (withTiming). */
  white?: SharedValue<number>;
  /** Phase 3 — `0 → 1` yellow draw that fills then fades out, revealing white (withTiming). */
  yellow?: SharedValue<number>;
  /**
   * Base-line dim, `0` = full `color`, `1` = `minOpacity`. Lets the caller hold
   * the line dim across the reveal and lift it at the end. Omit to dim straight
   * off `progress` (dims as you pull, back to full on release).
   */
  dim?: SharedValue<number>;
  /** What the base line fades *to* when fully dimmed. */
  minOpacity?: number;
  /** Fraction of the drag over which the line dims — only used when `dim` is omitted. */
  fadeBy?: number;
  /** Colour of the base line and the white draw. */
  color?: string;
  /** Colour of the accent draw that sweeps over the white and fades out. */
  accentColor?: string;
  /** Point in `yellow` at which the accent starts fading; fully gone by 1. */
  accentFadeFrom?: number;
  /**
   * Thickness of the monoline, in path units. Pass a `SharedValue` (e.g. driven by a
   * slider) to retune it live; the fit padding is computed from the value at mount, so
   * a live change just pads a touch loosely — invisible against the full-screen canvas.
   */
  strokeWidth?: number | SharedValue<number>;
  /** Draw from the last path's tail inwards instead of from the first path's start. */
  reverse?: boolean;
  /**
   * Live direction override for the white/yellow reveals only (the bead keeps
   * `reverse`). Lets a caller start the draw from whichever tip its bead
   * finished at — read on the UI thread, so flipping it never re-renders.
   */
  revealReverse?: SharedValue<boolean>;
};

/**
 * The artwork drawn as one or more open **monolines** that paint in over three
 * phases. Every layer is each path stroked at `strokeWidth` and trimmed to a span
 * with the reactive `start`/`end` props — so the sweep is just `Path.Trim` on an
 * open stroke, which has no width to measure and nothing to balloon at corners.
 *
 * With multiple `paths`, the phases run over one **global timeline** built from the
 * paths' cumulative arc lengths: the sweep fills path 0, then path 1 continuing where
 * 0 ended, and so on. Each path renders its own layers ({@link SubPathLayer}) driven
 * by a slice of the shared heads, so the bead and reveals travel path-to-path (and
 * the bead simply jumps the gaps between disjoint parts rather than bridging them):
 *   1. `progress` (the drag) drags a short *segment* (a `window` on the timeline)
 *      while the line dims; it retracts on release.
 *   2. `white` (a withTiming after release) draws the whole thing in white.
 *   3. `yellow` (a withTiming after that) draws a yellow copy that fades out at
 *      its end, leaving the white line.
 * The base line's dim is driven by `dim` (so the caller can hold it dim across the
 * reveal and lift it at the end), or straight off `progress` when omitted.
 *
 * Renders Skia nodes only — mount it inside a <Canvas>, never around one.
 */
export function ThreadsSpotlight({
  width,
  height,
  size,
  paths = [THREADS_FINAL_PATH],
  progress,
  window = 0.1,
  segmentColors,
  segmentBands = SEGMENT_BANDS,
  segmentEdge = 0.2,
  white,
  yellow,
  dim,
  minOpacity = 0.1,
  fadeBy = 0.1,
  color = "white",
  accentColor = "#FFD400",
  accentFadeFrom = 0.85,
  strokeWidth = STROKE_WIDTH,
  reverse = false,
  revealReverse,
}: ThreadsSpotlightProps) {
  const pathsKey = paths.join("|");

  // `strokeWidth` / `size` may each be a static number or a live SharedValue (a
  // slider). Normalise both to SharedValues the reactive transform + layers read.
  const swValue = useDerivedValue(() =>
    typeof strokeWidth === "number" ? strokeWidth : strokeWidth.value,
  );
  const sizeValue = useDerivedValue(() =>
    typeof size === "number" ? size+ (progress.value * 20) : size.value + (progress.value * 10),
  );

  // Parse every path, sample it into positions + normals, and lay the paths out on
  // one global timeline by cumulative arc length — so `[s, e]` is each path's share
  // of the `0 → 1` sweep, and the reveals/bead flow seamlessly from one into the next.
  const entries = useMemo(() => {
    const parsed = paths
      .map((d) => Skia.Path.MakeFromSVGString(d))
      .filter((p): p is SkPath => !!p);
    const sampled = parsed.map((p) => samplePath(p, PATH_SAMPLES));
    const total = sampled.reduce((sum, e) => sum + e.length, 0) || 1;
    let acc = 0;
    return parsed.map((p, i) => {
      const s = acc / total;
      acc += sampled[i].length;
      return { path: p, samples: sampled[i].samples, s, e: acc / total };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  // Tight bounds of the whole glyph (the union of every path) — static, so measured
  // once. The reactive transform below fits these to `size` each frame.
  const bounds = useMemo(() => {
    if (entries.length === 0) return null;
    const union = Skia.Path.Make();
    for (const en of entries) union.addPath(en.path);
    const b = union.computeTightBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, [entries]);

  // Fit the glyph to `size`, then centre it in the canvas. `translate` is applied
  // before `scale`, so screen = scale * (point + translate). Bounds are padded by half
  // the stroke so round caps don't clip. Reactive (not `useMemo`) so the size / stroke
  // sliders rescale it live on the UI thread.
  const transform = useDerivedValue(() => {
    if (!bounds) return [];
    const sw = swValue.value;
    const w = bounds.width + sw;
    const h = bounds.height + sw;
    const scale = Math.min(
      (sizeValue.value * ICON_REST_FRACTION) / w,
      (sizeValue.value * ICON_REST_FRACTION) / h,
    );
    const x = bounds.x - sw / 2;
    const y = bounds.y - sw / 2;
    return [
      { scale },
      { translateX: (width - w * scale) / 2 / scale - x },
      { translateY: (height - h * scale) / 2 / scale - y },
    ];
  });

  // Three phase inputs, each clamped (springs/timings can overshoot). Fallbacks
  // keep the hooks unconditional when an optional phase isn't supplied.
  const whiteFallback = useSharedValue(0);
  const yellowFallback = useSharedValue(0);
  const whiteSv = white ?? whiteFallback;
  const yellowSv = yellow ?? yellowFallback;
  const cp = useDerivedValue(() => clamp(progress.value, 0, 1)); // segment head
  const w = useDerivedValue(() => clamp(whiteSv.value, 0, 1)); // white draw head
  const y = useDerivedValue(() => clamp(yellowSv.value, 0, 1)); // yellow draw head

  // Base line opacity. If the caller drives `dim` (the timeline case), map it so
  // the line can stay dim across the reveal and lift at the end; otherwise dim
  // straight off the drag.
  const glyphOpacity = useDerivedValue(() => {
    const d = dim
      ? clamp(dim.value, 0, 1)
      : interpolate(cp.value, [0, fadeBy], [0, 1], Extrapolation.CLAMP);
    return interpolate(d, [0, 1], [1, minOpacity], Extrapolation.CLAMP);
  });

  // Yellow rides fully over the white as its head sweeps, then fades out over the
  // home stretch of its draw so only the white remains.
  const accentOpacity = useDerivedValue(() =>
    interpolate(y.value, [accentFadeFrom, 1], [1, 0], Extrapolation.CLAMP),
  );

  // Static bead prep, shared across the sub-paths: the colour ramp as a LUT the
  // worklet indexes, and the ribbon resolution.
  const segColors = segmentColors ?? [color];
  const segments = Math.max(segmentBands, 2); // ribbon cross-sections
  const colorLUT = useMemo(
    () =>
      Array.from({ length: COLOR_LUT_STOPS + 1 }, (_, i) =>
        sampleGradient(segColors, i / COLOR_LUT_STOPS),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segColors.join("|")],
  );

  if (entries.length === 0 || !bounds) return null;

  return (
    <Group transform={transform}>
      {entries.map((en, i) => (
        <SubPathLayer
          key={i}
          path={en.path}
          samples={en.samples}
          s={en.s}
          e={en.e}
          progress={cp}
          whiteHead={w}
          yellowHead={y}
          glyphOpacity={glyphOpacity}
          accentOpacity={accentOpacity}
          window={window}
          segmentEdge={segmentEdge}
          strokeWidth={swValue}
          segments={segments}
          colorLUT={colorLUT}
          colorLutStops={COLOR_LUT_STOPS}
          color={color}
          accentColor={accentColor}
          reverse={reverse}
          revealReverse={revealReverse}
        />
      ))}
    </Group>
  );
}

export default ThreadsSpotlight;
