import { Group, Paint, Paragraph } from "@shopify/react-native-skia";
import type { SkParagraph } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";
import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

const MORPH_DELAY_MS = 3000;
const FADE_DURATION = 700;

type NameCrossfadeProps = {
  englishParagraph: SkParagraph | null;
  arabicParagraph: SkParagraph | null;
  englishY: SharedValue<number>;
  arabicY: SharedValue<number>;
  width: number;
  bubbleAtCenter: SharedValue<boolean>;
};

export default function NameCrossfade({
  englishParagraph,
  arabicParagraph,
  englishY,
  arabicY,
  width,
  bubbleAtCenter,
}: NameCrossfadeProps) {
  const englishOpacity = useSharedValue(1);
  const arabicOpacity = useSharedValue(0);

  const morphCycleCounter = useSharedValue(0);

  useAnimatedReaction(
    () => morphCycleCounter.value,
    (count, prev) => {
      if (count === prev || count === 0) return;
      // Wait, then fade out English
      englishOpacity.value = withDelay(
        MORPH_DELAY_MS,
        withTiming(0, { duration: FADE_DURATION }, (finished) => {
          if (!finished) return;
          // English is gone — now fade in Arabic
          arabicOpacity.value = withTiming(
            1,
            { duration: FADE_DURATION },
            (finished2) => {
              if (!finished2) return;
              // Wait, then fade out Arabic
              arabicOpacity.value = withDelay(
                MORPH_DELAY_MS,
                withTiming(0, { duration: FADE_DURATION }, (finished3) => {
                  if (!finished3) return;
                  // Arabic is gone — fade English back in
                  englishOpacity.value = withTiming(
                    1,
                    { duration: FADE_DURATION },
                    (finished4) => {
                      if (finished4) morphCycleCounter.value += 1;
                    }
                  );
                })
              );
            }
          );
        })
      );
    }
  );

  useAnimatedReaction(
    () => bubbleAtCenter.value,
    (atCenter, prev) => {
      if (atCenter === prev) return;
      if (atCenter) {
        englishOpacity.value = 1;
        arabicOpacity.value = 0;
        morphCycleCounter.value = 1;
      } else {
        cancelAnimation(englishOpacity);
        cancelAnimation(arabicOpacity);
        englishOpacity.value = 1;
        arabicOpacity.value = 0;
        morphCycleCounter.value = 0;
      }
    }
  );

  return (
    <Group>
      <Group layer={<Paint opacity={englishOpacity} />}>
        <Paragraph
          paragraph={englishParagraph}
          x={0}
          y={englishY}
          width={width}
        />
      </Group>

      <Group layer={<Paint opacity={arabicOpacity} />}>
        <Paragraph
          paragraph={arabicParagraph}
          x={0.5}
          y={arabicY}
          width={width}
        />
      </Group>
    </Group>
  );
}
