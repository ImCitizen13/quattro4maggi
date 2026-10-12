/**
 * useBubbleSoapFilm — the soap-film overlay (second pass, see
 * filmOverlayShader.ts) for the live bubble.
 *
 * FLOW:
 *   toggle      → React state mounts/unmounts the pass; a SharedValue mirror
 *                 zeroes the bubble's built-in film on the UI thread
 *   drag/spring → useBubbleFilmMotion turns the bubble's motion into film
 *                 impulses (the film lags the bubble)
 *   uniforms    → useSoapFilmUniforms + filmOverlayUniforms feed the shader
 */

import { useMemo, useState } from "react";
import {
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { useSoapFilmUniforms } from "@/components/soap-film/hooks/useSoapFilmUniforms";
import { getSoapFilmRampImage } from "@/lib/shaders/soapFilm";

import { FILM_DRAG_DEFAULT } from "../bubbleModes";
import { FILM_OVERLAY_SIZE } from "../filmOverlayShader";
import { useBubbleFilmMotion } from "./useBubbleFilmMotion";
import type { BubbleOptics, BubbleUniforms } from "./useBubbleOptics";
import { useClock } from "./useClock";

// ============================================================================
// Config
// ============================================================================

/** Soap-film overlay on at mount (live toggle: Surface tab). */
export const SOAP_FILM_ON_DEFAULT = true;

// ============================================================================
// Types
// ============================================================================

export type UseBubbleSoapFilmParams = {
  /** Spring-smoothed bubble center, canvas points. */
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  /** Live bubble radius, pt. */
  scaledRadius: SharedValue<number>;
  /** Bubble inertia multiplier; scales the film impulse decay. */
  inertia: SharedValue<number>;
  /** Optics levers from `useBubbleOptics`. */
  optics: BubbleOptics;
  /** Bubble uniforms from `useBubbleOptics` (`iParams` is reused). */
  uniforms: DerivedValue<BubbleUniforms>;
};

export type UseBubbleSoapFilmReturn = {
  /** Mounts the overlay pass. */
  soapFilmOn: boolean;
  /** 1/0 mirror of `soapFilmOn` for the UI thread. */
  soapFilmOnValue: SharedValue<number>;
  toggleSoapFilm: () => void;
  /** Film drag lever: 0 off · 1 calibrated · 2 exaggerated. */
  filmDrag: SharedValue<number>;
  filmFlow: ReturnType<typeof useSoapFilmUniforms>["flow"];
  filmRamp: ReturnType<typeof getSoapFilmRampImage>;
  filmOverlayUniforms: DerivedValue<{
    iParams: number[];
    iFilm: number;
    iFalloff: number;
    uReach: number;
    uFilmSize: [number, number];
    uFilmColor: number[];
  }>;
};

// ============================================================================
// Hook
// ============================================================================

export function useBubbleSoapFilm({
  bubbleX,
  bubbleY,
  scaledRadius,
  inertia,
  optics,
  uniforms,
}: UseBubbleSoapFilmParams): UseBubbleSoapFilmReturn {
  const time = useClock();

  // React state mounts/unmounts the pass; the SharedValue mirror zeroes the
  // bubble's built-in film on the UI thread.
  const [soapFilmOn, setSoapFilmOn] = useState(SOAP_FILM_ON_DEFAULT);
  const soapFilmOnValue = useSharedValue(SOAP_FILM_ON_DEFAULT ? 1 : 0);
  const toggleSoapFilm = () => {
    const next = !soapFilmOn;
    setSoapFilmOn(next);
    soapFilmOnValue.value = next ? 1 : 0;
  };

  // Film lags the bubble's motion (drag + spring home), see
  // hooks/useBubbleFilmMotion.ts.
  const filmDrag = useSharedValue(FILM_DRAG_DEFAULT);
  const filmMotion = useBubbleFilmMotion({
    posX: bubbleX,
    posY: bubbleY,
    radius: scaledRadius,
    time,
    enabled: soapFilmOnValue,
    drag: filmDrag,
    inertia,
  });

  const filmSize = useSharedValue<[number, number]>(FILM_OVERLAY_SIZE);
  const film = useSoapFilmUniforms({
    time,
    size: filmSize,
    touch: filmMotion.filmTouch,
    touchAge: filmMotion.filmTouchAge,
  });
  // Impulse decay/reach from the hook, not the soap-film finger-poke defaults.
  const filmFlow = useMemo(
    () => ({
      ...film.flow,
      touchTau: filmMotion.touchTau,
      touchRadius: filmMotion.touchRadius,
    }),
    [film.flow, filmMotion.touchTau, filmMotion.touchRadius],
  );
  const filmRamp = useMemo(() => getSoapFilmRampImage(), []);

  const filmOverlayUniforms = useDerivedValue(() => ({
    iParams: uniforms.value.iParams,
    iFilm: optics.film.value,
    iFalloff: optics.falloff.value,
    uReach: optics.filmReach.value,
    uFilmSize: filmSize.value,
    uFilmColor: [
      film.color.mode.value,
      film.color.thicknessScale.value,
      film.color.intensity.value,
      film.color.opacity.value,
    ],
  }));

  return {
    soapFilmOn,
    soapFilmOnValue,
    toggleSoapFilm,
    filmDrag,
    filmFlow,
    filmRamp,
    filmOverlayUniforms,
  };
}
