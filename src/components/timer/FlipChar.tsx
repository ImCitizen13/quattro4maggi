import { Group, Text } from "@shopify/react-native-skia";
import type { SkFont } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";
import { clamp, interpolate, useDerivedValue } from "react-native-reanimated";

const STAGGER_OFFSET = 0.08;
const MAX_STAGGER = 4 * STAGGER_OFFSET; // 5 chars, last one starts at 4 * 0.08

type FlipCharProps = {
  charIndex: number;
  currentChar: SharedValue<string>;
  nextChar: SharedValue<string>;
  flipProgress: SharedValue<number>;
  currentX: SharedValue<number>;
  nextX: SharedValue<number>;
  currentCharWidth: SharedValue<number>;
  y: SharedValue<number>;
  fontSize: number;
  font: SkFont;
  color: string;
};

export default function FlipChar({
  charIndex,
  currentChar,
  nextChar,
  flipProgress,
  currentX,
  nextX,
  currentCharWidth,
  y,
  fontSize,
  font,
  color,
}: FlipCharProps) {
  const localProgress = useDerivedValue(() =>
    clamp(
      (flipProgress.value - charIndex * STAGGER_OFFSET) / (1 - MAX_STAGGER),
      0,
      1
    )
  );

  const displayChar = useDerivedValue(() =>
    localProgress.value < 0.5 ? currentChar.value : nextChar.value
  );

  // Swap x position at the midpoint (when char is edge-on and invisible)
  const xPos = useDerivedValue(() =>
    localProgress.value < 0.5 ? currentX.value : nextX.value
  );

  const origin = useDerivedValue(() => ({
    x: currentX.value + currentCharWidth.value / 2,
    y: y.value - fontSize / 2,
  }));

  const transform = useDerivedValue(() => {
    const local = localProgress.value;
    const angle =
      local < 0.5
        ? interpolate(local, [0, 0.5], [0, -Math.PI / 2])
        : interpolate(local, [0.5, 1], [Math.PI / 2, 0]);

    return [{ perspective: 500 }, { rotateX: angle }];
  });

  return (
    <Group origin={origin} transform={transform}>
      <Text
        text={displayChar}
        font={font}
        x={xPos}
        y={y}
        color={color}
      />
    </Group>
  );
}
