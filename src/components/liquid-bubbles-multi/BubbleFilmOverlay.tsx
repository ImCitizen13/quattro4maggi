/**
 * BubbleFilmOverlay — the soap-film pass over one bubble of the multi buffer.
 * Same second pass as liquid-bubble-live's (`filmOverlayShader.ts`), fed one
 * slot of the flat param buffer instead of the single bubble's.
 *
 * FLOW:
 *   paramBuffer[index · 12 … + 11] → iParams (points)
 *   glass uniforms (after the birth crossover) → iFilm, falloff
 *   soap-film thickness field + ramp → filmOverlayEffect
 *   → a Rect over this bubble's bound, composited over the glass
 *
 * KEY FEATURES:
 * - Drawn in POINTS: the caller puts it inside its own `pixelDensity` group.
 *   A plain paint shader handles the canvas matrix itself, so unlike the
 *   glass pass nothing here needs scaling by `pd`.
 * - Reads `iFilm` from the glass's own uniforms BEFORE they are zeroed, so
 *   the Film lever (and any birth-look blend) still sets the film weight.
 * - A waiting slot (R = 0) gets an empty rect.
 */

import {
  FilterMode,
  ImageShader,
  MipmapMode,
  Rect,
  Shader,
  rect,
  type SkImage,
} from "@shopify/react-native-skia";
import React from "react";
import {
  useDerivedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  AA_PAD,
  PARAM_FLOATS,
} from "@/components/liquid-bubble-live/bubbleModes";
import { filmOverlayEffect } from "@/components/liquid-bubble-live/filmOverlayShader";
import type {
  BubbleOptics,
  BubbleUniforms,
} from "@/components/liquid-bubble-live/hooks/useBubbleOptics";
import {
  SoapFilmShader,
  type SoapFilmColorUniforms,
  type SoapFilmFlowUniforms,
} from "@/components/soap-film/SoapFilmShader";

// ============================================================================
// Types
// ============================================================================

/** One soap film, shared by every bubble that draws the overlay. */
export type BubbleFilm = {
  /** `useSoapFilmUniforms`' flow group; `flow.size` is the film canvas. */
  flow: SoapFilmFlowUniforms;
  /** `useSoapFilmUniforms`' color group. */
  color: SoapFilmColorUniforms;
  /** `getSoapFilmRampImage()` — the ramp LUT the color function needs. */
  ramp: SkImage;
};

export type BubbleFilmOverlayProps = {
  /** Slot in the flat buffer. */
  index: number;
  /** `useMultiBubblePhysics`'s flat buffer (12 floats per bubble). */
  paramBuffer: SharedValue<number[]>;
  /** The glass's uniforms, before `iFilm` is zeroed. */
  uniforms: DerivedValue<BubbleUniforms>;
  /** The live levers — `filmReach` is read here. */
  optics: BubbleOptics;
  film: BubbleFilm;
};

// ============================================================================
// Component
// ============================================================================

export function BubbleFilmOverlay({
  index,
  paramBuffer,
  uniforms,
  optics,
  film,
}: BubbleFilmOverlayProps) {
  const base = index * PARAM_FLOATS;
  const { flow, color, ramp } = film;

  const overlayUniforms = useDerivedValue(() => {
    const u = uniforms.value;
    return {
      iParams: paramBuffer.value.slice(base, base + PARAM_FLOATS),
      iFilm: u.iFilm,
      iFalloff: u.iOptics[3],
      uReach: optics.filmReach.value,
      uFilmSize: flow.size.value,
      uFilmColor: [
        color.mode.value,
        color.thicknessScale.value,
        color.intensity.value,
        color.opacity.value,
      ],
    };
  });

  // Circle bound on the harmonic shape, as in BaselineBubble — without the
  // refraction pad: the overlay draws only inside the rim.
  const bound = useDerivedValue(() => {
    const p = paramBuffer.value;
    const R = p[base + 2];
    if (!(R > 0)) {
      return rect(0, 0, 0, 0);
    }
    const h =
      R *
        (1 +
          Math.abs(p[base + 4]) +
          Math.abs(p[base + 6]) +
          Math.abs(p[base + 8])) +
      AA_PAD;
    return rect(p[base] - h, p[base + 1] - h, 2 * h, 2 * h);
  });

  return (
    <Rect rect={bound}>
      <Shader source={filmOverlayEffect} uniforms={overlayUniforms}>
        <SoapFilmShader generator="curl" output="thickness" flow={flow} />
        <ImageShader
          image={ramp}
          tx="repeat"
          ty="clamp"
          fit="none"
          sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
        />
      </Shader>
    </Rect>
  );
}
