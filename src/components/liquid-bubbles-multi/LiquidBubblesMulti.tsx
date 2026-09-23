/**
 * LiquidBubblesMulti — a trigger bubble that, tapped, blooms the greeting
 * into four labelled bubbles. Design notes: README.md → "LiquidBubblesMulti.tsx".
 *
 * FLOW:
 *   onLayout → size → MultiBubbleScene (physics needs the real bounds)
 *   fontMgr ready → intro.reset() arms rest state (progress → 0)
 *   tap the trigger (GestureDetector + Gesture.Tap, hit-test in a worklet)
 *     → scheduleOnRN(intro.play), which runs `progress` 0 → 1
 *   useIntroTimeline → one `progress` value + textOpacity + four pinned
 *     bubbles + the trigger bubble, every one a pure function of progress
 *   useMultiBubblePhysics → one flat buffer (12 floats per bubble)
 *   draw: background image → greeting (× intro.textOpacity) → labels
 *     → trigger → BaselineBubble × 4
 *
 * KEY FEATURES:
 * - No autoplay: the screen sits at rest — full-size greeting, a small "Go"
 *   trigger bubble centred under it. Tapping the trigger runs the intro: the
 *   trigger swells while drifting up to the text centre, the greeting fades
 *   out once it reaches full size, the trigger collapses into that point, and
 *   four bubbles of slightly different sizes are born there and wobble out to
 *   the corners of a tilted quad, drifting there for good.
 * - Each bubble (the trigger included) carries its own label — an icon over a
 *   line of text — drawn BEFORE the glass, so the bubble refracts its own
 *   contents. "Reset" collapses back to the rest state instead of re-running
 *   the intro from a play.
 * - `IntroScrubBar` (`SHOW_SCRUB_BAR`) drags `intro.progress` by hand — see
 *   useIntroTimeline.ts's header for why the whole intro is a pure function
 *   of one scrubbable value.
 * - Phase 2: every bubble is today's single-bubble pass (the stress
 *   baseline) — five of them now, ~15 pass breaks. Phase 3 swaps them for
 *   one looping pass.
 * - Built-in cosine film only (no soap-film overlay pass).
 * - Top-right panels: Text and Bubble. FPS readout top-left.
 */

