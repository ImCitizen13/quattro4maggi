/**
 * MetaballLiquidMetal
 *
 * Liquid metal whose silhouette is the smooth-MAX union of a baked path field
 * and N hidden metaballs. At rest the balls sit inside the shape (union is a
 * no-op → identical to the plain SDF metal). Two gestures drive it:
 *
 *   • TAP  → the balls fling outward and spring home (`dispersion` 0→1→0),
 *            the core recedes (`iBodyFade`), gooey necks stretch and snap.
 *   • PAN  → left/right cycles the shape; the previous field melts into the
 *            next one via the proven two-slot morph.
 *
 * FLOW:
 * 1. usePathSdf bakes the current shape's signed distance field (cached)
 * 2. A committed shape change loads the field into the hidden slot and springs
 *    iMorph toward it, so shapes melt/fuse instead of popping
 * 3. computeMetaballSites picks ball centers/radii from the field (JS side)
 * 4. The uniforms worklet packs live ball positions each frame; the ball loop
 *    is branched OUT (iBallCount = 0) whenever no burst is active, so idle cost
 *    equals the path-only shader exactly
 *
 * KEY FEATURES:
 * - Distinct shader (metaballLiquidMetalShader) — the band/edge/AA all follow
 *   the FUSED field, so balls wear the metal and grow real necks
 * - float4 ball uniforms (padding-invariant), inactive balls killed by a flag
 * - Zero idle regression: no burst → no loop → today's exact render
 *
 * @see MetaballLiquidMetal.ts (shader) · metaballSites.ts (placement)
 */

