/**
 * ParticlePipeline
 *
 * Composes buffers + physics source + driver + renderer.
 *
 * FLOW:
 * 1. Measure the container via onLayout (renders nothing until measured)
 * 2. Driver allocates MAX_PARTICLES once (on the UI runtime) and steps the
 *    first `activeCount.value` of them each frame
 * 3. Renderer (remounted via `key` on count change) draws one Atlas
 * 4. Changing count never reseeds: existing particles keep their orbits
 */

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { DEFAULT_MASS, MAX_PARTICLES } from "./constants";
import { useUiDriver } from "./drivers/useUiDriver";
import { LayoutLogOverlay, markLayout } from "./layoutDebug";
import { ParticleRenderer } from "./ParticleRenderer";
import { dummyOrbits } from "./sources/dummyOrbits";
import type { Bounds, PhysicsSource } from "./types";

/** UI-runtime registry slot shared by the driver and renderer */
const BUFFER_KEY = "black-hole";

// ============================================================================
// Types
// ============================================================================

export type ParticlePipelineProps = {
  /** Particles drawn; remounts the renderer only */
  count: number;
  /** Same value as `count`, read by the driver on the UI thread */
  activeCount: SharedValue<number>;
  source?: PhysicsSource;
  /** Receives the driver's mean step ms SharedValue */
  stepMs: SharedValue<number>;
};

// ============================================================================
// Component
// ============================================================================

export function ParticlePipeline({
  count,
  activeCount,
  source = dummyOrbits,
  stepMs,
}: ParticlePipelineProps) {
  const [size, setSize] = useState<Bounds | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height, y } = e.nativeEvent.layout;
    markLayout(`canvas onLayout y=${y.toFixed(1)} h=${height.toFixed(1)}`); // TEMP
    setSize((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height }
    );
  };

  return (
    <View style={styles.container} onLayout={onLayout}>
      {size && (
        <PipelineInner
          source={source}
          count={count}
          activeCount={activeCount}
          size={size}
          stepMs={stepMs}
        />
      )}
      <LayoutLogOverlay />
    </View>
  );
}

type PipelineInnerProps = {
  source: PhysicsSource;
  count: number;
  activeCount: SharedValue<number>;
  size: Bounds;
  stepMs: SharedValue<number>;
};

function PipelineInner({
  source,
  count,
  activeCount,
  size,
  stepMs,
}: PipelineInnerProps) {
  const cx = useSharedValue(size.width / 2);
  const cy = useSharedValue(size.height / 2);
  // TEMP: SharedValue keeps its first value; the prop does not
  markLayout(
    `PipelineInner render prop cy=${(size.height / 2).toFixed(1)} sv cy=${cy.get().toFixed(1)}`
  );
  const mass = useSharedValue(DEFAULT_MASS);
  const timeScale = useSharedValue(1);

  const driver = useUiDriver({
    source,
    bufferKey: BUFFER_KEY,
    capacity: MAX_PARTICLES,
    count: activeCount,
    bounds: size,
    params: { cx, cy, mass, timeScale },
    stepMs,
  });

  return (
    <ParticleRenderer
      key={count}
      count={count}
      bufferKey={BUFFER_KEY}
      frame={driver.frame}
      cx={size.width / 2}
      cy={size.height / 2}
    />
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
