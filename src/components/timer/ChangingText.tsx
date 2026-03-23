import { SkFont, Text as SKText } from "@shopify/react-native-skia";
import React from "react";
import { SharedValue } from "react-native-reanimated";

export default function ChangingText(
  font: SkFont,
  words: string[],
  run: SharedValue<boolean>
) {
  return <SKText font={font} text={""} />;
}
