/**
 * LiquidBubblesMulti — five glass bubbles floating over live content.
 * Design notes: README.md → "LiquidBubblesMulti.tsx".
 *
 * FLOW:
 *   onLayout → size → MultiBubbleScene (physics needs the real bounds)
 *   useMultiBubblePhysics → one flat buffer (12 floats per bubble)
 *   draw: live background → BaselineBubble × BUBBLE_COUNT → spawn box
 *
 * KEY FEATURES:
 * - Phase 2: every bubble is today's single-bubble pass (the stress
 *   baseline). Phase 3 swaps them for one looping pass.
 * - Built-in cosine film only (no soap-film overlay pass).
 * - One look for every bubble; wobble/inertia/strength vary per bubble
 *   through its random traits.
 * - Top-right toggle: float on/off. FPS readout top-left.
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
  Paragraph,
  Skia,
  TextAlign,
  useFonts,
  Path,
} from "@shopify/react-native-skia";
import { PressableScale } from "pressto";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import {
  interpolate,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";

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
import { useMultiBubblePhysics } from "./hooks/useMultiBubblePhysics";
import {
  BUBBLE_COUNT,
  TEXT_BASE_SIZE,
  TEXT_BUBBLE_GAP,
  TEXT_BUBBLE_SIZE_DEFAULT,
  TEXT_BUBBLE_X_DEFAULT,
  TEXT_BUBBLE_Y_DEFAULT,
  TEXT_SIZE_DEFAULT,
  TEXT_Y_DEFAULT,
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

/** Floating bubbles on/off. Off = only the bubble pinned over the text. */
const SHOW_FLOATERS = false;

/** Floating bubbles actually run. */
const FLOATER_COUNT = SHOW_FLOATERS ? BUBBLE_COUNT : 0;

/** Slot indices, built once. */
const SLOTS = Array.from({ length: FLOATER_COUNT }, (_, i) => i);

const TEXT = "Good ";
const NAME_TEXT = ["Mohamed", "Jack", "Lily", "Marco"];

/** Slot of the bubble pinned over the text: right after the floaters. */
const TEXT_BUBBLE_SLOT = FLOATER_COUNT;

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
  // Bubble radius: the Bubble panel's Shape → Size slider.
  const bubbleSize = useSharedValue(TEXT_BUBBLE_SIZE_DEFAULT);

  // ==========================================================================
  // Greeting text (before the physics: the bubble is placed off its height)
  // ==========================================================================

  const name = NAME_TEXT[0];

  const fontMgr = useFonts({
    Lexend: [require("../../assets/fonts/LexendDeca-VariableFont_wght.ttf")],
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
        fontFamilies: ["Lexend"],
        fontSize: TEXT_BASE_SIZE,
        color: Skia.Color("#000000"),
      })
      .addText(`${greeting}\n${name}`)
      .pop()
      .build();
    p.layout(width);
    return p;
  }, [fontMgr, name, width]);

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
    () => textControls.underlineWidth.value ,
  );

  // The pinned bubble rests ABOVE the paragraph: its rim sits
  // TEXT_BUBBLE_GAP over the text's top edge, which moves with the text's
  // Vertical and Size and with the bubble's own radius. Bubble X / Y are
  // offsets from there.
  const pinnedX = useDerivedValue(
    () => width / 2 + textControls.bubbleX.value,
  );
  const pinnedY = useDerivedValue(() => {
    const scale = textControls.size.value / TEXT_BASE_SIZE;
    const textTop = height / 2 + textControls.y.value - (paragraphH * scale) / 2;
    return (
      textTop - TEXT_BUBBLE_GAP - bubbleSize.value + textControls.bubbleY.value
    );
  });
  const pinnedR = useDerivedValue(() => bubbleSize.value);

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
    pinnedX,
    pinnedY,
    pinnedR,
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

  const time = useClock();
  const backgroundUniforms = useDerivedValue(() => ({
    iResolution: [width, height],
    iTime: time.value,
    iBand: [BG_SCROLL_RATE, BG_BAND_DIR_X, BG_BAND_DIR_Y, BG_GRID_DENSITY],
    iGrid: [BG_GRID_DRIFT, BG_GRID_WIDTH, BG_GRID_STRENGTH, 0],
  }));

  // const bg_path = require("../../../assets/liquid-glass-bubble/focus_bg.jpg");

  // // const imagePath1 = require("../../../assets/images/pedra.jpg");
  // const image = useImage(bg_path);

  return (
    <>
      <Canvas style={{ width, height }}>
        {/* ---- Backdrop: drawn first so the bubbles can refract it ---- */}
        {/* Base fill under the background image. */}
        <Fill color="#ffffff" />

        {/* Greeting: centered paragraph, name on line 2, underlined. Part
            of the backdrop, so the bubble refracts it. */}
        <Group transform={textTransform}>
          <Paragraph
            paragraph={paragraph}
            x={paragraphX}
            y={paragraphY}
            width={width}
          />
          {/* Squiggle under the name, in place of a straight rule. */}
          <Group transform={squiggleTransform}>
            <Path
              path={SQWIGGLE}
              color="lightblue"
              style="stroke"
              strokeJoin="round"

              strokeWidth={squiggleStroke}
            />
          </Group>
        </Group>

        {/* Background image, centered, 2× screen width. */}
        {/*{image && (
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
        )}*/}

        {/* ---- Bubbles: one backdrop pass each (phase 2 baseline) ---- */}
        {SLOTS.map((i) => (
          <BaselineBubble
            key={i}
            index={i}
            paramBuffer={paramBuffer}
            uniforms={uniforms}
            optics={optics}
          />
        ))}

        {/* ---- Bubble pinned over the text: drawn last, so on top ---- */}
        <BaselineBubble
          index={TEXT_BUBBLE_SLOT}
          paramBuffer={paramBuffer}
          uniforms={uniforms}
          optics={optics}
        />
      </Canvas>

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
          sizeDefault={TEXT_BUBBLE_SIZE_DEFAULT}
          sizeMin={0}
          sizeMax={240}
          optics={optics}
          defaults={defaults}
          refractMax={LIVE_REFRACT_SLIDER_MAX}
          initialTab="shape"
        />
      )}

      <View style={styles.toggles}>
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