import {
  Canvas,
  Fill,
  Rect,
  Shader,
  rect,
  useImage,
  Image,
  Group,
  Paint,
  Paragraph,
  RoundedRect,
  Skia,
  TextAlign,
  useFonts,
  Path,
} from "@shopify/react-native-skia";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { PressableScale } from "pressto";
import React, { useEffect, useMemo, useState } from "react";
import {
  PixelRatio,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import {
  interpolate,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { FpsOverlay } from "@/components/common/FpsOverlay";
import { backgroundEffect } from "@/components/liquid-bubble-live/backgroundShaders";
import {
  FLOAT_BUOYANCY_LEVER_DEFAULT,
  FLOAT_ON_DEFAULT,
  INERTIA_DEFAULT,
  STRENGTH_DEFAULT,
  WOBBLE_DEFAULT,
} from "@/components/liquid-bubble-live/bubbleModes";
import { BubbleTuningPanel } from "@/components/liquid-bubble-live/BubbleTuningPanel";
import { useBubbleOptics } from "@/components/liquid-bubble-live/hooks/useBubbleOptics";
import { useClock } from "@/components/liquid-bubble-live/hooks/useClock";
import {
  BG_BAND_DIR_X,
  BG_BAND_DIR_Y,
  BG_GRID_DENSITY,
  BG_GRID_DRIFT,
  BG_GRID_STRENGTH,
  BG_GRID_WIDTH,
  BG_SCROLL_RATE,
  LIVE_REFRACT,
} from "@/components/liquid-bubble-live/liveConfig";

import { BaselineBubble } from "./BaselineBubble";
import { BubbleLabel } from "./BubbleLabel";
import { useIntroTimeline } from "./hooks/useIntroTimeline";
import { IntroScrubBar } from "./IntroScrubBar";
import { useMultiBubblePhysics } from "./hooks/useMultiBubblePhysics";
import {
  BUBBLE_COUNT,
  INTRO_BASE_RADIUS,
  INTRO_COUNT,
  INTRO_LABELS,
  INTRO_LABEL_SIZE,
  INTRO_LABEL_WIDTH_MUL,
  INTRO_RADIUS_MUL,
  NAME_HIGHLIGHT_COLOR,
  NAME_HIGHLIGHT_PAD_X,
  NAME_HIGHLIGHT_PAD_Y,
  NAME_HIGHLIGHT_RADIUS,
  TEXT_BASE_SIZE,
  TEXT_BUBBLE_X_DEFAULT,
  TEXT_BUBBLE_Y_DEFAULT,
  TEXT_SIZE_DEFAULT,
  TEXT_Y_DEFAULT,
  TRIGGER_GAP,
  TRIGGER_LABEL,
  TRIGGER_LABEL_SIZE,
  TRIGGER_LABEL_WIDTH_MUL,
  TRIGGER_RADIUS,
  UNDERLINE_GAP_DEFAULT,
  UNDERLINE_WIDTH_DEFAULT,
} from "./multiBubbleConfig";
import { TextTuningPanel, type TextControls } from "./TextTuningPanel";

// ============================================================================
// Config
// ============================================================================

/** Spawn area size, pt (no box is drawn). Bubbles inflate out of its top edge. */
const BOX_SIZE = 120;

/** Gap between the spawn area and the bottom edge, pt. */
const BOX_BOTTOM_OFFSET = 40;

/** Upper bound of the Bubble panel's Refract slider, pt (same as the single bubble). */
const LIVE_REFRACT_SLIDER_MAX = 40;

/** Tint hue, rgb 0..1 (same as the single bubble). */
const BUBBLE_TINT: [number, number, number] = [0.85, 0.93, 1.0];

/**
 * Render the bubbles' backdrop at device resolution instead of at logical
 * points. Skia can't apply the canvas matrix to a `RuntimeShader` image
 * filter, so it factors the scale out and snapshots the backdrop at 1 texel
 * per local unit — at logical size, every texel is then blown up `pd`× and
 * the text seen through the glass looks pixelated.
 *
 * The fix is to make one local unit = one device pixel: draw everything
 * inside a `1 / pd` group (so the bubbles' local space is device pixels) and
 * put the backdrop content back in points with a matching `pd` group.
 *
 * It costs `pd²` (≈ 9×) the texels per pass, so it is a flag: set it false
 * to compare FPS.
 */
const CRISP_BUBBLES = true;

/** Local units per point inside the canvas. 1 = the old, logical-res look. */
const PD = CRISP_BUBBLES ? PixelRatio.get() : 1;

/** Outer group: puts the canvas in device pixels for the bubble passes. */
const DPR_DOWN = [{ scale: 1 / PD }];

/** Inner group: backdrop content stays authored in logical points. */
const DPR_UP = [{ scale: PD }];

/** Floating bubbles on/off. Off = only the bubble pinned over the text. */
const SHOW_FLOATERS = false;

/** The intro's hand-scrub bar. Off for an FPS run — it costs a gesture + a few derived reads. */
const SHOW_SCRUB_BAR = true;

/** Floating bubbles actually run. */
const FLOATER_COUNT = SHOW_FLOATERS ? BUBBLE_COUNT : 0;

/** Slot indices, built once. */
const SLOTS = Array.from({ length: FLOATER_COUNT }, (_, i) => i);

/** Intro bubble slots: right after the floaters. */
const INTRO_SLOTS = Array.from(
  { length: INTRO_COUNT },
  (_, i) => FLOATER_COUNT + i,
);

/** The trigger bubble's slot: right after the four intro bubbles. */
const TRIGGER_SLOT = FLOATER_COUNT + INTRO_COUNT;

/** Tap slop on the trigger bubble, as a × of its radius — comfortable to hit. */
const TRIGGER_TAP_SLOP = 1.25;

const TEXT = "Good ";
const NAME_TEXT = ["Mohamed", "Jack", "Lily", "Marco"];

/** Hand-drawn squiggle used as the rule under the name. */
const SQWIGGLE =
  "M1.5 20.4978C12.5 20.4978 10.1182 1.42341 16.4164 1.50038C22.6549 1.57662 24.9291 20.2673 31.1671 20.4978C37.4169 20.7288 39.8333 2.52727 46.0836 2.52727C52.3338 2.52727 54.7498 20.4978 61 20.4978C67.2502 20.4978 69.6662 2.52727 75.9164 2.52727C82.1667 2.52727 84.5827 20.4978 90.8329 20.4978C97.0831 20.4978 100.75 2.45389 107 2.52727C113.19 2.59994 114.5 20.4978 120.5 20.4978";

/** The squiggle's own size, pt: it is scaled from this to the name's width. */
const SQWIGGLE_W = 122;

// ============================================================================
// Types
// ============================================================================

export type LiquidBubblesMultiProps = {
  /** Mean birth radius, points — each bubble is `× BIRTH_RADIUS_RANGE`. */
  restRadius?: number;
};

type Panel = "none" | "text" | "bubble";

type SceneProps = {
  width: number;
  height: number;
  restRadius: number;
};

// ============================================================================
// Component
// ============================================================================

export function LiquidBubblesMulti({
  restRadius = 50,
}: LiquidBubblesMultiProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) {
      setSize({ width, height });
    }
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {size && (
        // Keyed by size: the physics captures the bounds, so a new size
        // remounts it with the new walls and spawn point.
        <MultiBubbleScene
          key={`${size.width}x${size.height}`}
          width={size.width}
          height={size.height}
          restRadius={restRadius}
        />
      )}
    </View>
  );
}