import {
  getMetalColors,
  type MetalPresetName,
  type RGB,
} from "@/lib/shaders/ColorsLiquidMetal";
import { metaballLiquidMetalShader } from "@/lib/shaders/MetaballLiquidMetal";
import {
  computeMetaballSites,
  packBalls,
  type MetaballSite,
} from "@/lib/shaders/metaballSites";
import { type PathSdf } from "@/lib/shaders/pathSdf";
import { prewarmPathSdf, usePathSdf } from "@/hooks/usePathSdf";
import {
  Canvas,
  Fill,
  FilterMode,
  Group,
  ImageShader,
  MipmapMode,
  Shader,
  Skia,
  useClock,
} from "@shopify/react-native-skia";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { PressableScale } from "pressto";
import React, { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import {
  SPRING_DISPERSE_BACK,
  SPRING_DISPERSE_OUT,
  SPRING_SDF_MORPH,
} from "@/lib/animations/constants";

// ============================================================================
// TYPES
// ============================================================================

export type MetaballLiquidMetalProps = {
  /** Ordered list of SVG path strings the pan gesture cycles through */
  svgPaths: string[];

  /** Width of the canvas @default 300 */
  width?: number;

  /** Height of the canvas @default 300 */
  height?: number;

  /** How many metaballs emerge on tap @default 16 */
  ballCount?: number;

  /**
   * "Stickiness" — smooth-max neck width, expressed as a FRACTION of the
   * shape's depth (maxInside), so the feel is consistent across thin and fat
   * shapes (the actual field-pixel k is this × the shape depth). Larger =
   * longer, gooier necks that bridge wider gaps. Roughly, balls stay connected
   * while stickiness ≳ 4 × spread. Number or SharedValue (live).
   *
   * NOTE: keep this LOW (≲0.1) for a clean reform. High stickiness merges the
   * balls hard into the body, so the last moments of the spring-back — balls
   * converging into the silhouette — carry a visible bulge that pops as it
   * settles. With the density `bridge` on, low stickiness is also the better
   * look (crisp balls joined by thin strings). @default 0.03
   */
  ballSmooth?: number | SharedValue<number>;

  /**
   * Multiplier on how far balls fly at full burst ("spread"). Lower = balls
   * stay close so the smooth-max bridges them into necks (sticky); higher =
   * they detach. Number or SharedValue (live). @default 1
   */
  spread?: number | SharedValue<number>;

  /**
   * Multiplier on ball radius ("size"). Number or SharedValue (live). Rest is
   * unaffected (balls are hidden), so this only changes the burst. @default 1
   */
  ballScale?: number | SharedValue<number>;

  /**
   * Enable the summed-density bridge: thin strings stretch between separating
   * balls (and thin out / snap) instead of the smooth-max's rounded merges.
   * @default false
   */
  bridge?: boolean;

  /**
   * "Stringiness" — the density kernel's reach as a multiple of ball radius.
   * Higher = strings hold across bigger gaps before snapping. Only matters when
   * `bridge` is on. Number or SharedValue (live). @default 2.6
   */
  stringiness?: number | SharedValue<number>;

  /** Metal preset name or 'custom' for custom colors @default 'silver' */
  metal?: MetalPresetName;
  /** Custom highlight color (required if metal is 'custom'), RGB 0-1 */
  customHighlight?: RGB;
  /** Custom shadow color (required if metal is 'custom'), RGB 0-1 */
  customShadow?: RGB;

  /** Background color [R, G, B, A] (0-1) @default transparent */
  colorBack?: [number, number, number, number];
  /** Tint color for color burn effect [R, G, B, A] @default no tint */
  colorTint?: [number, number, number, number];
  /** Blur/softness amount (0-1) @default 0 */
  softness?: number;
  /** Stripe pattern repetition count (1-20) @default 3 */
  repetition?: number;
  /** Red channel chromatic shift amount (0-1) @default 0.3 */
  shiftRed?: number;
  /** Blue channel chromatic shift amount (0-1) @default 0.3 */
  shiftBlue?: number;
  /** Noise distortion amount (0-1) @default 0.07 */
  distortion?: number;
  /** Edge/contour definition (0-1) @default 0.3 */
  contour?: number;
  /** Animation speed multiplier @default 1 */
  speed?: number;
  /** Iridescence intensity (0-1) @default 0 */
  iridescence?: number;
  /** Six rainbow color stops for iridescence, each RGB 0-1 */
  iridColors?: [RGB, RGB, RGB, RGB, RGB, RGB];
  /** Render the raw fused field with isolines instead of metal @default false */
  debug?: boolean;

  /** Show the prev/next shape-cycling buttons below the canvas @default true */
  showControls?: boolean;

  /**
   * VERIFICATION/TUNING ONLY: pin the dispersion at a constant (0 = home,
   * 1 = full burst) instead of animating it on tap. Lets you inspect the
   * metaballs at a frozen state. Leave undefined for normal tap behaviour.
   */
  holdDispersion?: number;
};

// Density-bridge shaping constants (tuned on-device). Threshold sets string
// thickness (higher = thinner); scale converts density units to pixels for the
// string's AA edge.
const BRIDGE_THRESHOLD = 0.58;
const BRIDGE_SCALE = 26;

// ============================================================================
// COMPONENT
// ============================================================================

export function MetaballLiquidMetal({
  svgPaths,
  width = 300,
  height = 300,
  ballCount = 32,
  ballSmooth = 0.03,
  spread = 1,
  ballScale = 1,
  bridge = false,
  stringiness = 2.6,
  metal = "silver",
  customHighlight,
  customShadow,
  colorBack = [0, 0, 0, 0],
  colorTint = [1, 1, 1, 0],
  softness = 0,
  repetition = 1,
  shiftRed = 0.3,
  shiftBlue = 0.3,
  distortion = 0.07,
  contour = 0.1,
  speed = 1,
  iridescence = 0,
  iridColors = [
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 1],
    [0, 0, 1],
    [1, 0, 1],
  ],
  debug = false,
  showControls = true,
  holdDispersion,
}: MetaballLiquidMetalProps) {
  // ============================================================================
  // SHAPE SELECTION (pan cycles the list)
  // ============================================================================

  const [index, setIndex] = useState(0);
  const svgPath = svgPaths[index] ?? svgPaths[0];
  const sdf = usePathSdf({ svgPath }, width, height);

  const cycle = (delta: number) => {
    setIndex((prev) => (prev + delta + svgPaths.length) % svgPaths.length);
  };

  // Prewarm the neighbours once the current shape has settled: idle-bake the
  // prev/next fields into the module cache so the next swipe lands on a warm
  // shape instead of a ~1.1s synchronous bake. Guarded by a ref so it fires
  // once per settle (render-time trigger, same pattern as the morph kick — no
  // useEffect). Only the very first shape ever bakes cold.
  const prewarmedForRef = useRef(-1);
  if (sdf && prewarmedForRef.current !== index) {
    prewarmedForRef.current = index;
    const n = svgPaths.length;
    prewarmPathSdf(
      [svgPaths[(index + 1) % n], svgPaths[(index - 1 + n) % n]],
      width,
      height
    );
  }

  // ============================================================================
  // SHAPE MORPH (two-slot field blend — identical to SdfLiquidMetalShader)
  // ============================================================================

  const morph = useSharedValue(0);
  const slotsRef = useRef<{
    a: PathSdf | null;
    b: PathSdf | null;
    showing: "a" | "b";
  }>({ a: null, b: null, showing: "a" });

  const slots = slotsRef.current;
  if (sdf) {
    const current = slots.showing === "a" ? slots.a : slots.b;
    if (
      !current ||
      current.width !== sdf.width ||
      current.height !== sdf.height
    ) {
      slots.a = sdf;
      slots.b = sdf;
    } else if (sdf !== current) {
      const target = slots.showing === "a" ? "b" : "a";
      slots[target] = sdf;
      slots.showing = target;
      queueMicrotask(() => {
        morph.value = withSpring(target === "b" ? 1 : 0, SPRING_SDF_MORPH);
      });
    }
  }
  const sdfA = slots.a ?? sdf;
  const sdfB = slots.b ?? sdf;

  // ============================================================================
  // METABALL SITES (from the freshly committed shape)
  // ============================================================================

  const sites: MetaballSite[] = useMemo(
    () => computeMetaballSites(sdf, { count: ballCount }),
    [sdf, ballCount]
  );
  const nBalls = sites.length;

  // ============================================================================
  // TAP DISPERSION
  // ============================================================================

  const dispersion = useSharedValue(0); // 0 = home, 1 = full burst

  // ============================================================================
  // TAP GESTURE → BURST
  // ============================================================================

  // Tap → balls fling out and spring home. Shape cycling is on explicit
  // buttons (below), NOT a pan — a Race(pan, tap) swallowed the tap on the
  // Skia Canvas. Use onEnd (the reliable recognized-tap callback for Tap;
  // onStart does not fire dependably here) and drive the spring on the UI
  // thread — no JS hop.
  const gesture = Gesture.Tap().onEnd((_e, success) => {
    if (!success) return;
    dispersion.value = withSequence(
      withSpring(1, SPRING_DISPERSE_OUT),
      withSpring(0, SPRING_DISPERSE_BACK)
    );
  });

  // ============================================================================
  // METAL COLORS + UNIFORMS
  // ============================================================================

  const metalColors = useMemo(
    () => getMetalColors(metal, customHighlight, customShadow),
    [metal, customHighlight, customShadow]
  );

  const clock = useClock();
  const sdfMaxA = sdfA?.maxDist ?? 1;
  const sdfMaxB = sdfB?.maxDist ?? 1;
  const sdfMaxInsideA = sdfA?.maxInside ?? 1;
  const sdfMaxInsideB = sdfB?.maxInside ?? 1;
  const sdfScale = sdf?.scale ?? 1;

  const uniforms = useDerivedValue(() => {
    const time = (clock.value / 1000) * speed;
    const disp = holdDispersion ?? dispersion.value;
    // Branch the ball loop OUT whenever no burst is active: idle render is then
    // byte-identical to the path-only shader.
    const active = disp > 0.001 ? nBalls : 0;
    // Bridge strength fades in with dispersion (smoothstep 0.05→0.25) so the
    // clustered rest/low-burst balls can't bulge the silhouette and pop.
    let bridgeStrength = 0;
    if (bridge) {
      const t = Math.min(Math.max((disp - 0.05) / 0.2, 0), 1);
      bridgeStrength = t * t * (3 - 2 * t);
    }
    return {
      iResolution: [width, height],
      iTime: time,
      iSdfMaxA: sdfMaxA,
      iSdfMaxB: sdfMaxB,
      iSdfMaxInsideA: sdfMaxInsideA,
      iSdfMaxInsideB: sdfMaxInsideB,
      iSdfScale: sdfScale,
      iMorph: morph.value,
      iDebug: debug ? 1 : 0,
      iColorBack: colorBack,
      iColorTint: colorTint,
      iColorHighlight: metalColors.highlight,
      iColorShadow: metalColors.shadow,
      iSoftness: softness,
      iRepetition: repetition,
      iShiftRed: shiftRed,
      iShiftBlue: shiftBlue,
      iDistortion: distortion,
      iContour: contour,
      iIridescence: iridescence,
      iIridColor0: iridColors[0],
      iIridColor1: iridColors[1],
      iIridColor2: iridColors[2],
      iIridColor3: iridColors[3],
      iIridColor4: iridColors[4],
      iIridColor5: iridColors[5],
      iBalls: packBalls(
        sites,
        disp,
        typeof spread === "number" ? spread : spread.value,
        typeof ballScale === "number" ? ballScale : ballScale.value
      ),
      iBallCount: active,
      // Erode past the medial axis (1.15×) at full burst so the body fully
      // dissolves into the balls, then reforms as dispersion springs home.
      iBodyErode: disp * 1.15,
      // Stickiness is a fraction of the shape depth → multiply by the (morph-
      // blended) mean inside distance to get the field-pixel smooth-max k, so
      // the same slider value gives proportional necks on any shape.
      iBallSmooth:
        (typeof ballSmooth === "number" ? ballSmooth : ballSmooth.value) *
        ((sdfMaxInsideA + sdfMaxInsideB) * 0.5),
      // Density bridge → thin stretching strings between separating balls
      iBridge: bridgeStrength,
      iBridgeReach:
        typeof stringiness === "number" ? stringiness : stringiness.value,
      iBridgeThreshold: BRIDGE_THRESHOLD,
      iBridgeScale: BRIDGE_SCALE,
    };
  });

  // ============================================================================
  // SHADER COMPILATION
  // ============================================================================

  const shader = useMemo(
    () => Skia.RuntimeEffect.Make(metaballLiquidMetalShader),
    []
  );

  if (!shader || !sdf) {
    console.error("MetaballLiquidMetal: failed to compile shader or bake SDF");
    return null;
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width, height }}>
          <Group>
            <Fill>
              <Shader source={shader} uniforms={uniforms}>
                <ImageShader
                  image={(sdfA ?? sdf).image}
                  fit="none"
                  sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
                />
                <ImageShader
                  image={(sdfB ?? sdf).image}
                  fit="none"
                  sampling={{ filter: FilterMode.Linear, mipmap: MipmapMode.None }}
                />
              </Shader>
            </Fill>
          </Group>
        </Canvas>
      </GestureDetector>

      {showControls && (
        <View style={styles.controls}>
          <PressableScale
            style={styles.navButton}
            onPress={() => cycle(-1)}
            accessibilityLabel="Previous shape"
          >
            <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
          </PressableScale>
          <PressableScale
            style={styles.navButton}
            onPress={() => cycle(1)}
            accessibilityLabel="Next shape"
          >
            <MaterialCommunityIcons name="chevron-right" size={26} color="#fff" />
          </PressableScale>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 20,
  },
  controls: {
    flexDirection: "row",
    gap: 24,
  },
  navButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#2E2E2E",
    alignItems: "center",
    justifyContent: "center",
  },
});
