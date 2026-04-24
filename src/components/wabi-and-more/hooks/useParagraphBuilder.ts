import {
  Skia,
  SkParagraph,
  SkTypeface,
  TextAlign,
  TextDirection,
} from "@shopify/react-native-skia";
import { useMemo } from "react";
import { ARABIC_TEXT, FONT_SIZE, TEXT_2 } from "../constants";

type ParagraphResult = {
  english: SkParagraph | null;
  arabic: SkParagraph | null;
};

export function useParagraphBuilder(
  englishTypeface: SkTypeface | null,
  arabicTypeface: SkTypeface | null,
  isDark: boolean,
  canvasWidth: number
): { paragraphs: ParagraphResult; baselineOffset: number } {
  const paragraphs = useMemo(() => {
    const color = Skia.Color(isDark ? "#fff" : "#000");
    const fontProvider = Skia.TypefaceFontProvider.Make();
    let english: SkParagraph | null = null;
    let arabic: SkParagraph | null = null;

    if (englishTypeface) {
      fontProvider.registerFont(englishTypeface, "LexendDeca");
      const builder = Skia.ParagraphBuilder.Make(
        {
          textAlign: TextAlign.Center,
          maxLines: 1,
          textStyle: {
            color,
            fontSize: FONT_SIZE,
            fontFamilies: ["LexendDeca"],
          },
        },
        fontProvider
      );
      builder.addText(TEXT_2);
      english = builder.build();
      english.layout(canvasWidth);
    }

    if (arabicTypeface) {
      fontProvider.registerFont(arabicTypeface, "ArefRuqaa");
      const builder = Skia.ParagraphBuilder.Make(
        {
          textDirection: TextDirection.RTL,
          textAlign: TextAlign.Center,
          maxLines: 1,
          textStyle: {
            color,
            fontSize: FONT_SIZE + 10,
            fontFamilies: ["ArefRuqaa"],
          },
        },
        fontProvider
      );
      builder.addText(ARABIC_TEXT);
      arabic = builder.build();
      arabic.layout(canvasWidth);
    }

    return { english, arabic };
  }, [englishTypeface, arabicTypeface, isDark, canvasWidth]);

  const baselineOffset = useMemo(() => {
    const p = paragraphs.english ?? paragraphs.arabic;
    if (!p) return FONT_SIZE;
    const lines = p.getLineMetrics();
    return lines.length > 0 ? lines[0].baseline : FONT_SIZE;
  }, [paragraphs]);

  return { paragraphs, baselineOffset };
}
