/**
 * ThreadsView
 *
 * The Threads-glyph sticky header: `ThreadsSpotlight` driven by the refresh
 * lifecycle. This is the adapter layer — the spotlight stays a pure
 * presentational Skia component, and this header is the thing that speaks
 * refresh.
 *
 * FLOW (lifecycle → spotlight):
 * 1. `pulling`    → `progress` drives the gradient bead along the glyph
 * 2. `refreshing` → a self-paced ping-pong (`1 → 0 → 1`, `BEAD_LEG_MS` per
 *    leg) drives the bead: it picks up where the pull parked it and traverses
 *    the glyph back and forth, reversing direction at each tip
 * 3. `settling`   → the bead finishes its in-flight leg and folds away at the
 *    tip it was already heading for (0 or 1); only then does a dedicated
 *    `withTiming` draw the glyph in white, the accent sweep riding over it
 *    (yellow on success, red on error)
 * 4. `idle`       → the white fill *holds* until the next pull begins — the
 *    filled glyph reads as "fresh". A new pull resets it and hands the glyph
 *    back to the bead.
 *
 * KEY FEATURES:
 * - Takes no props: reads `useRefreshLifecycle()` so its identity is stable
 *   as a `ListHeaderComponent` (see `RefreshLifecycleContext` for why)
 * - Fixed height — a sticky header must never animate its height
 * - The white draw runs on its own clock (`WHITE_DRAW_MS`), deliberately
 *   longer than the settle spring, so the reveal isn't rushed; a sticky
 *   header doesn't collapse, so outliving the settle is fine
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Canvas, matchFont, Skia, useTypeface } from "@shopify/react-native-skia";
import { PressableScale } from "pressto";
import { useMemo, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useRefreshLifecycle } from "../RefreshLifecycleContext";
import ThreadsSpotlight from "../threads-example/ThreadsSpotlight";
import { buildLinesPath, getLinePaths } from "@/lib/animations/Lines";
import { NEON_COLORS } from "../constants";
import textToGlyphPaths, { splitPathContours } from "../threads-example/textGlyphPaths";
import { useParagraphBuilder } from "@/components/wabi-and-more/hooks/useParagraphBuilder";

// ============================================================================
// Constants
// ============================================================================

/** Fixed box for the sticky slot — a sticky header must never animate height. */
const HEADER_HEIGHT = 72;

/** Footprint passed to the spotlight; the glyph renders at half of this. */
const GLYPH_SIZE = 72;

/** Fixed width of each side-icon slot; the canvas takes what's left between. */
const ICON_SLOT = 56;
const ICON_SIZE = 24;

/** Length of the travelling bead, as a fraction of the whole glyph timeline. */
const SEGMENT_WINDOW = 0.3;

/** Cross-sections of the bead ribbon — higher = smoother on tight curves. */
const SEGMENT_BANDS = 48;

/**
 * One leg of the refreshing ping-pong (a full tip-to-tip traversal). The bead
 * runs on its own clock rather than the hook's `spin`, so its pace is tuned
 * here without touching the ring spinner's rotation speed.
 */
const BEAD_LEG_MS = 1400;

/**
 * The white draw's own clock. Deliberately longer than the settle spring so
 * the reveal reads as a moment rather than a flash; the accent sweep starts
 * partway through and fades out over its home stretch.
 */
const WHITE_DRAW_MS = 700;
const ACCENT_DELAY_MS = 250;
const ACCENT_DRAW_MS = 700;

/** How much of the pull dims the base line before the bead takes over. */
const DIM_BY = 0.3;

const SUCCESS_ACCENT = "#FFD400";
const ERROR_ACCENT = "#f87171";

const RAINBOW_COLORS = [
  "#3FCEBC",
  "#3CBCEB",
  "#5F96E7",
  "#816FE3",
  "#9F5EE2",
  "#BD4CE0",
  "#DE589F",
  "#FF645E",
  "#FDA859",
  "#FAEC54",
  "#9EE671",
  "#67E282",
  "#3FCEBC",
];

// ============================================================================
// Component
// ============================================================================

