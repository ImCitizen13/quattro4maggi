/**
 * MorphingLiquidMetal
 *
 * Mixes the two effects: the shape renders as liquid metal, and every path
 * change transitions through particles — the metal particalizes into dots
 * (pre-assembled as the old shape, so the swap is seamless), the dots swarm
 * into the new shape, then the liquid metal fades back in.
 *
 * FLOW:
 * 1. phase "metal": SdfLiquidMetalShader renders the current path
 * 2. Path prop changes → render-phase guard captures {from: old, to: new}
 *    and switches to phase "particles"
 * 3. ParticlePathAssembly mounts with fromPath=old (dots start as the old
 *    silhouette), morphs to the new shape
 * 4. onSettled → back to phase "metal" with the new path, fading in
 * 5. Path changes mid-transition just retarget `to` — the mounted particle
 *    view morphs in place from wherever the dots are
 *
 * KEY FEATURES:
 * - No useEffect: prop-change detection is a render-phase ref guard
 * - Seamless handoffs: dots inherit the old silhouette, metal fades in
 * - All SdfLiquidMetalShader metal props pass through
 */

import { usePathSdf } from "@/hooks/usePathSdf";
import { type SkPath } from "@shopify/react-native-skia";
import React, { useRef, useState } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { ParticlePathAssembly } from "./ParticlePathAssembly";
import {
  SdfLiquidMetalShader,
  type SdfLiquidMetalShaderProps,
} from "./SdfLiquidMetalShader";

// ============================================================================
// TYPES
// ============================================================================

type PathSource = { svgPath?: string; path?: SkPath };

export type MorphingLiquidMetalProps = SdfLiquidMetalShaderProps & {
  /** Dot color during the particle transition @default "#dcdce2" */
  particleColor?: string;

  /** Number of dots in the transition @default 500 */
  dotCount?: number;

  /** Particle transition duration in ms @default 1800 */
  transitionDuration?: number;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function MorphingLiquidMetal({
  svgPath,
  path,
  particleColor = "#dcdce2",
  dotCount = 500,
  transitionDuration = 1800,
  width = 300,
  height = 300,
  ...metalProps
}: MorphingLiquidMetalProps) {
  const [transition, setTransition] = useState<{
    from: PathSource;
    to: PathSource;
  } | null>(null);

  // One bake per path change, owned here — it runs while the particle
  // transition plays, so the field is already warm when the metal shader
  // remounts on settle (and nothing downstream re-rasterizes the path)
  const sdf = usePathSdf({ svgPath, path }, width, height);

  // Render-phase change detection: the path identity (SkPath object or SVG
  // string) differing from what we last saw starts/retargets a transition
  const key = path ?? svgPath;
  const seenRef = useRef<{ key: unknown; source: PathSource }>({
    key,
    source: { svgPath, path },
  });
  if (seenRef.current.key !== key) {
    // Mid-transition changes keep the original `from`; the mounted particle
    // view morphs in place from wherever its dots currently are
    const from = transition ? transition.from : seenRef.current.source;
    seenRef.current = { key, source: { svgPath, path } };
    setTransition({ from, to: { svgPath, path } });
  }

  const settle = () => setTransition(null);

  if (transition) {
    return (
      <ParticlePathAssembly
        svgPath={transition.to.svgPath}
        path={transition.to.path}
        fromSvgPath={transition.from.svgPath}
        fromPath={transition.from.path}
        width={width}
        height={height}
        dotCount={dotCount}
        color={particleColor}
        duration={transitionDuration}
        onSettled={settle}
      />
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(350)}>
      <SdfLiquidMetalShader
        svgPath={svgPath}
        path={path}
        sdf={sdf}
        width={width}
        height={height}
        {...metalProps}
      />
    </Animated.View>
  );
}
