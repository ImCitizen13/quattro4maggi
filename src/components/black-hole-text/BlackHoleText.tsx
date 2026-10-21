/**
 * BlackHoleText
 *
 * Multi-threading showcase: a particle vortex orbiting a black hole. The
 * physics source is swappable; the render path (Skia Atlas) is fixed.
 *
 * FLOW:
 * 1. Holds the selected particle count (state for the renderer, SharedValue
 *    for the UI-thread driver)
 * 2. ParticlePipeline allocates 100K particles once, steps the active prefix
 *    of the dummy orbit source on the UI thread and draws one Atlas; raising
 *    the count adds particles without reseeding the existing ones
 * 3. PipelineHud shows source / count / mean step ms and the count chips;
 *    FpsOverlay shows the UI-thread frame rate
 *
 * KEY FEATURES:
 * - Count picker 1K..100K
 * - No per-frame allocation, single draw call
 * - Phase 1: dummy Kepler orbits (inner faster than outer)
 */

import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { FpsOverlay } from "@/components/common/FpsOverlay";
import { DEFAULT_PARTICLE_COUNT } from "./pipeline/constants";
import { ParticlePipeline } from "./pipeline/ParticlePipeline";
import { PipelineHud } from "./pipeline/PipelineHud";
import { dummyOrbits } from "./pipeline/sources/dummyOrbits";

// ============================================================================
// Types
// ============================================================================

export type BlackHoleTextProps = Record<string, never>;

// ============================================================================
// Component
// ============================================================================

export function BlackHoleText(_props: BlackHoleTextProps) {
  const [count, setCount] = useState<number>(DEFAULT_PARTICLE_COUNT);
  const activeCount = useSharedValue(DEFAULT_PARTICLE_COUNT);
  const stepMs = useSharedValue(0);

  const onCountChange = (next: number) => {
    activeCount.set(next);
    setCount(next);
  };

  return (
    <View style={styles.container}>
      <ParticlePipeline
        count={count}
        activeCount={activeCount}
        source={dummyOrbits}
        stepMs={stepMs}
      />
      <PipelineHud
        sourceName={dummyOrbits.name}
        count={count}
        onCountChange={onCountChange}
        stepMs={stepMs}
      />
      <FpsOverlay dark />
    </View>
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