export default function NeonView() {
  const { width } = useWindowDimensions();
  const { progress, phase, outcome } = useRefreshLifecycle();

  // The refreshing ping-pong, on its own clock (see BEAD_LEG_MS). Starts at 1
  // because that's where the pull parks the bead — folded at the far tip.
  const beadHead = useSharedValue(1);

  // Which tip the current leg is travelling toward (0 or 1). `withRepeat`
  // doesn't expose its direction, so the inner timing's per-repetition
  // callback flips this — it's what lets the settle finish the leg in flight
  // instead of guessing.
  const beadTarget = useSharedValue(0);

  // Stage-3 heads, on their own clocks — started when settling begins, reset
  // the instant the next pull starts.
  const whiteHead = useSharedValue(0);
  const yellowHead = useSharedValue(0);

  // Which tip the reveal grows out of: the one the bead folds into. Committed
  // when settling starts (it's the final leg's destination), read live on the
  // UI thread by the spotlight's trims.
  const revealFromEnd = useSharedValue(true);

  // The accent colour is a plain string prop on the spotlight, so outcome →
  // colour hops to JS state. `outcome` is committed *before* settling starts,
  // and a one-frame lag on a colour choice is invisible.
  const [accentColor, setAccentColor] = useState(SUCCESS_ACCENT);

  useAnimatedReaction(
    () => phase.value,
    (current, previous) => {
      if (current === previous) return;
      if (current === "pulling") {
        // Hand the glyph back to the bead: kill the fill from the last refresh
        // and any still-running retreat from it.
        cancelAnimation(beadHead);
        whiteHead.value = 0;
        yellowHead.value = 0;
      } else if (current === "refreshing") {
        // Ping-pong from the far tip (where the pull parked the bead): 1 → 0,
        // then auto-reversing forever. Eased turnarounds come free from
        // withTiming's default inOut easing. The inner callback fires at the
        // end of every repetition, tracking which tip the next leg targets —
        // guarded on `finished` so a cancellation doesn't flip it.
        beadHead.value = 1;
        beadTarget.value = 0;
        beadHead.value = withRepeat(
          withTiming(0, { duration: BEAD_LEG_MS }, (finished) => {
            if (finished) beadTarget.value = 1 - beadTarget.value;
          }),
          -1,
          true,
        );
      } else if (current === "settling") {
        // Seam fix: don't snap the bead away mid-glyph. Replace the loop with
        // one last leg to the tip it was already travelling toward — duration
        // scaled by remaining distance, so its speed doesn't change — and only
        // start the white reveal once the bead has folded away there.
        cancelAnimation(beadHead);
        // The reveal grows out of the tip the bead is about to fold into.
        revealFromEnd.value = beadTarget.value === 1;
        scheduleOnRN(
          setAccentColor,
          outcome.value === "error" ? ERROR_ACCENT : SUCCESS_ACCENT,
        );
        // Ease-out only: the interrupted loop leg is at (or near) its peak
        // velocity mid-flight, and a fresh default inOut timing would ease in
        // from a standstill — a visible brake-then-continue hiccup. Out-quad
        // starts at slope 2, the inOut curve's peak, and decelerates into the
        // tip like a normal turnaround.
        beadHead.value = withTiming(
          beadTarget.value,
          {
            duration: Math.abs(beadHead.value - beadTarget.value) * BEAD_LEG_MS,
            easing: Easing.out(Easing.quad),
          },
          (finished) => {
            // A new pull cancels this leg; `finished` guards against the
            // stale callback starting a reveal the pull just reset.
            if (!finished) return;
            whiteHead.value = withTiming(1, { duration: WHITE_DRAW_MS });
            yellowHead.value = withDelay(
              ACCENT_DELAY_MS,
              withTiming(1, { duration: ACCENT_DRAW_MS }),
            );
          },
        );
      }
    },
  );

  // The bead's driver. Pulling (and the idle spring-back of a cancelled pull)
  // follow the finger via `progress`; refreshing hands it to `beadHead`, the
  // self-paced ping-pong started above — it picks up right where the pull
  // parked the bead (folded at the far tip) and traverses back and forth.
  // Settling stays on `beadHead` while it finishes its final leg, and the
  // post-refresh idle keeps reading it: the leg (and the reveal after it) can
  // outlive the settle spring, and switching drivers before it lands would
  // snap the bead. Either tip is an empty bead, so wherever it lands it's
  // gone. A cancelled pull's idle has `outcome === "none"`, so it stays on
  // `progress`.
  const spotProgress = useDerivedValue(() => {
    if (phase.value === "refreshing" || phase.value === "settling")
      return beadHead.value;
    if (phase.value === "idle" && outcome.value !== "none")
      return beadHead.value;
    return progress.value;
  });

  // Base-line dim, held explicitly rather than derived from the drag: dim on
  // the pull, pinned dim through the refresh and the reveal, and *kept* dim
  // while the white fill holds through idle — only a truly at-rest glyph
  // (no outcome, no pull) shows the base line at full strength.
  const dim = useDerivedValue(() => {
    if (phase.value === "refreshing" || phase.value === "settling") return 1;
    if (phase.value === "idle" && outcome.value !== "none") return 1;
    return interpolate(
      progress.value,
      [0, DIM_BY],
      [0, 1],
      Extrapolation.CLAMP,
    );
  });

  // Icons take a fixed slot on each side; the spotlight canvas gets the rest,
  // so the glyph stays centred in the header (and the screen — the slots are
  // symmetric) at any window width.
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return { height: HEADER_HEIGHT + progress.value * 100 }; //
  });

  const linePaths = useMemo(
    () => getLinePaths([0, 0], GLYPH_SIZE),
    [GLYPH_SIZE],
  );

  const FONT_SIZE = 220;
  const FONT_FAMILY = Platform.select({
    ios: "Helvetica",
    default: "sans-serif",
  });
  const TEXT = "علم";
  const arabicTypeface = useTypeface(
    require("../../../assets/fonts/ArefRuqaa-Regular.ttf")
  );

  const englishTypeface = useTypeface(
    require("../../../assets/fonts/LexendDeca-VariableFont_wght.ttf")
  );

  // Builds Skia paragraphs for English and Arabic text with proper alignment
  const { paragraphs: nameParagraphs, baselineOffset: nameBaselineOffset } =
    useParagraphBuilder(englishTypeface, arabicTypeface, true, width);


  // Center-x of a contour's tight bounds, for spatial ordering.
  const contourCenterX = (d: string) => {
    const p = Skia.Path.MakeFromSVGString(d);
    if (!p) return 0;
    const b = p.computeTightBounds();
    return b.x + b.width / 2;
  };

  const arabicPaths = useMemo(() => {
    if (nameParagraphs.arabic === null) return null;
    const contours = splitPathContours(nameParagraphs.arabic.getPath(0));
    // RTL: the bead sweeps `arabicPaths` in array order, so order the contours
    // rightmost-first — the neon then travels right→left across the word
    // (Arabic reading order). Font order is logical, not spatial, so sort by x.
    return [...contours].sort((a, b) => contourCenterX(b) - contourCenterX(a));
  }, [nameParagraphs.arabic]);

  // const arabicPaths = useMemo(
  //   () => {
  //     if (nameParagraphs.arabic === null) return null
  //       else return splitPathContours(nameParagraphs.arabic.getPath(0))
  //   }, []
  //   )


  // Match a system font once; the text art explodes it into one path per glyph contour.
  const font = useMemo(
    () => matchFont({ fontFamily: FONT_FAMILY, fontSize: FONT_SIZE }),
    [],
  );
  const fontPaths = useMemo(() => {
    const glyphs = textToGlyphPaths(TEXT, font);
    return glyphs;
  }, [font]);

  // const backGroundPattern = useMemo(
  //   () => getLinePaths([0, 0], GLYPH_SIZE), [GLYPH_SIZE]
  // )
  //
  // const font =

  const weirdPath = "M2.5 116V2.5H32V86H87.5V44.5H120.5V112.5H142.5V2.5H178V105H158V36.5H206V7.5H266.5V79H237.5V28.5H306V116"

  return (
    <Animated.View style={[styles.header, headerAnimatedStyle]}>
      <PressableScale style={styles.iconSlot}>
        <MaterialCommunityIcons name="menu" size={ICON_SIZE} color="#fff" />
      </PressableScale>

      <Canvas style={{ width, height: HEADER_HEIGHT }}>
        {/*<ThreadsSpotlight
          paths={fontPaths}
          strokeWidth={5} // matches your outer line width
          width={width}
          height={HEADER_HEIGHT}
          size={GLYPH_SIZE * 1.5} // tune — footprint = size × 0.5
          progress={spotProgress}
          dim={dim}
          segmentColors={NEON_COLORS}
          segmentBands={SEGMENT_BANDS}
          window={SEGMENT_WINDOW}
          white={whiteHead}
          color="#ffffff"
          accentColor={accentColor}
          revealReverse={revealFromEnd}
        />*/}

        <ThreadsSpotlight
          paths={[weirdPath]}
          strokeWidth={5} // matches your outer line width
          width={width}
          height={HEADER_HEIGHT}
          size={GLYPH_SIZE * 4} // tune — footprint = size × 0.5
          progress={spotProgress}
          dim={dim}
          segmentColors={NEON_COLORS}
          segmentBands={SEGMENT_BANDS}
          window={SEGMENT_WINDOW}
          white={whiteHead}
          color="#ffffff"
          accentColor={accentColor}
          revealReverse={revealFromEnd}
          reverse={false}
        />


      </Canvas>

      <PressableScale style={styles.iconSlot}>
        <MaterialCommunityIcons name="magnify" size={ICON_SIZE} color="#fff" />
      </PressableScale>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  header: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // Fixed height is non-negotiable for a sticky header: the icon slots'
    // `height: "100%"` needs a bounded box (without it the sticky cell
    // stretches to the viewport), and animating a sticky height would move
    // the list's sticky offset every frame. To react to the pull, animate the
    // header's *contents*, never this box.
    // height: HEADER_HEIGHT,

    paddingHorizontal: 5,
    // Opaque on purpose: a sticky header has rows scrolling underneath it.
    backgroundColor: "black",
    // Separators never render after the header, so it supplies its own gap.
    marginBottom: 10,
  },
  iconSlot: {
    width: ICON_SLOT,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
