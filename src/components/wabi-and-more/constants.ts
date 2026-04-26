import { ReduceMotion } from "react-native-reanimated";

// ============================================================================
// SIZING
// ============================================================================
export const BUBBLE_RADIUS = 200;
export const FONT_SIZE = 28;
export const TEXT_GAP = 15;

// ============================================================================
// TEXT CONTENT
// ============================================================================
export const TEXT = "Hi There.";
export const TEXT_2 = "I'm MelTohamy,";
export const INITIAL_TEXT = "Swipe Up To Start";
export const ARABIC_TEXT = "أنا م.التهامي";
export const FLIP_WORDS = ["Learn", "Build", "Share"];

// ============================================================================
// SPRING CONFIGS
// ============================================================================
export const SPRING_SNAP_PROPS = {
  stiffness: 550,
  damping: 140,
  mass: 9,
  overshootClamping: undefined,
  energyThreshold: 6e-9,
  velocity: -300,
  reduceMotion: ReduceMotion.System,
};

export const SPRING_FOLLOW_PROPS = {
  stiffness: 300,
  damping: 30,
  mass: 3,
  reduceMotion: ReduceMotion.System,
};

export const SPRING_TEXT_PROPS = {
  stiffness: 900,
  damping: 120,
  mass: 4,
  overshootClamping: false,
  energyThreshold: 6e-9,
  velocity: 0,
  reduceMotion: ReduceMotion.System,
};
