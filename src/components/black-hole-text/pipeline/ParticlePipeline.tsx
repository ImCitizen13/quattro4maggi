/**
 * ParticlePipeline
 *
 * Composes buffers + physics source + driver + renderer.
 *
 * FLOW:
 * 1. Measure the container via onLayout (renders nothing until measured);
 *    every layout also writes the cx/cy SharedValues read by physics + disc
 * 2. Driver allocates MAX_PARTICLES once (on the UI runtime) and steps the
 *    first `activeCount.value` of them each frame
 * 3. Renderer draws one Atlas; count changes flow through `activeCount`
 *    (SharedValue), so the renderer is never remounted
 * 4. Changing count never reseeds: existing particles keep their orbits
 */

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { DEFAULT_MASS, MAX_PARTICLES } from "./constants";
import { useUiDriver } from "./drivers/useUiDriver";
import { ParticleRenderer } from "./ParticleRenderer";
import { dummyOrbits } from "./sources/dummyOrbits";
import type { Bounds, PhysicsSource } from "./types";

/** UI-runtime registry slot shared by the driver and renderer */
const BUFFER_KEY = "black-hole";

// ============================================================================
// Types
// ============================================================================

export type ParticlePipelineProps = {
  /** Particles drawn, read by the driver and the renderer on the UI thread */
  activeCount: SharedValue<number>;
  source?: PhysicsSource;
  /** Receives the driver's mean step ms SharedValue */
  stepMs: SharedValue<number>;
};

// ============================================================================
// Component
// ============================================================================

export function ParticlePipeline({
  activeCount,
  source = dummyOrbits,
  stepMs,
}: ParticlePipelineProps) {
  const [size, setSize] = useState<Bounds | null>(null);
  // Black hole center. Written on every layout, not seeded from the first
  // render: on iOS the screen is first laid out at full window height and
  // react-native-screens corrects it for the header in a later pass.
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    cx.set(width / 2);
    cy.set(height / 2);
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
          activeCount={activeCount}
          size={size}
          cx={cx}
          cy={cy}
          stepMs={stepMs}
        />
      )}
    </View>
  );
}

type PipelineInnerProps = {
  source: PhysicsSource;
  activeCount: SharedValue<number>;
  size: Bounds;
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  stepMs: SharedValue<number>;
};

function PipelineInner({
  source,
  activeCount,
  size,
  cx,
  cy,
  stepMs,
}: PipelineInnerProps) {
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
      activeCount={activeCount}
      bufferKey={BUFFER_KEY}
      frame={driver.frame}
      cx={cx}
      cy={cy}
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
