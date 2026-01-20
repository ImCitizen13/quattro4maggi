import { Canvas, Group, SkFont, Text, Transforms3d, useFont, vec } from "@shopify/react-native-skia";
import React, { useEffect } from "react";
import {
    Easing,
    interpolate,
    SharedValue,
    useDerivedValue,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

// --- 1. The Child Component (Handles one letter) ---
const AnimatedGlyph = ({
  char,
  index,
  font,
  progress,
}: {
  char: string;
  index: number;
  font: SkFont;
  progress: SharedValue<number>;
}) => {
  // A. Calculate Local Timing
  // Each letter waits 0.05s * index before starting
  const transform = useDerivedValue(() => {
    const delay = index * 0.1;
    // Normalized 0->1 for this specific letter
    // We clamp it so it doesn't go below 0 or above 1
    const localProgress = Math.max(
      0,
      Math.min(1, (progress.value - delay) * 2)
    );

    // B. The "Warp" Physics
    const yOffset = interpolate(localProgress, [0, 1], [30, 0]); // Flies up from 30px down
    const rotation = interpolate(localProgress, [0, 1], [90, 0]); // Unfolds from 90deg
    const scale = interpolate(localProgress, [0, 1], [0.5, 1]); // Grows from 0.5x
    const opacity = interpolate(localProgress, [0, 1], [0, 1]);

    return [
      { perspective: 500 }, // 1. Establish 3D Depth
      { translateY: yOffset }, // 2. Move vertically
      { rotateX: rotation * (Math.PI / 180) }, // 3. Rotate around X (The "Warp")
      { scale }, // 4. Scale up
    ];
  });

  // Calculate generic width per char (simplified for example)
  // In production, you might calculate exact metrics
  const charWidth = 25;
  const xPos = index * charWidth;
  const yPos = 60;

  return (
    <Group
      origin={vec(xPos + charWidth / 2, yPos)} // Pivot around the center of the letter
      transform={transform.value as Transforms3d}
    >
      {/* We use opacity prop if available on Text, 
        or control color opacity via a derived color 
      */}
      <Text
        text={char}
        font={font}
        x={xPos}
        y={yPos}
        color={`rgba(1,1,1,${1})`} // Simplify color for now
      />
    </Group>
  );
};

// --- 2. The Parent Component (Orchestrator) ---
export const KineticText = () => {
  const font = useFont(require("../../assets/fonts/Satisfy-Regular.ttf"), 40);
  const text = "Plants";
  const chars = text.split("");

  const progress = useSharedValue(0);

  useEffect(() => {
    // Reset and play
    progress.value = 0;
    progress.value = withTiming(2, {
      // Duration covers total time of all letters + delays
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  useEffect(() => {
    if (font) {
      progress.value = 0;
      progress.value = withTiming(2, {
        duration: 1500,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [font]); // <--- Add font here

  if (!font) return null;

  return (
    <Canvas style={{ width: 300, height: 120, backgroundColor: "red" }}>
      {chars.map((char, i) => (
        <AnimatedGlyph
          key={i}
          index={i}
          char={char}
          font={font}
          progress={progress}
        />
      ))}
    </Canvas>
  );
};
