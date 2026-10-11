/**
 * useSceneRipple — one water ripple over the WHOLE scene, fired off the
 * intro's own `progress`. Design notes: README.md → "hooks/useSceneRipple.ts".
 *
 * FLOW:
 *   progress crosses RIPPLE_AT_PROGRESS going FORWARD
 *     → tapTime = the clock's now  → the shader's `globalTime` leaves 0
 *     → a wave expands from the centre, bounces off the edges, decays
 *   progress falls back below it (reset, or a backwards scrub)
 *     → re-arm and park tapTime in the future again
 *
 * KEY FEATURES:
 * - **Fired by `progress`, not by a timer.** Everything else in this demo is
 *   a pure function of the one scrubbable value, so the ripple is too: drag
 *   the scrub bar through the trigger's collapse and it goes off, drag back
 *   and it re-arms. A `setTimeout` off `play()` would desync the moment the
 *   scrub bar touched anything.
 * - **Parked in the future when idle.** The shader clamps
 *   `max(u_time - u_tapTime, 0)`, so a `tapTime` far ahead of the clock means
 *   `globalTime = 0` → `sin(0) · exp(0)` → zero displacement. That is the
 *   off state; -1 (RippleEffect's idle value) would instead read as "tapped
 *   one second ago" and flash a ripple at mount.
 * - **Edge-triggered, once per crossing.** `armed` latches, so a `progress`
 *   that dawdles on the threshold can't retrigger every frame.
 * - **Uniforms are in the filter's space, not points.** See `pixelDensity`.
 */

import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { RIPPLE_AT_PROGRESS, RIPPLE_REARM_SLOP } from "../multiBubbleConfig";

// ============================================================================
// Config
// ============================================================================

/**
 * The idle `u_tapTime`: far enough ahead of the clock that `u_time -
 * u_tapTime` stays negative — and so clamps to 0 — for any run of this demo.
 */
const RIPPLE_IDLE = 1e9;

// ============================================================================
// Types
// ============================================================================

export type SceneRippleOptions = {
  /** The intro's master value. The ripple fires on its forward crossing. */
  progress: SharedValue<number>;
  /** Seconds since mount (`useClock`) — the same clock the shader reads. */
  time: SharedValue<number>;
  /** Canvas size, pt. */
  width: number;
  height: number;
  /**
   * Local units per point. The layer this shader paints lives inside the
   * screen's `1 / pd` group, so its fragment coordinates are DEVICE PIXELS:
   * `u_resolution` has to be the size in that space or the wave's centre and
   * radius come out at a third of the screen.
   * @default 1
   */
  pixelDensity?: number;
  /** Normalized origin, 0..1 of the canvas. @default the centre */
  center?: [number, number];
  /** Progress to fire at. @default `RIPPLE_AT_PROGRESS` */
  at?: number;
};

/** Exactly the uniforms `BouncyRipplePrismShader` declares. */
export type SceneRippleUniforms = {
  u_resolution: number[];
  u_center: number[];
  u_time: number;
  u_tapTime: number;
};

export type SceneRipple = {
  /** Feed straight to the layer's `<RuntimeShader uniforms=…>`. */
  uniforms: DerivedValue<SceneRippleUniforms>;
  /** Fire it by hand, from anywhere (a button, a tap). */
  fire: () => void;
};

// ============================================================================
// Hook
// ============================================================================

export function useSceneRipple({
  progress,
  time,
  width,
  height,
  pixelDensity = 1,
  center = [0.5, 0.5],
  at = RIPPLE_AT_PROGRESS,
}: SceneRippleOptions): SceneRipple {
  const tapTime = useSharedValue(RIPPLE_IDLE);
  const armed = useSharedValue(true);

  useAnimatedReaction(
    () => progress.value,
    (p, previous) => {
      if (previous === null) {
        return;
      }
      if (armed.value && previous < at && p >= at) {
        tapTime.value = time.value;
        armed.value = false;
        return;
      }
      // Re-arm on the way back down, with slop so a value hovering on the
      // threshold can't arm and fire on alternate frames.
      if (!armed.value && p < at - RIPPLE_REARM_SLOP) {
        armed.value = true;
        tapTime.value = RIPPLE_IDLE;
      }
    },
  );

  const uniforms = useDerivedValue<SceneRippleUniforms>(() => ({
    u_resolution: [width * pixelDensity, height * pixelDensity],
    u_center: [center[0], center[1]],
    u_time: time.value,
    u_tapTime: tapTime.value,
  }));

  const fire = () => {
    tapTime.value = time.value;
    armed.value = false;
  };

  return { uniforms, fire };
}
