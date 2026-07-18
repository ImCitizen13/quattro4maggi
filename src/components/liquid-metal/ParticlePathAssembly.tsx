/**
 * ParticlePathAssembly
 *
 * Particalizes a path: the shape is sampled into dots, the dots start
 * scattered randomly across the canvas, then fly along curved paths and
 * assemble into the shape.
 *
 * FLOW:
 * 1. Fit the path (SVG string or SkPath) into the canvas
 * 2. Rasterize it offscreen once; sample the filled area into ~dotCount
 *    target points (alpha-threshold grid sampling with jitter)
 * 3. Each dot gets a random start, a curved control point, a stagger and a
 *    size — all precomputed, seeded per replay
 * 4. One `progress` value (0→1) drives every dot on the UI thread: position
 *    is a quadratic bezier from start→target, eased per-dot with stagger
 * 5. All dots render as a single Atlas draw call (one sprite, N transforms)
 *
 * KEY FEATURES:
 * - Single draw call for hundreds of dots (Skia drawAtlas)
 * - Per-dot stagger + curved trajectories → organic swarm gathering
 * - Tap to re-scatter with a fresh random seed and replay
 * - Auto-plays on mount and whenever the path changes (no useEffect)
 */

import {
  Atlas,
  Canvas,
  Skia,
  useRSXformBuffer,
  type SkPath,
  type SkRect,
} from "@shopify/react-native-skia";
import React, { useMemo, useRef, useState } from "react";
import { Pressable } from "react-native";
import {
  Easing,
  ReduceMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// ============================================================================
// TYPES
// ============================================================================

export type ParticlePathAssemblyProps = {
  /** SVG path string (the "d" attribute) */
  svgPath?: string;

  /** Ready SkPath (e.g. from Skia.Path.MakeFromText). Takes precedence */
  path?: SkPath;

  /** Canvas width @default 300 */
  width?: number;

  /** Canvas height @default 300 */
  height?: number;

  /** Number of dots to assemble @default 500 */
  dotCount?: number;

  /** Dot radius in points @default 2.2 */
  dotRadius?: number;

  /** Dot color @default "#dcdce2" */
  color?: string;

  /** Total gather duration in ms @default 2400 */
  duration?: number;

  /**
   * Overrides the tap action. Default tap re-scatters and replays; pass this
   * to repurpose the tap (e.g. cycle to the next shape — the path change
   * then morphs the dots in place).
   */
  onPress?: () => void;
};

// ============================================================================
// HELPERS
// ============================================================================

const SPRITE_SIZE = 24;

/** Deterministic PRNG so a given seed always produces the same scatter */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fit the source path into the canvas (same fitting as the SDF shader) */
const fitPath = (
  svgPath: string | undefined,
  path: SkPath | undefined,
  width: number,
  height: number
): SkPath | null => {
  const p = path ? path.copy() : svgPath ? Skia.Path.MakeFromSVGString(svgPath) : null;
  if (!p) return null;
  const bounds = p.getBounds();
  if (!bounds.width || !bounds.height) return null;

  const margin = 0.1;
  const scale = Math.min(
    (width * (1 - 2 * margin)) / bounds.width,
    (height * (1 - 2 * margin)) / bounds.height
  );
  const offsetX = (width - bounds.width * scale) / 2;
  const offsetY = (height - bounds.height * scale) / 2;
  p.transform(
    Skia.Matrix()
      .translate(-bounds.x, -bounds.y)
      .scale(scale, scale)
      .translate(offsetX / scale, offsetY / scale)
  );
  return p;
};

/** Rasterize the fitted path and sample its filled area into target points */
const sampleTargets = (
  fitted: SkPath,
  width: number,
  height: number,
  dotCount: number,
  rand: () => number
): Float32Array | null => {
  const w = Math.round(width);
  const h = Math.round(height);
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) return null;

  const paint = Skia.Paint();
  paint.setColor(Skia.Color("white"));
  surface.getCanvas().drawPath(fitted, paint);
  const pixels = surface.makeImageSnapshot().readPixels();
  if (!pixels) return null;

  const isFloat = pixels instanceof Float32Array;
  const threshold = isFloat ? 0.5 : 127;

  // Collect every inside pixel on a stride-2 grid, then shuffle and keep N
  const candidates: number[] = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (pixels[(y * w + x) * 4 + 3] > threshold) candidates.push(x, y);
    }
  }
  const total = candidates.length / 2;
  if (total === 0) return null;

  // Fisher-Yates on point indices
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const xi = candidates[i * 2];
    const yi = candidates[i * 2 + 1];
    candidates[i * 2] = candidates[j * 2];
    candidates[i * 2 + 1] = candidates[j * 2 + 1];
    candidates[j * 2] = xi;
    candidates[j * 2 + 1] = yi;
  }

  // Always exactly dotCount targets: wrap when the shape has fewer sample
  // points, so every dot has a destination and shape-to-shape morphs keep a
  // stable 1:1 dot mapping
  const targets = new Float32Array(dotCount * 2);
  for (let i = 0; i < dotCount; i++) {
    const c = i % total;
    // ±1px jitter so the stride-2 grid doesn't read as a lattice (and so
    // wrapped dots don't sit exactly on top of each other)
    targets[i * 2] = candidates[c * 2] + (rand() * 2 - 1);
    targets[i * 2 + 1] = candidates[c * 2 + 1] + (rand() * 2 - 1);
  }
  return targets;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ParticlePathAssembly({
  svgPath,
  path,
  width = 300,
  height = 300,
  dotCount = 500,
  dotRadius = 2.2,
  color = "#dcdce2",
  duration = 2400,
  onPress,
}: ParticlePathAssemblyProps) {
  const [seed, setSeed] = useState(1);

  // ============================================================================
  // SAMPLING — targets from the path, scatter/trajectory per seed
  // ============================================================================

  const targets = useMemo(() => {
    const fitted = fitPath(svgPath, path, width, height);
    if (!fitted) return null;
    return sampleTargets(fitted, width, height, dotCount, mulberry32(7));
  }, [svgPath, path, width, height, dotCount]);

  // Previous shape's targets: when the path changes, dots shift from where
  // they are instead of re-scattering. Random scatter only on first mount
  // and on tap-replay (seed change).
  const prevTargetsRef = useRef<Float32Array | null>(null);
  const prevSeedRef = useRef(seed);

  const scatter = useMemo(() => {
    if (!targets) return null;
    const n = targets.length / 2;
    const rand = mulberry32(seed * 7919 + 13);
    const prev = prevTargetsRef.current;
    const morphFrom =
      seed === prevSeedRef.current &&
      prev !== null &&
      prev !== targets &&
      prev.length === targets.length
        ? prev
        : null;
    const starts = new Float32Array(n * 2);
    const ctrls = new Float32Array(n * 2);
    const staggers = new Float32Array(n);
    const sizes = new Float32Array(n);

    // Morphs travel short distances shape-to-shape: gentler curves and a
    // tighter stagger read as one mass shifting rather than a new swarm
    const bendAmp = morphFrom ? 0.35 : 0.8;
    const staggerAmp = morphFrom ? 0.3 : 0.45;

    for (let i = 0; i < n; i++) {
      let sx: number;
      let sy: number;
      if (morphFrom) {
        sx = morphFrom[i * 2];
        sy = morphFrom[i * 2 + 1];
      } else {
        // Random dots anywhere on the canvas (slightly past the edges)
        sx = (rand() * 1.2 - 0.1) * width;
        sy = (rand() * 1.2 - 0.1) * height;
      }
      starts[i * 2] = sx;
      starts[i * 2 + 1] = sy;

      // Curved flight: control point off the straight line's midpoint
      const tx = targets[i * 2];
      const ty = targets[i * 2 + 1];
      const dx = tx - sx;
      const dy = ty - sy;
      const bend = (rand() - 0.5) * bendAmp;
      ctrls[i * 2] = sx + dx * 0.5 - dy * bend;
      ctrls[i * 2 + 1] = sy + dy * 0.5 + dx * bend;

      // Each dot animates in a 0.55-wide window offset by its stagger
      staggers[i] = rand() * staggerAmp;
      sizes[i] = 0.7 + rand() * 0.6;
    }
    return { starts, ctrls, staggers, sizes, n };
  }, [targets, seed, width, height]);

  // Record what this render is assembling toward — the next path change
  // morphs from here (render-phase ref writes; the memo above already ran)
  prevTargetsRef.current = targets;
  prevSeedRef.current = seed;

  // ============================================================================
  // ANIMATION — one progress value drives the whole swarm
  // ============================================================================

  const progress = useSharedValue(0);

  const play = () => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration,
      easing: Easing.linear, // per-dot easing lives in the worklet
      reduceMotion: ReduceMotion.System,
    });
  };

  // Auto-play on mount and whenever the sampled path changes (no useEffect:
  // the guard runs during render, the write is deferred past the render)
  const lastPlayed = useRef<Float32Array | null>(null);
  if (targets && lastPlayed.current !== targets) {
    lastPlayed.current = targets;
    queueMicrotask(play);
  }

  const replay = () => {
    setSeed((s) => s + 1); // fresh scatter
    play();
  };

  // ============================================================================
  // RENDER — one sprite, N transforms, single draw call
  // ============================================================================

  const sprite = useMemo(() => {
    const surface = Skia.Surface.MakeOffscreen(SPRITE_SIZE, SPRITE_SIZE);
    if (!surface) return null;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    const c = SPRITE_SIZE / 2;
    // Soft halo under a solid core
    paint.setColor(Skia.Color(color));
    paint.setAlphaf(0.25);
    surface.getCanvas().drawCircle(c, c, c - 1, paint);
    paint.setAlphaf(1);
    surface.getCanvas().drawCircle(c, c, c * 0.62, paint);
    // Detach from the offscreen GPU context — a texture-backed snapshot is
    // not drawable in the on-screen canvas's context
    return surface.makeImageSnapshot().makeNonTextureImage();
  }, [color]);

  const n = scatter?.n ?? 0;
  const sprites = useMemo<SkRect[]>(
    () =>
      Array.from({ length: n }, () =>
        Skia.XYWHRect(0, 0, SPRITE_SIZE, SPRITE_SIZE)
      ),
    [n]
  );

  const starts = scatter?.starts;
  const ctrls = scatter?.ctrls;
  const staggers = scatter?.staggers;
  const sizes = scatter?.sizes;
  const targetArr = targets ?? undefined;
  const baseScale = (dotRadius * 2) / (SPRITE_SIZE * 0.62);

  const transforms = useRSXformBuffer(n, (xf, i) => {
    "worklet";
    if (!starts || !ctrls || !staggers || !sizes || !targetArr) return;
    const stag = staggers[i];
    const t = Math.min(Math.max((progress.value - stag) / 0.55, 0), 1);
    const e = 1 - (1 - t) * (1 - t) * (1 - t); // easeOutCubic

    const sx = starts[i * 2];
    const sy = starts[i * 2 + 1];
    const cx = ctrls[i * 2];
    const cy = ctrls[i * 2 + 1];
    const tx = targetArr[i * 2];
    const ty = targetArr[i * 2 + 1];

    // Quadratic bezier start → ctrl → target
    const u = 1 - e;
    const x = u * u * sx + 2 * u * e * cx + e * e * tx;
    const y = u * u * sy + 2 * u * e * cy + e * e * ty;

    // Dots shrink slightly as they settle into the shape
    const scale = baseScale * sizes[i] * (1.25 - 0.25 * e);
    xf.set(scale, 0, x - (scale * SPRITE_SIZE) / 2, y - (scale * SPRITE_SIZE) / 2);
  });

  if (!sprite || !scatter) return null;

  return (
    <Pressable onPress={onPress ?? replay}>
      <Canvas style={{ width, height }}>
        <Atlas image={sprite} sprites={sprites} transforms={transforms} />
      </Canvas>
    </Pressable>
  );
}
