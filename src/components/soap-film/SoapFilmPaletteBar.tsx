/**
 * SoapFilmPaletteBar — palette swatches pinned to the top of the screen.
 * First "Default" (the shader's bubble cosine palette), then "Film ramp"
 * (the built-in ramp LUT), then one per `LIVE_BORDER_PALETTES` (ramp mode).
 * Each pick reports a palette + color mode via `onSelect`. Centered when they fit, horizontally scrollable
 * otherwise. The wrapper passes touches through outside the swatches.
 */

import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, View } from "react-native";
import { PressableScale } from "pressto";

import { LIVE_BORDER_PALETTES } from "@/lib/palettes";
import { SOAP_RAMP_STOPS } from "@/lib/shaders/soapFilm";

import { FILM_MODE_UNIFORM } from "./soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

export type SoapFilmPaletteBarProps = {
  /** Selected ramp palette; `null` = a built-in look (see `colorMode`). */
  palette: readonly string[] | null;
  /** Current shader color mode (`FILM_MODE_UNIFORM` value). */
  colorMode: number;
  /** Color mode the "Default" swatch restores (the demo's default mode). */
  defaultMode: number;
  /** A swatch was picked: the palette to use and the color mode to switch to. */
  onSelect: (palette: readonly string[] | null, mode: number) => void;
};

// ============================================================================
// Constants
// ============================================================================

const SWATCH_SIZE = 36;

type GradientColors = [string, string, ...string[]];

const toRgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;

/** Default swatch: the shader's bubble cosine palette, sampled at 5 t in [0,1). */
const BUBBLE_SWATCH_COLORS = [0, 0.2, 0.4, 0.6, 0.8].map((t) =>
  toRgb(
    ...([0, 2.1, 4.2].map(
      (phase) => 0.5 + 0.5 * Math.cos(2 * Math.PI * t + phase),
    ) as [number, number, number]),
  ),
) as GradientColors;

/** Film-ramp swatch: a few evenly spaced stops of the built-in ramp. */
const RAMP_SWATCH_COLORS = [0, 4, 8, 12, 16].map((i) => {
  const [r, g, b] = SOAP_RAMP_STOPS[i];
  return toRgb(r, g, b);
}) as GradientColors;

// ============================================================================
// Component
// ============================================================================

export function SoapFilmPaletteBar({
  palette,
  colorMode,
  defaultMode,
  onSelect,
}: SoapFilmPaletteBarProps) {
  const bubbleActive =
    palette === null && colorMode === FILM_MODE_UNIFORM.bubble;
  const rampActive = palette === null && colorMode === FILM_MODE_UNIFORM.ramp;

  return (
    <View style={styles.bar} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <PressableScale
          accessibilityLabel="Default colors"
          onPress={() => onSelect(null, defaultMode)}
        >
          <LinearGradient
            colors={BUBBLE_SWATCH_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.swatch, bubbleActive && styles.swatchActive]}
          />
        </PressableScale>
        <PressableScale
          accessibilityLabel="Film ramp"
          onPress={() => onSelect(null, FILM_MODE_UNIFORM.ramp)}
        >
          <LinearGradient
            colors={RAMP_SWATCH_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.swatch, rampActive && styles.swatchActive]}
          />
        </PressableScale>
        {LIVE_BORDER_PALETTES.map((p, i) => (
          <PressableScale
            key={p.join()}
            accessibilityLabel={`Palette ${i + 1}`}
            onPress={() => onSelect(p, FILM_MODE_UNIFORM.ramp)}
          >
            <LinearGradient
              colors={p as unknown as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.swatch, palette === p && styles.swatchActive]}
            />
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
  },
  row: {
    // minWidth 100% + centering keeps swatches centered when they fit and
    // lets the row scroll when they overflow.
    minWidth: "100%",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 2,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: {
    borderColor: "#fff",
  },
});
