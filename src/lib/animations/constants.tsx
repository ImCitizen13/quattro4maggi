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

/** SDF shape morph: previous distance field melting into the new one */
export const SPRING_SDF_MORPH = {
        stiffness: 900,
        damping: 120,
        mass: 4,
        overshootClamping: false,
        energyThreshold: 6e-9,
        velocity: 0,
        reduceMotion: ReduceMotion.System,

};

/**
 * Metaball tap-disperse: balls fling outward, then spring back home.
 * OUT is damped enough (ζ≈0.6) to reach the peak with just a touch of
 * overshoot and settle fast — the withSequence won't start the return until
 * OUT rests, so a bouncy OUT would leave the balls hanging at full spread.
 * BACK is stiff and near-critically damped (ζ≈0.85) so the shape reforms
 * quickly without wobbling on arrival.
 */
export const SPRING_DISPERSE_OUT = {
  stiffness: 320,
  damping: 22,
  mass: 1,
  overshootClamping: false,
  energyThreshold: 6e-9,
  velocity: 0,
  reduceMotion: ReduceMotion.System,
};

// Slightly OVERDAMPED (ζ≈1.06) + overshootClamping so dispersion returns to 0
// monotonically — never dipping below 0. An underdamped return oscillated
// across the iBallCount cutoff and drove iBodyErode negative, popping/jittering
// the shape as it reformed.
export const SPRING_DISPERSE_BACK = {
  stiffness: 200,
  damping: 30,
  mass: 1,
  overshootClamping: true,
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
