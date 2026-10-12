/**
 * useBirthOptics — the exaggerated "birth" glass an intro bubble wears while
 * it inflates, crossing over to the screen's live optics once it is mostly
 * through its own scale curve. Design notes: README.md → "hooks/useBirthOptics.ts".
 *
 * FLOW:
 *   inflate (0 → 1, this bubble's own curve) crosses BIRTH_SWAP_START →
 *     TRIGGERS the crossover: t (a SharedValue) animates 0 → 1 with
 *     withTiming over BIRTH_SWAP_MS, on its own clock
 *   inflate falls back below BIRTH_SWAP_START → t snaps back to 0, re-arming
 *     the birth look for the next trigger (a Reset, or a backwards scrub)
 *   t >= 1  → pass the caller's `uniforms` straight through, unchanged
 *   t <  1  → per lever: lerp(birth[lever] ?? live, live, t), live re-read
 *     from `uniforms.value` every frame
 *   clipPad (pt) = bubblePadPt(...) on the BLENDED values, so the clip keeps
 *     up with the crossover and lands on the live pad exactly at t = 1
 *
 * KEY FEATURES:
 * - **Triggered by the inflate curve, timed on its own clock.** `inflate`
 *   crossing `BIRTH_SWAP_START` fires a `withTiming` over `BIRTH_SWAP_MS` —
 *   the crossover no longer finishes together with the rest of the inflate
 *   curve. This is a deliberate trade: the crossover is no longer scrubbable
 *   (dragging `progress` through it doesn't seek it — it re-arms going
 *   backward and replays going forward), in exchange for a crossover that
 *   always takes the same wall-clock time regardless of how long the
 *   remaining inflate happens to run.
 * - **`t >= 1` is a fast path, not just an optimization.** At rest (and once
 *   settled) it returns the caller's own `uniforms` object unchanged — no new
 *   object, no lerp math — so the tuning-panel sliders keep driving the
 *   settled bubble directly, and nothing is allocated at rest.
 * - **The clip-pad crossover is load-bearing.** Live optics clip with
 *   `refract = 18, lens = 0, dispersion = 0` → a pad of roughly 20pt. Birth's
 *   `refract = 31, lens = 0.7, dispersion = 0.6` needs roughly `31 + 0.6·R + 2`
 *   — about 70pt at R = 62. Without `clipPad` tracking the SAME blend as the
 *   uniforms, the birth look reads correctly but is chopped off at the old,
 *   narrower clip rect.
 * - `birth` or `inflate` missing → pass-through on both `uniforms` and
 *   `clipPad` (`clipPad: undefined`, so `BaselineBubble` falls back to its own
 *   live pad). Every hook below still runs unconditionally — only the return
 *   branches.
 *
 * The project prefers `withSpring` over `withTiming`, but this crossover is a
 * caller-set DURATION (`BIRTH_SWAP_MS`) that a spring can't express — the same
 * documented exception `hooks/useIntroTimeline.ts` takes for its curves.
 */

import {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type DerivedValue,
} from "react-native-reanimated";

import { bubblePadPt } from "../bubbleClipPad";
import { BIRTH_SWAP_MS, BIRTH_SWAP_START } from "../multiBubbleConfig";
import type {
  BubbleOptics,
  BubbleOpticsValues,
  BubbleUniforms,
} from "@/components/liquid-bubble-live/hooks/useBubbleOptics";

/** Fast then settling — the dial should feel like it lands, not like it stops. */
const BIRTH_SWAP_EASING = Easing.out(Easing.cubic);

// ============================================================================
// Types
// ============================================================================

export type UseBirthOpticsParams = {
  /** The screen's live uniforms — what the glass crosses over TO. */
  uniforms: DerivedValue<BubbleUniforms>;
  /** The live levers, for the fall-through clip pad. */
  optics: BubbleOptics;
  /** This bubble's radius, for the clip pad. */
  radius: DerivedValue<number>;
  /** This bubble's scale curve. Undefined = no birth look, pass through. */
  inflate?: DerivedValue<number>;
  /** The birth look. Undefined = no birth look, pass through. */
  birth?: Partial<BubbleOpticsValues>;
};

export type UseBirthOpticsResult = {
  uniforms: DerivedValue<BubbleUniforms>;
  /** undefined when there is no birth look — BaselineBubble keeps its own pad. */
  clipPad: DerivedValue<number> | undefined;
};

// ============================================================================
// Hook
// ============================================================================

export function useBirthOptics({
  uniforms,
  optics,
  radius,
  inflate,
  birth,
}: UseBirthOpticsParams): UseBirthOpticsResult {
  const t = useSharedValue(0);

  useAnimatedReaction(
    () => {
      if (birth === undefined || inflate === undefined) {
        return false;
      }
      return inflate.value >= BIRTH_SWAP_START;
    },
    (fired, previous) => {
      if (previous === null) {
        return;
      }
      if (fired && !previous) {
        t.value = withTiming(1, {
          duration: BIRTH_SWAP_MS,
          easing: BIRTH_SWAP_EASING,
          reduceMotion: ReduceMotion.System,
        });
      } else if (!fired && previous) {
        t.value = 0;
      }
    },
  );

  const blendedUniforms = useDerivedValue<BubbleUniforms>(() => {
    const live = uniforms.value;
    if (t.value >= 1 || birth === undefined) {
      return live;
    }
    const k = t.value;
    const lerp = (birthVal: number | undefined, liveVal: number) =>
      birthVal === undefined ? liveVal : birthVal + (liveVal - birthVal) * k;

    const refract = lerp(birth.refract, live.iRefract);
    const film = lerp(birth.film, live.iFilm);
    const palette = lerp(birth.palette, live.iPalette);
    const tint = lerp(birth.tint, live.iColor[3]);

    const rimDark = lerp(birth.rimDark, live.iOptics[0]);
    const rimWidth = lerp(birth.rimWidth, live.iOptics[1]);
    const filmScale = lerp(birth.filmScale, live.iOptics[2]);
    const falloff = lerp(birth.falloff, live.iOptics[3]);

    const lens = lerp(birth.lens, live.iLens[0]);
    const dispersion = lerp(birth.dispersion, live.iLens[1]);
    const edgeWidth = lerp(birth.edgeWidth, live.iLens[2]);
    const specular = lerp(birth.specular, live.iLens[3]);

    const rainbowMix = lerp(birth.rainbowMix, live.iPrism[0]);
    const rainbowGlow = lerp(birth.rainbowGlow, live.iPrism[1]);
    const haloSpread = lerp(birth.haloSpread, live.iPrism[2]);
    const haloOpacity = lerp(birth.haloOpacity, live.iPrism[3]);

    return {
      iParams: live.iParams,
      iColor: [live.iColor[0], live.iColor[1], live.iColor[2], tint],
      iRefract: refract,
      iFilm: film,
      iOptics: [rimDark, rimWidth, filmScale, falloff],
      iLens: [lens, dispersion, edgeWidth, specular],
      iPrism: [rainbowMix, rainbowGlow, haloSpread, haloOpacity],
      iPalette: palette,
    };
  });

  const clipPad = useDerivedValue(() => {
    const u = blendedUniforms.value;
    return bubblePadPt(
      u.iRefract,
      u.iLens[0],
      u.iLens[1],
      u.iPrism[3],
      u.iPrism[2],
      radius.value,
    );
  });

  if (birth === undefined || inflate === undefined) {
    return { uniforms, clipPad: undefined };
  }

  return { uniforms: blendedUniforms, clipPad };
}
