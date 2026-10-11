/**
 * SoapFilmPaletteBar — palette swatches pinned to the top of the screen.
 * A "Default" swatch (the built-in film ramp) followed by one per
 * `LIVE_BORDER_PALETTES`. Centered when they fit, horizontally scrollable
 * otherwise. The wrapper passes touches through outside the swatches.
 */

import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, View } from "react-native";
import { PressableScale } from "pressto";

import { LIVE_BORDER_PALETTES } from "@/lib/palettes";
import { SOAP_RAMP_STOPS } from "@/lib/shaders/soapFilm";

// ============================================================================
// Types
// ============================================================================

export type SoapFilmPaletteBarProps = {
  /** Selected ramp palette; `null` = the default film colors. */
  palette: readonly string[] | null;
  onPaletteChange: (palette: readonly string[] | null) => void;
};

// ============================================================================
// Constants
// ============================================================================

const SWATCH_SIZE = 36;

/** Default-film swatch: a few evenly spaced stops of the built-in ramp. */
const DEFAULT_SWATCH_COLORS = [0, 4, 8, 12, 16].map((i) => {
  const [r, g, b] = SOAP_RAMP_STOPS[i];
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}) as [string, string, ...string[]];

// ============================================================================
// Component
// ============================================================================

export function SoapFilmPaletteBar({
  palette,
  onPaletteChange,
}: SoapFilmPaletteBarProps) {
  return (
    <View style={styles.bar} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <PressableScale onPress={() => onPaletteChange(null)}>
          <LinearGradient
            colors={DEFAULT_SWATCH_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.swatch, palette === null && styles.swatchActive]}
          />
        </PressableScale>
        {LIVE_BORDER_PALETTES.map((p) => (
          <PressableScale key={p.join()} onPress={() => onPaletteChange(p)}>
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
