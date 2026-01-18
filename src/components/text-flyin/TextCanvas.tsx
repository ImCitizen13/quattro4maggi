/**
 * KineticText Component
 *
 * A text animation component that creates a kinetic "fly-in" effect where each
 * character animates in with a staggered delay. Supports two animation modes:
 * a simple scale/translate effect and a 3D "warp" effect with perspective rotation.
 *
 * ============================================================================
 * FLOW:
 * ============================================================================
 * 1. Text string is split into individual characters
 * 2. A shared `progress` value (0 → 1) drives all character animations
 * 3. Each character calculates its `localProgress` based on index and stagger delay
 * 4. Characters animate with opacity, translateY, and scale (or 3D rotations in warp mode)
 * 5. Parent can control animation via ref methods (start, reset)
 * 6. Optional slider control allows manual progress scrubbing
 *
 * ============================================================================
 * KEY FEATURES:
 * ============================================================================
 * - Staggered character animations with configurable delay
 * - Two animation modes: simple (scale/translate) and warp (3D perspective rotation)
 * - Spring-based animations for natural motion
 * - Imperative control via forwardRef (start, reset)
 * - External progress control via SharedValue for slider/gesture integration
 * - "Laggy" mode with quantized steps for retro/choppy effect
 * - Worklet-compatible callbacks (onAnimationStart, onAnimationComplete)
 * - Fully runs on UI thread for 60fps performance
 *
 * ============================================================================
 * ANIMATION MODES:
 * ============================================================================
 *
 * **Simple Mode (withWarp=false):**
 * - Opacity: 0 → 1
 * - TranslateY: 30 → 0 (drops down into place)
 * - Scale: 0.3 → 1
 *
 * **Warp Mode (withWarp=true, default):**
 * - Opacity: 0 → 1
 * - TranslateY: 50 → -15 → 0 (overshoots then settles)
 * - RotateX: 90° → 0° (flips from flat to facing user)
 * - RotateZ: -20° → 0° (slight rotation correction)
 * - Perspective: 400px for 3D depth
 *
 * ============================================================================
 * USAGE EXAMPLES:
 * ============================================================================
 *
 * **Basic Usage (auto-start):**
 * ```tsx
 * <KineticText text="Hello" fontSize={48} color="#fff" />
 * ```
 *
 * **With Ref Control:**
 * ```tsx
 * const textRef = useRef<KineticTextHandle>(null);
 *
 * <KineticText
 *   ref={textRef}
 *   text="Animate Me"
 *   autoStart={false}
 * />
 *
 * // Trigger animation
 * textRef.current?.start();
 * textRef.current?.reset();
 * ```
 *
 * **With Slider Control:**
 * ```tsx
 * const progress = useDerivedValue(() => sliderValue);
 *
 * <KineticText
 *   text="Scrub Me"
 *   progress={progress}
 *   withSliderControl={true}
 *   autoStart={false}
 * />
 * ```
 *
 * **With Laggy Effect:**
 * ```tsx
 * <KineticText text="Retro" laggy={true} />
 * ```
 */

import { SPRING_TEXT_CONFIG } from "@/lib/animations/constants";
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
 *
 * @example
 * const textRef = useRef<KineticTextHandle>(null);
 * textRef.current?.start();   // Start the animation
 * textRef.current?.reset();   // Reset to initial state
 * textRef.current?.isAnimating; // Check if currently animating
 */
export type KineticTextHandle = {
  /** Starts the fly-in animation from current progress */
  start: () => void;
  /** Resets animation to initial state (progress = 0) */
  reset: () => void;
  /** Returns true if animation is currently running */
  isAnimating: boolean;
};

/**
 * Props for the KineticText component
 */
