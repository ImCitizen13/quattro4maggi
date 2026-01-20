import { ReduceMotion } from "react-native-reanimated";

export const SPRING_CONFIG = {
  duration: 1500,
  dampingRatio: 0.9, // closer to 1.0 = less bounce
  mass: 2,
  overshootClamping: undefined,
  energyThreshold: 6e-9,
  velocity: 0,
  reduceMotion: ReduceMotion.System,
};

export const SPRING_CONFIG_FLIP = {
  damping: 10, // Higher damping = less bounce
  stiffness: 80,
  mass: 0.6, // Lighter = less momentum
};

export const SPRING_TEXT_CONFIG = {
  duration: 6000,
  dampingRatio: 0.9, // closer to 1.0 = less bounce
  mass: 2,
  overshootClamping: undefined,
  energyThreshold: 6e-9,
  velocity: 0,
  reduceMotion: ReduceMotion.System,
};

export const SPRING_BOUNCE_ANIMATION = {
  duration: 1000,
  dampingRatio: 0.5,
  mass: 48,
  overshootClamping: false,
  energyThreshold: 6e-9,
  velocity: 0,
  reduceMotion: ReduceMotion.System,
};
