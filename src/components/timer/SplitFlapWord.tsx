import { Group, Text } from "@shopify/react-native-skia";
import type { SkFont } from "@shopify/react-native-skia";
import { useMemo } from "react";
import type { SharedValue } from "react-native-reanimated";
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import FlipChar from "./FlipChar";

const DISPLAY_DURATION_MS = 2000;
const FLIP_DURATION_MS = 500;

type SplitFlapWordProps = {
  words: string[];
  prefix: string;
  suffix: string;
  font: SkFont;
  fontSize: number;
  baselineY: SharedValue<number>;
  canvasWidth: number;
  color: string;
  run: SharedValue<boolean>;
};

export default function SplitFlapWord({
  words,
  prefix,
  suffix,
  font,
  fontSize,
  baselineY,
  canvasWidth,
  color,
  run,
}: SplitFlapWordProps) {
  // ── Static layout measurements ──────────────────────────────────────
  const layout = useMemo(() => {
    const prefixWidth = font.measureText(prefix).width;
    const suffixWidth = font.measureText(suffix).width;

    // Measure each word, take max width so prefix/suffix never shift
    const wordWidths = words.map((w) => font.measureText(w).width);
    const maxWordWidth = Math.max(...wordWidths);

    const totalWidth = prefixWidth + maxWordWidth + suffixWidth;
    const startX = canvasWidth / 2 - totalWidth / 2;
    const prefixX = startX;
    const wordSlotX = startX + prefixWidth;
    const suffixX = wordSlotX + maxWordWidth;

    // Use getGlyphWidths for proper advance widths (respects kerning/spacing)
    const charPositions = words.map((word) => {
      const glyphIds = font.getGlyphIDs(word);
      const advances = font.getGlyphWidths(glyphIds);
      const wWidth = advances.reduce((sum, w) => sum + w, 0);
      const wordOffsetX = wordSlotX + (maxWordWidth - wWidth) / 2;
      const positions: number[] = [];
      let cumX = wordOffsetX;
      for (let i = 0; i < advances.length; i++) {
        positions.push(cumX);
        cumX += advances[i];
      }
      return positions;
    });

    // Character advance widths per word (for origin pivots)
    const charWidths = words.map((word) => {
      const glyphIds = font.getGlyphIDs(word);
      return font.getGlyphWidths(glyphIds);
    });

    return { prefixX, suffixX, charPositions, charWidths, maxWordWidth };
  }, [font, words, prefix, suffix, canvasWidth]);

  // ── Animation state ─────────────────────────────────────────────────
  const wordIndex = useSharedValue(0);
  const flipProgress = useSharedValue(0);
  const cycleCounter = useSharedValue(0);

  // Per-character derived values for current & next word
  const wordCount = words.length;
  const charCount = words[0].length;

  const currentWord = useDerivedValue(
    () => words[wordIndex.value % wordCount]
  );
  const nextWord = useDerivedValue(
    () => words[(wordIndex.value + 1) % wordCount]
  );

  // Individual character shared values (max 5 chars)
  const currentChar0 = useDerivedValue(() => currentWord.value[0] ?? "");
  const currentChar1 = useDerivedValue(() => currentWord.value[1] ?? "");
  const currentChar2 = useDerivedValue(() => currentWord.value[2] ?? "");
  const currentChar3 = useDerivedValue(() => currentWord.value[3] ?? "");
  const currentChar4 = useDerivedValue(() => currentWord.value[4] ?? "");

  const nextChar0 = useDerivedValue(() => nextWord.value[0] ?? "");
  const nextChar1 = useDerivedValue(() => nextWord.value[1] ?? "");
  const nextChar2 = useDerivedValue(() => nextWord.value[2] ?? "");
  const nextChar3 = useDerivedValue(() => nextWord.value[3] ?? "");
  const nextChar4 = useDerivedValue(() => nextWord.value[4] ?? "");

  const currentChars = [
    currentChar0,
    currentChar1,
    currentChar2,
    currentChar3,
    currentChar4,
  ];
  const nextChars = [nextChar0, nextChar1, nextChar2, nextChar3, nextChar4];

  // Per-character X positions and widths as individual derived values
  // (Skia props need individual shared values, not array lookups)
  const curX0 = useDerivedValue(() => layout.charPositions[wordIndex.value % wordCount][0]);
  const curX1 = useDerivedValue(() => layout.charPositions[wordIndex.value % wordCount][1]);
  const curX2 = useDerivedValue(() => layout.charPositions[wordIndex.value % wordCount][2]);
  const curX3 = useDerivedValue(() => layout.charPositions[wordIndex.value % wordCount][3]);
  const curX4 = useDerivedValue(() => layout.charPositions[wordIndex.value % wordCount][4]);

  const nxtX0 = useDerivedValue(() => layout.charPositions[(wordIndex.value + 1) % wordCount][0]);
  const nxtX1 = useDerivedValue(() => layout.charPositions[(wordIndex.value + 1) % wordCount][1]);
  const nxtX2 = useDerivedValue(() => layout.charPositions[(wordIndex.value + 1) % wordCount][2]);
  const nxtX3 = useDerivedValue(() => layout.charPositions[(wordIndex.value + 1) % wordCount][3]);
  const nxtX4 = useDerivedValue(() => layout.charPositions[(wordIndex.value + 1) % wordCount][4]);

  const curW0 = useDerivedValue(() => layout.charWidths[wordIndex.value % wordCount][0]);
  const curW1 = useDerivedValue(() => layout.charWidths[wordIndex.value % wordCount][1]);
  const curW2 = useDerivedValue(() => layout.charWidths[wordIndex.value % wordCount][2]);
  const curW3 = useDerivedValue(() => layout.charWidths[wordIndex.value % wordCount][3]);
  const curW4 = useDerivedValue(() => layout.charWidths[wordIndex.value % wordCount][4]);

  const currentXs = [curX0, curX1, curX2, curX3, curX4];
  const nextXs = [nxtX0, nxtX1, nxtX2, nxtX3, nxtX4];
  const currentWidths = [curW0, curW1, curW2, curW3, curW4];

  // ── Cycle loop (NameCrossfade pattern) ──────────────────────────────
  useAnimatedReaction(
    () => cycleCounter.value,
    (count, prev) => {
      if (count === prev || count === 0) return;

      flipProgress.value = withDelay(
        DISPLAY_DURATION_MS,
        withTiming(
          1,
          { duration: FLIP_DURATION_MS, easing: Easing.inOut(Easing.cubic) },
          (finished) => {
            if (!finished) return;
            // Advance to next word and reset
            wordIndex.value = (wordIndex.value + 1) % wordCount;
            flipProgress.value = 0;
            cycleCounter.value += 1;
          }
        )
      );
    }
  );

  // ── Start / stop ───────────────────────────────────────────────────
  useAnimatedReaction(
    () => run.value,
    (running, prev) => {
      if (running === prev) return;
      if (running) {
        wordIndex.value = 0;
        flipProgress.value = 0;
        cycleCounter.value = 1;
      } else {
        cancelAnimation(flipProgress);
        wordIndex.value = 0;
        flipProgress.value = 0;
        cycleCounter.value = 0;
      }
    }
  );

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <Group>
      {/* Static prefix */}
      <Text
        text={prefix}
        font={font}
        x={layout.prefixX}
        y={baselineY}
        color={color}
      />

      {/* Dynamic flipping characters */}
      {Array.from({ length: charCount }, (_, i) => (
        <FlipChar
          key={i}
          charIndex={i}
          currentChar={currentChars[i]}
          nextChar={nextChars[i]}
          flipProgress={flipProgress}
          currentX={currentXs[i]}
          nextX={nextXs[i]}
          currentCharWidth={currentWidths[i]}
          y={baselineY}
          fontSize={fontSize}
          font={font}
          color={color}
        />
      ))}

      {/* Static suffix */}
      <Text
        text={suffix}
        font={font}
        x={layout.suffixX}
        y={baselineY}
        color={color}
      />
    </Group>
  );
}
