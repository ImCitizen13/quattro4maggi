/**
 * KineticText Component
 *
 * A text animation component that creates a kinetic "fly-in" effect where each
 * character animates in with a staggered delay, scaling and translating smoothly.
 *
 * FLOW:
 * 1. Text is split into individual characters
 * 2. Each character animates independently with staggered timing
 * 3. Parent can control animation via ref (start, pause, stop, reset)
 * 4. Characters scale, translate, and fade in smoothly
 *
 * KEY FEATURES:
 * - Staggered character animations
 * - Smooth spring-based transitions
 * - Imperative controls via ref (start, pause, stop, reset)
 * - Customizable text and styling
 *
 * USAGE:
 * const textRef = useRef<KineticTextHandle>(null);
 * textRef.current?.start();
 * textRef.current?.pause();
 * textRef.current?.stop();
 * textRef.current?.reset();
 */

import { forwardRef, useImperativeHandle, useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Methods exposed to parent via ref
 * Usage: const textRef = useRef<KineticTextHandle>(null);
 *        textRef.current?.start();
 */
export type KineticTextHandle = {
  start: () => void;
  reset: () => void;
  isAnimating: boolean;
};

export type KineticTextProps = {
  // --- Content ---
  text?: string;

  // --- Styling ---
  fontSize?: number;
  color?: string;

  duration?: number;

  // --- Animation Configuration ---
  staggerDelay?: number;
  autoStart?: boolean; // Auto-start animation on mount (default: true)

  // --- Callbacks ---
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
};

// ============================================================================
// ANIMATED CHARACTER COMPONENT
// ============================================================================

type AnimatedCharProps = {
  char: string;
  index: number;
  fontSize: number;
  color: string;
  staggerDelay: number;
  progress: SharedValue<number>;
  withWarp?: boolean;
};

const AnimatedChar = ({
  char,
  index,
  fontSize,
  color,
  staggerDelay,
  progress,
  withWarp = true,
}: AnimatedCharProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    // Calculate stagger offset for this character
    const start = index * staggerDelay;
    const localProgress = Math.max(
      0,
      Math.min(1, (progress.value - start) / (1 - start))
    );

    const opacity = localProgress;
    const translateY = (1 - localProgress) * 30;
    const scale = 0.3 + localProgress * 0.7;

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const warpAnimatedStyle = useAnimatedStyle(() => {
    // 1. Improved Local Progress Calculation
    // Using a fixed duration window (e.g., 0.4) for each char makes the stagger consistent
    const duration = 0.4; // Each letter takes 40% of the total 0->1 progress
    const start = index * staggerDelay;
    const end = start + duration;

    // This ensures the letter doesn't start until 'start'
    // and finishes exactly 'charDuration' later.
    const localProgress = interpolate(
      progress.value,
      [start, end],
      [0, 1],
      Extrapolation.CLAMP
    );

    // 2. Warp Physics
    const opacity = localProgress;
    const translateY = interpolate(localProgress, [0, 1], [40, 0]);
    const scale = interpolate(localProgress, [0, 1], [0.2, 1]);

    // The "Warp": Rotate from 90 degrees (flat/invisible) to 0 (facing user)
    const rotateX = `${interpolate(localProgress, [0, 1], [90, 0])}deg`;

    return {
      opacity,
      transform: [
        { perspective: 400 }, // Critical: Must be first for the 3D effect
        { translateY },
        { rotateX },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={withWarp ? warpAnimatedStyle : animatedStyle}>
      <Text style={[styles.char, { fontSize, color }]}>{char}</Text>
    </Animated.View>
  );
};

// ============================================================================
// COMPONENT
// ============================================================================

export const KineticText = forwardRef<KineticTextHandle, KineticTextProps>(
  function KineticText(
    {
      text = "Reminders",
      fontSize = 48,
      color = "#fff",
      staggerDelay = 0.08, // More is less
      autoStart = true,
      duration = 3000,
      onAnimationStart,
      onAnimationComplete,
    },
    ref
  ) {
    // Shared animation progress (0 to 1)
    const progress = useSharedValue(autoStart ? 0 : 0);
    const isAnimating = useSharedValue(false);

    // Break text into individual characters
    const chars = useMemo(() => text.split(""), [text]);

    // Animation control methods
    const start = () => {
      if (isAnimating.value) return;

      // Cancel any existing animation first
      cancelAnimation(progress);

      isAnimating.value = true;
      onAnimationStart?.();
      const totalTarget = 1 + text.length * 0.08;

      progress.value = withSpring(
        totalTarget,
        {
          duration: duration,
          dampingRatio: 1,
          mass: 4,
        },
        (finished) => {
          if (finished) {
            isAnimating.value = false;
            onAnimationComplete?.();
          }
        }
      );
    };

    const reset = () => {
      cancelAnimation(progress);
      progress.value = 0; // Jump to start
      // pausedValueRef.current = 0;
      isAnimating.value = false;
    };

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      start,
      reset,
      get isAnimating() {
        return isAnimating.value;
      },
    }));

    // Auto-start animation if enabled
    if (autoStart && progress.value === 0 && !isAnimating.value) {
      // Delay until next frame to avoid starting during render
      setTimeout(() => start(), 0);
    }

    return (
      <Animated.View style={styles.container}>
        {chars.map((char, index) => (
          <AnimatedChar
            key={`${char}-${index}`}
            char={char}
            index={index}
            fontSize={fontSize}
            color={color}
            staggerDelay={staggerDelay}
            progress={progress}
          />
        ))}
      </Animated.View>
    );
  }
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  char: {
    fontWeight: "bold",
    fontFamily: "SpaceMono-Regular",
  },
});