function MultiBubbleScene({ width, height, restRadius }: SceneProps) {
  // ==========================================================================
  // Levers (slider bases; each bubble multiplies them by its traits)
  // ==========================================================================

  const [floatOn, setFloatOn] = useState(FLOAT_ON_DEFAULT);
  const floatOnValue = useSharedValue(FLOAT_ON_DEFAULT ? 1 : 0);
  const toggleFloat = () => {
    const next = !floatOn;
    setFloatOn(next);
    floatOnValue.value = next ? 1 : 0;
  };
  const buoyancy = useSharedValue(FLOAT_BUOYANCY_LEVER_DEFAULT);
  const wobble = useSharedValue(WOBBLE_DEFAULT);
  const inertia = useSharedValue(INERTIA_DEFAULT);
  const strength = useSharedValue(STRENGTH_DEFAULT);
  const isDay = useSharedValue(true);

  // One panel open at a time (React state — changes only on tap).
  const [panel, setPanel] = useState<Panel>("none");
  const togglePanel = (next: Panel) =>
    setPanel((current) => (current === next ? "none" : next));

  const greeting = TEXT + (isDay.value ? "Morning" : "Night");
  // Text panel levers (UI thread; no re-render while dragging).
  const textControls: TextControls = {
    size: useSharedValue(TEXT_SIZE_DEFAULT),
    y: useSharedValue(TEXT_Y_DEFAULT),
    underlineWidth: useSharedValue(UNDERLINE_WIDTH_DEFAULT),
    underlineGap: useSharedValue(UNDERLINE_GAP_DEFAULT),
    bubbleX: useSharedValue(TEXT_BUBBLE_X_DEFAULT),
    bubbleY: useSharedValue(TEXT_BUBBLE_Y_DEFAULT),
  };
  // Mean bubble radius: the Bubble panel's Shape → Size slider. Each intro
  // bubble multiplies it by its own `INTRO_RADIUS_MUL`.
  const bubbleSize = useSharedValue(INTRO_BASE_RADIUS);

  // ==========================================================================
  // Greeting text (before the physics: the bubble is placed off its height)
  // ==========================================================================

  const name = NAME_TEXT[0];

  const fontMgr = useFonts({
    Boldonse: [require("../../assets/fonts/Boldonse-Regular.ttf")],
    Lexend: [require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf")],
    PTSerif: [
      require("../../assets/fonts/PTSerif-Regular.ttf"),
      require("../../assets/fonts/PTSerif-Bold.ttf"),
    ],
  });

  // "Good Morning" / name on two lines, center-aligned, laid out once at
  // TEXT_BASE_SIZE across the screen width. The Size slider scales the whole
  // group, so dragging never rebuilds the paragraph or re-renders.
  const paragraph = useMemo(() => {
    if (!fontMgr) {
      return null;
    }


    const p = Skia.ParagraphBuilder.Make(
      { textAlign: TextAlign.Center },
      fontMgr,
    )
      .pushStyle({
        fontFamilies: ["PTSerif"],
        fontStyle: { weight: 200 },
        fontSize: TEXT_BASE_SIZE,
        letterSpacing: 0.1,
        color: Skia.Color("#242424"),
      })
      .addText(`${greeting}\n`)
      .pop()
      .pushStyle({
        fontFamilies: ["PTSerif"],
        fontStyle: { weight: 200 },
        fontSize: TEXT_BASE_SIZE,
        letterSpacing: 0.1,
        color: Skia.Color("#1c4b62"),//#e8a519
      })
      .addText(name)
      .pop()
      .build();
    p.layout(width);
    return p;
  }, [fontMgr, name, width]);

  // One paragraph per bubble label, laid out at that bubble's rest size.
  // `BubbleLabel` only scales the result, so a bubble's text never re-measures.
  const labels = useMemo(() => {
    if (!fontMgr) {
      return [];
    }
    return INTRO_LABELS.slice(0, INTRO_COUNT).map((text, i) => {
      const rest = INTRO_BASE_RADIUS * INTRO_RADIUS_MUL[i];
      const labelWidth = rest * INTRO_LABEL_WIDTH_MUL;
      const p = Skia.ParagraphBuilder.Make(
        { textAlign: TextAlign.Center },
        fontMgr,
      )
        .pushStyle({
          fontFamilies: ["PTSerif"],
          fontSize: INTRO_LABEL_SIZE,
          color: Skia.Color("#0f1725"),
        })
        .addText(text)
        .pop()
        .build();
      p.layout(labelWidth);
      return { paragraph: p, width: labelWidth, height: p.getHeight(), rest };
    });
  }, [fontMgr]);

  // The trigger bubble's own label, laid out the same way as the four.
  const triggerLabel = useMemo(() => {
    if (!fontMgr) {
      return null;
    }
    const labelWidth = TRIGGER_RADIUS * TRIGGER_LABEL_WIDTH_MUL;
    const p = Skia.ParagraphBuilder.Make(
      { textAlign: TextAlign.Center },
      fontMgr,
    )
      .pushStyle({
        fontStyle: {weight: 600},
        fontFamilies: ["PTSerif"],
        fontSize: TRIGGER_LABEL_SIZE,
        color: Skia.Color("#0f1725"),
      })
      .addText(TRIGGER_LABEL)
      .pop()
      .build();
    p.layout(labelWidth);
    return { paragraph: p, width: labelWidth, height: p.getHeight() };
  }, [fontMgr]);

  // Paragraph drawn centered on (0, 0); the group moves it to the screen
  // center. The underline sits under line 2 (the name), from its measured
  // left edge and width, `gap` below its baseline.
  const paragraphH = paragraph ? paragraph.getHeight() : 0;
  const paragraphX = -width / 2;
  const paragraphY = -paragraphH / 2;
  const nameLine = paragraph?.getLineMetrics()[1];
  const underlineX = paragraphX + (nameLine?.left ?? 0);
  const underlineBaseline = paragraphY + (nameLine?.baseline ?? 0);
  const underlineW = nameLine?.width ?? 0;

  const nameAscent = nameLine?.ascent ?? 0;
  const nameDescent = nameLine?.descent ?? 0;

  // ==========================================================================
  // Intro timeline (text collapse → four bubbles out to the corners)
  // ==========================================================================

  const time = useClock();

  // Trigger bubble: horizontally centred, `TRIGGER_GAP` under the paragraph's
  // bottom edge. Derived, so dragging the Text panel's Size or Vertical slider
  // carries it along without ever re-rendering. The paragraph's half-height is
  // scaled by the same factor the text group uses — the bubble is drawn
  // OUTSIDE that group, so it doesn't inherit the scale; the gap and the
  // radius are left unscaled, so the bubble keeps its own size and spacing.
  const triggerX = useSharedValue(width / 2);
  const triggerY = useDerivedValue(() => {
    const s = textControls.size.value / TEXT_BASE_SIZE;
    return (
      height / 2 +
      textControls.y.value +
      (paragraphH / 2) * s +
      TRIGGER_GAP +
      TRIGGER_RADIUS
    );
  });

  const intro = useIntroTimeline({
    centerX: width / 2,
    centerY: height / 2 + TEXT_Y_DEFAULT,
    radius: bubbleSize,
    time,
    offsetX: textControls.bubbleX,
    offsetY: textControls.bubbleY,
    triggerX,
    triggerY,
    triggerRadius: TRIGGER_RADIUS,
  });

  // Rest state once the font is in, so the greeting is never drawn unstyled:
  // full-size text, four bubbles gone, the trigger inflated in. Also what
  // "Reset" runs — one code path for first paint and for the button.
  const { reset } = intro;
  useEffect(() => {
    if (fontMgr) {
      reset();
    }
  }, [fontMgr, reset]);

  // Tap the trigger bubble to run the intro. Coordinates are both in points
  // (the canvas view isn't scaled — the DPR sandwich is internal to it), so
  // no pixelDensity conversion is needed here.
  const { play } = intro;
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((e, success) => {
        // `success` is false for a cancelled tap (the finger slid off), same
        // check the liquid-metal demo's tap makes.
        if (!success) {
          return;
        }
        const dx = e.x - intro.trigger.x.value;
        const dy = e.y - intro.trigger.y.value;
        const r = intro.trigger.r.value;
        if (r <= 0) {
          return;
        }
        const slop = r * TRIGGER_TAP_SLOP;
        if (dx * dx + dy * dy <= slop * slop) {
          scheduleOnRN(play);
        }
      }),
    // The intro's shared values are stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [play],
  );

  // The greeting no longer scales as part of the intro — only the Text
  // panel's Size slider scales it. The intro instead fades it out via
  // `intro.textOpacity` (see the Group below), driven by the trigger's swell.
  const textTransform = useDerivedValue(() => [
    { translateX: width / 2 },
    { translateY: height / 2 + textControls.y.value },
    { scale: textControls.size.value / TEXT_BASE_SIZE },
  ]);

  // The squiggle is authored at SQWIGGLE_W × SQWIGGLE_H from its own origin,
  // so it is scaled to the name's width and moved under it. Uniform scale —
  // scaling y alone would flatten the waves.
  const squiggleScale = underlineW > 0 ? underlineW / SQWIGGLE_W : 1;
  const squiggleTransform = useDerivedValue(() => [
    { translateX: underlineX },
    { translateY: underlineBaseline + textControls.underlineGap.value },
    { scale: squiggleScale },
  ]);
  // Undo the scale so Underline width stays the stroke's real thickness.
  const squiggleStroke = useDerivedValue(
    () => textControls.underlineWidth.value,
  );

  // ==========================================================================
  // Physics
  // ==========================================================================

  const spawnX = width / 2;
  const spawnY = height - (BOX_SIZE + BOX_BOTTOM_OFFSET);

  const { paramBuffer } = useMultiBubblePhysics({
    count: FLOATER_COUNT,
    width,
    height,
    spawnX,
    spawnY,
    restRadius,
    enabled: floatOnValue,
    buoyancy,
    wobble,
    inertia,
    strength,
    pinned: [...intro.bubbles, intro.trigger],
  });

  // One look for all; each BaselineBubble swaps in its own iParams.
  const { optics, defaults, uniforms } = useBubbleOptics({
    paramBuffer,
    tintColor: BUBBLE_TINT,
    refract: LIVE_REFRACT,
  });

  // ==========================================================================
  // Live background
  // ==========================================================================

  const backgroundUniforms = useDerivedValue(() => ({
    iResolution: [width, height],
    iTime: time.value,
    iBand: [BG_SCROLL_RATE, BG_BAND_DIR_X, BG_BAND_DIR_Y, BG_GRID_DENSITY],
    iGrid: [BG_GRID_DRIFT, BG_GRID_WIDTH, BG_GRID_STRENGTH, 0],
  }));

  const bg_path = require("../../../assets/liquid-glass-bubble/15_bg.jpg");

  // const imagePath1 = require("../../../assets/images/pedra.jpg");
  const image = useImage(bg_path);

  return (
    <>
      {/* The tap that starts the intro: the trigger bubble is a Skia circle,
          so the hit test happens in the gesture's own worklet. */}
      <GestureDetector gesture={tapGesture}>
        <Canvas style={{ width, height }}>
          {/* Everything lives under DPR_DOWN, so one local unit inside it is
              one device pixel: that is the space the bubbles' image filter
              runs in, and it is what makes the backdrop snapshot — and the
              text refracted through it — full resolution. See CRISP_BUBBLES. */}
          <Group transform={DPR_DOWN}>
            {/* DPR_UP puts the backdrop back in logical points, so everything
                inside it is authored in pt exactly as before. */}
            <Group transform={DPR_UP}>
              {/* ---- Backdrop: drawn first so the bubbles refract it ---- */}
              {/* Base fill under the background image. */}
              {/*<Fill color="#ffffff" />*/}

              {/* Background image, centered, 2× screen width. */}
              {image && (
                <Image
                  image={image}
                  fit="cover"
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  opacity={1}
                  blendMode="plus"
                />
              )}

              {/* Greeting: centered paragraph, name on line 2, underlined.
                  Part of the backdrop, so the bubble refracts it. Opacity is
                  the intro's textOpacity — a function of how far the trigger
                  has swollen, not of time (see useIntroTimeline.ts).

                  The fade MUST be a `layer`, not a plain `opacity` prop: a
                  Group's opacity is applied to the paint its children
                  inherit, and the renderer draws a Paragraph with
                  `paragraph.paint(canvas, x, y)` using the text's OWN baked
                  paint — so the inherited alpha never reaches it. With
                  `opacity` the squiggle (a Path, which does use the paint)
                  faded while the text stayed solid. A layer composites the
                  whole group through one alpha instead, which catches both.
                  It costs a saveLayer over the greeting's bounds per frame. */}
              <Group
                transform={textTransform}
                layer={<Paint opacity={intro.textOpacity} />}
              >
                <Paragraph
                  paragraph={paragraph}
                  x={paragraphX}
                  y={paragraphY}
                  width={width}
                />
              </Group>

              {/* Bubble labels: part of the backdrop too, so each bubble
                  refracts its own text. */}
              {labels.map((label, i) => (
                <BubbleLabel
                  key={i}
                  bubble={intro.bubbles[i]}
                  paragraph={label.paragraph}
                  width={label.width}
                  height={label.height}
                  restRadius={label.rest}
                />
              ))}

              {/* Trigger bubble's label, same treatment as the other four. */}
              {triggerLabel && (
                <BubbleLabel
                  bubble={intro.trigger}
                  paragraph={triggerLabel.paragraph}
                  width={triggerLabel.width}
                  height={triggerLabel.height}
                  restRadius={TRIGGER_RADIUS}
                />
              )}
            </Group>

            {/* ---- Bubbles: one backdrop pass each (phase 2 baseline). They
                sit OUTSIDE DPR_UP, so their filter space is device pixels;
                BaselineBubble scales its point uniforms by the same PD. ---- */}
            {SLOTS.map((i) => (
              <BaselineBubble
                key={i}
                index={i}
                paramBuffer={paramBuffer}
                uniforms={uniforms}
                optics={optics}
                pixelDensity={PD}
              />
            ))}

            {/* ---- The four intro bubbles, drawn last so they are on top ---- */}
            {INTRO_SLOTS.map((slot) => (
              <BaselineBubble
                key={slot}
                index={slot}
                paramBuffer={paramBuffer}
                uniforms={uniforms}
                optics={optics}
                pixelDensity={PD}
              />
            ))}

            {/* ---- The trigger bubble, on top of everything else ---- */}
            <BaselineBubble
              index={TRIGGER_SLOT}
              paramBuffer={paramBuffer}
              uniforms={uniforms}
              optics={optics}
              pixelDensity={PD}
            />
          </Group>
        </Canvas>
      </GestureDetector>

      <FpsOverlay dark />

      {panel === "text" && (
        <TextTuningPanel
          controls={textControls}
          width={width}
          height={height}
        />
      )}

      {/* The bubble's own levers: Shape (size, wobble, inertia, strength),
          Refraction, Surface, Rim. No float / soap-film toggles here. */}
      {panel === "bubble" && (
        <BubbleTuningPanel
          wobble={wobble}
          wobbleDefault={WOBBLE_DEFAULT}
          inertia={inertia}
          inertiaDefault={INERTIA_DEFAULT}
          strength={strength}
          strengthDefault={STRENGTH_DEFAULT}
          size={bubbleSize}
          sizeDefault={INTRO_BASE_RADIUS}
          sizeMin={0}
          sizeMax={240}
          optics={optics}
          defaults={defaults}
          refractMax={LIVE_REFRACT_SLIDER_MAX}
          initialTab="shape"
        />
      )}

      <View style={styles.toggles}>
        <PressableScale style={styles.toggle} onPress={intro.reset}>
          <Text style={styles.toggleText}>Reset</Text>
        </PressableScale>
        <PressableScale
          style={[styles.toggle, panel === "text" && styles.toggleActive]}
          onPress={() => togglePanel("text")}
        >
          <Text
            style={[
              styles.toggleText,
              panel === "text" && styles.toggleTextActive,
            ]}
          >
            Text
          </Text>
        </PressableScale>
        <PressableScale
          style={[styles.toggle, panel === "bubble" && styles.toggleActive]}
          onPress={() => togglePanel("bubble")}
        >
          <Text
            style={[
              styles.toggleText,
              panel === "bubble" && styles.toggleTextActive,
            ]}
          >
            Bubble
          </Text>
        </PressableScale>
        {SHOW_FLOATERS && (
          <PressableScale style={styles.toggle} onPress={toggleFloat}>
            <Text style={styles.toggleText}>
              {floatOn ? "Float: On" : "Float: Off"}
            </Text>
          </PressableScale>
        )}
      </View>

      {SHOW_SCRUB_BAR && (
        <IntroScrubBar progress={intro.progress} play={intro.play} />
      )}
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  toggles: {
    position: "absolute",
    top: 12,
    right: 16,
    flexDirection: "row",
    gap: 8,
  },
  toggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#1a1a1a",
  },
  toggleActive: {
    backgroundColor: "#fff",
  },
  toggleText: {
    color: "#fff",
    fontWeight: "600",
  },
  toggleTextActive: {
    color: "#1a1a1a",
  },
});
