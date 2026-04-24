import { Group, ImageSVG, Paint, SkSVG } from "@shopify/react-native-skia";
import React from "react";
import { SharedValue } from "react-native-reanimated";

type SwipeIndicatorProps = {
  svg: SkSVG | null;
  x: number;
  y: number;
  opacity: SharedValue<number>;
  isDark: boolean;
};

export function SwipeIndicator({
  svg,
  x,
  y,
  opacity,
  isDark,
}: SwipeIndicatorProps) {
  if (!svg) return null;

  return (
    <Group layer={<Paint opacity={opacity} />}>
      <ImageSVG
        svg={svg}
        x={x - 16}
        y={y}
        width={32}
        height={32}
        color={isDark ? "rgb(113, 113, 113)" : "rgb(143, 139, 139)"}
      />
    </Group>
  );
}