export type KineticTextProps = {
  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  /** The text string to animate (default: "Reminders") */
  text?: string;

  // -------------------------------------------------------------------------
  // Styling
  // -------------------------------------------------------------------------

  /** Font size in pixels (default: 48) */
  fontSize?: number;

  /** Text color (default: "#fff") */
  color?: string;

  /** Background color of the container (default: "#000") */
  bgcolor?: string;

  /** Animation duration in milliseconds - currently unused, spring config controls timing */
  duration?: number;

  // -------------------------------------------------------------------------
  // Animation Configuration
  // -------------------------------------------------------------------------

  /**
   * Delay between each character's animation start.
   * Higher values = more spread out, lower values = more simultaneous.
   * Range: 0-1 where 0.08 is a good default (default: 0.01)
   */
  staggerDelay?: number;

  /** Whether to auto-start animation on mount (default: true) */
  autoStart?: boolean;

  /**
   * External SharedValue to control animation progress (0-1).
   * Use with `withSliderControl={true}` for manual scrubbing.
   */
  progress?: SharedValue<number>;

  /**
   * When true, uses the external `progress` prop instead of internal animation.
   * Enables slider/gesture-based control (default: false)
   */
  withSliderControl?: boolean;

  // -------------------------------------------------------------------------
  // Callbacks (must be worklets!)
  // -------------------------------------------------------------------------

  /**
   * Called when animation starts. Must be a worklet!
   * @example onAnimationStart={() => { "worklet"; console.log("started"); }}
   */
  onAnimationStart?: () => void;

  /**
   * Called when animation completes. Must be a worklet!
   * @example onAnimationComplete={() => { "worklet"; console.log("done"); }}
   */
  onAnimationComplete?: () => void;

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  /**
   * Enables "laggy" effect by quantizing animation into discrete steps.
   * Creates a retro/choppy visual effect (default: false)
   */
  laggy?: boolean;
};

// ============================================================================
// ANIMATED CHARACTER COMPONENT
// ============================================================================

/**
 * Internal component that renders and animates a single character.
 * Calculates its own localProgress based on the shared progress value and stagger offset.
 */
type AnimatedCharProps = {
  /** The character to render */
  char: string;
  /** Index in the text string (used for stagger calculation) */
  index: number;
  /** Font size in pixels */
  fontSize: number;
  /** Text color */
  color: string;
  /** Stagger delay factor (0-1) */
  staggerDelay: number;
  /** Shared progress value from parent (0-1) */
  progress: SharedValue<number>;
  /** Use 3D warp animation instead of simple scale/translate (default: true) */
  withWarp?: boolean;
  /** Number of discrete steps for quantized/laggy effect (undefined = smooth) */
  steps?: number;
};

const AnimatedChar = ({
  char,
  index,
  fontSize,
  color,
  staggerDelay,
  progress,
  withWarp = true,
  steps,
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

    // Quantize progress into steps for choppy effect

    const quantizedProgress = steps
      ? Math.floor(localProgress * steps) / steps
      : localProgress;
    // 2. Warp Physics
    const opacity = localProgress;
    const translateY = interpolate(
      quantizedProgress,
      [0, 0.5, 1],
      [50, -15, 0]
    );

    // const scale = interpolate(localProgress, [0, 1], [0.2, 1]);
    const perspective = 400; //interpolate(localProgress, [0, 1], [400, 100]);
    // The "Warp": Rotate from 90 degrees (flat/invisible) to 0 (facing user)
    const rotateX = `${interpolate(
      quantizedProgress,
      [0, 0.5, 1],
      [90, 0, 0]
    )}deg`;
    // const rotateY = `${interpolate(localProgress, [0, 1], [90, 0])}deg`;
    const rotateZ = `${interpolate(quantizedProgress, [0, 1], [-20, 0])}deg`;

    return {
      opacity,
      transform: [
        { perspective: perspective }, // Critical: Must be first for the 3D effect
        { translateY },
        { rotateX },
        // { rotateY },
        { rotateZ },
        // { scale },
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
      bgcolor = "#000",
      staggerDelay = 0.01, // More is less
      autoStart = true,
      duration = 3000,
      onAnimationStart,
      onAnimationComplete,
      progress: progressValue,
      withSliderControl = false,
      laggy = false,
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

        SPRING_TEXT_CONFIG,
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
      <Animated.View style={[styles.container, { backgroundColor: bgcolor }]}>
        {chars.map((char, index) => (
          <AnimatedChar
            key={`${char}-${index}`}
            char={char}
            index={index}
            fontSize={fontSize}
            color={color}
            staggerDelay={staggerDelay}
            progress={withSliderControl ? progressValue ?? progress : progress}
            steps={ laggy ? 8 : undefined}
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
