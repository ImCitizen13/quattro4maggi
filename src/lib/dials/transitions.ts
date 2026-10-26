import type { EasingConfig, SpringConfig, TransitionConfig } from "dialkit";
import {
  Easing,
  ReduceMotion,
  withSpring,
  withTiming,
  type AnimationCallback,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";

// ============================================================================
// DialKit curve → Reanimated (DialKit durations are seconds, Reanimated ms)
// ============================================================================

/** Motion's time-spring default when a spring dial omits both styles. */
const DEFAULT_VISUAL_DURATION = 0.3;

/**
 * Physics springs (stiffness/damping/mass) map 1:1. Time springs map
 * visualDuration → `duration` (Reanimated 4's perceptual duration) and
 * bounce → `dampingRatio = 1 - bounce`.
 */
export const toSpringConfig = (curve: SpringConfig): WithSpringConfig => {
  "worklet";
  if (curve.stiffness !== undefined || curve.damping !== undefined || curve.mass !== undefined) {
    return {
      stiffness: curve.stiffness,
      damping: curve.damping,
      mass: curve.mass,
      reduceMotion: ReduceMotion.System,
    };
  }
  return {
    duration: (curve.visualDuration ?? DEFAULT_VISUAL_DURATION) * 1000,
    dampingRatio: Math.max(0.05, 1 - (curve.bounce ?? 0)),
    reduceMotion: ReduceMotion.System,
  };
};

export const toTimingConfig = (curve: EasingConfig): WithTimingConfig => {
  "worklet";
  const [x1, y1, x2, y2] = curve.ease;
  return {
    duration: curve.duration * 1000,
    easing: Easing.bezier(x1, y1, x2, y2),
    reduceMotion: ReduceMotion.System,
  };
};

/**
 * Animate with whatever curve the dial currently holds. The editor can flip a
 * spring dial to Easing mode, so never assume `type: 'spring'`.
 */
export const withDialCurve = <T extends number>(
  curve: TransitionConfig,
  toValue: T,
  callback?: AnimationCallback,
): T => {
  "worklet";
  return curve.type === "easing"
    ? withTiming(toValue, toTimingConfig(curve), callback)
    : withSpring(toValue, toSpringConfig(curve), callback);
};
