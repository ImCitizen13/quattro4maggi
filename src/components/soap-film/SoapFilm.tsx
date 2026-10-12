/**
 * SoapFilm
 *
 * Demo screen: a centered squircle, filled either with a flat placeholder
 * color or with the live `SoapFilmShader` iridescence, crossfaded between
 * the two. Drag on the shape to inject flow disturbances; pinch or use the
 * tuning panel to resize it.
 *
 * FLOW:
 * 1. `useSquirclePath` builds the superellipse outline on the UI thread from
 *    `scale`/`exponent` shared values.
 * 2. `useClock` + `useFilmTouches` drive the shader's time and 8-slot touch
 *    ring buffer; `useSoapFilmUniforms` owns every other tunable uniform.
 * 3. Two `<Path>`s share the same outline: one flat-filled (`filmOn` → 0),
 *    one shader-filled (`filmOn` → 1), each wrapped in a `<Group opacity>`
 *    so the toggle crossfades with `withSpring` instead of popping.
 * 4. A rim stroke is drawn on top in both states.
 * 5. `SoapFilmTuningPanel` exposes every live uniform; `Film: On/Off` and a
 *    pinch gesture sit outside the panel.
 *
 * KEY FEATURES:
 * - Pan gesture over the shape feeds `useFilmTouches`' ring buffer — no
 *   React re-render per touch, no feedback buffer (see soapFilm.ts).
 * - Scale responds to both a pinch gesture and the tuning panel's slider,
 *   both writing the same `withSpring`-animated `SharedValue`.
 */

import {
  Canvas,
  Group,
  Path,
  type SkSize,
} from "react-native-skia";
import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  type GestureUpdateEvent,
  type PinchGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import {
  clamp,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import {
  SPRING_FILM_CROSSFADE,
  SPRING_SQUIRCLE_SCALE,
} from "@/lib/animations/constants";

import { useClock } from "./hooks/useClock";
import { useFilmTouches } from "./hooks/useFilmTouches";
import { useSoapFilmUniforms } from "./hooks/useSoapFilmUniforms";
import { useSquirclePath } from "./hooks/useSquirclePath";
import { SoapFilmShader } from "./SoapFilmShader";
import { SoapFilmPaletteBar } from "./SoapFilmPaletteBar";
import { SoapFilmTuningPanel } from "./SoapFilmTuningPanel";
import {
  SQUIRCLE_BASE_SIZE,
  SQUIRCLE_EXPONENT_DEFAULT,
  SQUIRCLE_SCALE_DEFAULT,
  SQUIRCLE_SCALE_MAX,
  SQUIRCLE_SCALE_MIN,
  type FilmGenerator,
} from "./soapFilmConfig";

// ============================================================================
// Types
// ============================================================================

export type SoapFilmProps = {
  /** Mount `SoapFilmTuningPanel`. @default true */
  showTuningPanel?: boolean;
};

// ============================================================================
// Component
// ============================================================================

export function SoapFilm({ showTuningPanel = true }: SoapFilmProps) {
  // Canvas size, not window size — the canvas sits below the header.
  // Written by `<Canvas onSize>` on the UI thread — no re-render on layout.
  const canvasSize = useSharedValue<SkSize>({ width: 0, height: 0 });

  const [generator, setGenerator] = useState<FilmGenerator>("curl");
  // `null` = the default soap-film ramp.
  const [palette, setPalette] = useState<readonly string[] | null>(null);

  // ==========================================================================
  // Shape
  // ==========================================================================

  const scale = useSharedValue(SQUIRCLE_SCALE_DEFAULT);
  const exponent = useSharedValue(SQUIRCLE_EXPONENT_DEFAULT);
  const savedScale = useSharedValue(SQUIRCLE_SCALE_DEFAULT);

  const halfSize = useDerivedValue(
    () => SQUIRCLE_BASE_SIZE * scale.value,
  );
  const path = useSquirclePath({ canvasSize, halfSize, exponent });

  // ==========================================================================
  // Gestures — pinch resizes (spring), pan feeds the touch ring buffer
  // ==========================================================================

  const onPinchBegin = () => {
    "worklet";
    savedScale.value = scale.value;
  };

  const onPinchUpdate = (
    e: GestureUpdateEvent<PinchGestureHandlerEventPayload>,
  ) => {
    "worklet";
    scale.value = withSpring(
      clamp(savedScale.value * e.scale, SQUIRCLE_SCALE_MIN, SQUIRCLE_SCALE_MAX),
      SPRING_SQUIRCLE_SCALE,
    );
  };

  const pinchGesture = useMemo(
    () => Gesture.Pinch().onBegin(onPinchBegin).onUpdate(onPinchUpdate),
    [],
  );

  const time = useClock();
  const { touch, touchAge, panGesture } = useFilmTouches({ time });

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture],
  );

  // ==========================================================================
  // Shader uniforms
  // ==========================================================================

  const size = useDerivedValue(
    () => [canvasSize.value.width, canvasSize.value.height] as [number, number],
  );

  const { flow, color, defaults } = useSoapFilmUniforms({
    time,
    size,
    touch,
    touchAge,
  });

  // ==========================================================================
  // Color mode + palette — shared by the top bar and the tuning panel
  // ==========================================================================

  // Mirrors `color.mode` (a SharedValue) so the panel's active button can
  // re-render — reading a SharedValue in the render body doesn't subscribe.
  const [colorMode, setColorMode] = useState<number>(defaults.mode);

  const changeColorMode = (mode: number) => {
    color.mode.value = mode;
    setColorMode(mode);
  };

  const selectLook = (next: readonly string[] | null, mode: number) => {
    setPalette(next);
    changeColorMode(mode);
  };

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composedGesture}>
        <Canvas style={styles.canvas} onSize={canvasSize}>
          <Group>
            <Path path={path} style="fill">
              <SoapFilmShader
                generator={generator}
                flow={flow}
                color={color}
                rampColors={palette ?? undefined}
              />
            </Path>
          </Group>

          <Path
            path={path}
            style="stroke"
            strokeWidth={1.5}
            color="rgba(255,255,255,0.35)"
          />
        </Canvas>
      </GestureDetector>

      <SoapFilmPaletteBar
        palette={palette}
        colorMode={colorMode}
        defaultMode={defaults.mode}
        onSelect={selectLook}
      />

      {showTuningPanel && (
        <SoapFilmTuningPanel
          scale={scale}
          scaleDefault={SQUIRCLE_SCALE_DEFAULT}
          exponent={exponent}
          exponentDefault={SQUIRCLE_EXPONENT_DEFAULT}
          generator={generator}
          onGeneratorChange={setGenerator}
          onPaletteChange={setPalette}
          colorMode={colorMode}
          onColorModeChange={changeColorMode}
          flow={flow}
          color={color}
          defaults={defaults}
        />
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  canvas: {
    flex: 1,
  },
});
