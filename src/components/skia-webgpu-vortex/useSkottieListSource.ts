import {
  createSkiaTexture,
  getSkiaDevice,
} from "@/components/black-hole-gpu/dev/skiaSharedTexture";
import type { TextureSource } from "@/components/black-hole-gpu/vortexSource";
import { SPRING_SKOTTIE_LIST_EDGE } from "@/lib/animations/constants";
import { useEffect, useMemo, useRef } from "react";
import { PixelRatio } from "react-native";
import { Gesture, type PanGesture } from "react-native-gesture-handler";
import {
  type SharedValue,
  cancelAnimation,
  useSharedValue,
  withDecay,
  withSpring,
} from "react-native-reanimated";
import { type SkSkottieAnimation, Skia } from "react-native-skia";
import {
  type SkottieListLayout,
  createSkottieListLayout,
  fitInCard,
  getVisibleCards,
} from "./skottieListLayout";

// ============================================================================
// Types
// ============================================================================

/** Stage size in layout points (from `onLayout`), or null before layout. */
export type SkottieStage = { width: number; height: number } | null;

/** What `useSkottieListSource` returns. `source`/`drawSource`/`gesture` are null until the stage is measured. */
export type SkottieListSource = {
  /** Pass to `VortexCanvas` `source`. */
  source: TextureSource | null;
  /** Pass to `VortexCanvas` `drawSource` (UI-runtime worklet). */
  drawSource: ((t: number) => void) | null;
  /** Vertical pan; wrap the canvas in a `GestureDetector`. */
  gesture: PanGesture | null;
  /** Set `.value = false` to freeze scrolling (task 34: while the vortex runs). */
  scrollEnabled: SharedValue<boolean>;
  /** Current scroll offset in physical px (0 = top). */
  offset: SharedValue<number>;
  /** Geometry used for the current texture. */
  layout: SkottieListLayout | null;
};

type LoadedAnimation = {
  animation: SkSkottieAnimation;
  /** Loop length, seconds. */
  duration: number;
  fps: number;
  width: number;
  height: number;
};

type Built = {
  texture: GPUTexture;
  source: TextureSource;
  drawSource: (t: number) => void;
  gesture: PanGesture;
  layout: SkottieListLayout;
};

// ============================================================================
// Constants
// ============================================================================

/** Lottie assets shown in the list (dark variants + the two plain ones). */
const LOTTIE_ASSETS = [
  require("../../../assets/lottie/8-fold_dark.json"),
  require("../../../assets/lottie/live-border_dark.json"),
  require("../../../assets/lottie/liquid-metal_dark.json"),
  require("../../../assets/lottie/ripple_dark.json"),
  require("../../../assets/lottie/scale-flip-card_dark.json"),
  require("../../../assets/lottie/wabi-and-more_dark.json"),
  require("../../../assets/lottie/q4m-animated-icon.json"),
  require("../../../assets/lottie/default_lottie.json"),
] as const;

const BACKGROUND = "#1a1a1a";
const CARD = "#262626";

/** Wait before destroying a texture: the canvas tears down its scene first. */
const DESTROY_DELAY_MS = 200;
/** Drag resistance beyond the scroll edges. */
const OVERSCROLL_RESISTANCE = 0.4;

// ============================================================================
// Helpers
// ============================================================================

let loaded: LoadedAnimation[] | null = null;

/** Parse each Lottie once (JS thread) and keep the Skottie instances. */
const loadAnimations = (): LoadedAnimation[] => {
  loaded ??= LOTTIE_ASSETS.map((json) => {
    const animation = Skia.Skottie.Make(JSON.stringify(json));
    const size = animation.size();
    return {
      animation,
      duration: animation.duration(),
      fps: animation.fps(),
      width: size.width,
      height: size.height,
    };
  });
  return loaded;
};

/**
 * Build everything Skia-side on the JS thread (texture, surface, canvas,
 * paints) and capture it into the `drawSource` worklet; bundle mode would
 * re-evaluate a `Skia` import on the UI runtime, so the worklet never touches it.
 */
const build = (
  width: number,
  height: number,
  dpr: number,
  offset: SharedValue<number>,
  scrollEnabled: SharedValue<boolean>,
  start: SharedValue<number>,
): Built => {
  const anims = loadAnimations();
  const layout = createSkottieListLayout(width, height, dpr, anims.length);
  const texture = createSkiaTexture(width, height);
  const surface = Skia.Surface.MakeFromGPUTexture(texture);
  const canvas = surface.getCanvas();
  const background = Skia.Color(BACKGROUND);
  const cardPaint = Skia.Paint();
  cardPaint.setColor(Skia.Color(CARD));
  cardPaint.setAntiAlias(true);

  const animations = anims.map((a) => a.animation);
  const durations = anims.map((a) => a.duration);
  const fpsList = anims.map((a) => a.fps);
  const fits = anims.map((a) => fitInCard(layout, a.width, a.height));

  const drawSource = (t: number) => {
    "worklet";
    canvas.clear(background);
    const cards = getVisibleCards(layout, offset.value);
    const seconds = t / 1000;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const fit = fits[card.index];
      canvas.save();
      canvas.translate(card.x, card.y);
      canvas.drawRRect(
        {
          rect: { x: 0, y: 0, width: card.width, height: card.height },
          rx: layout.radius,
          ry: layout.radius,
        },
        cardPaint,
      );
      canvas.translate(fit.x, fit.y);
      const anim = animations[card.index];
      anim.seekFrame((seconds % durations[card.index]) * fpsList[card.index]);
      anim.render(canvas, { x: 0, y: 0, width: fit.width, height: fit.height });
      canvas.restore();
    }
    surface.flush();
  };

  const maxOffset = layout.maxOffset;
  const gesture = Gesture.Pan()
    .onBegin(() => {
      "worklet";
      cancelAnimation(offset);
      start.value = offset.value;
    })
    .onUpdate((e) => {
      "worklet";
      if (!scrollEnabled.value) return;
      const raw = start.value - e.translationY;
      if (raw < 0) offset.value = raw * OVERSCROLL_RESISTANCE;
      else if (raw > maxOffset)
        offset.value = maxOffset + (raw - maxOffset) * OVERSCROLL_RESISTANCE;
      else offset.value = raw;
    })
    .onEnd((e) => {
      "worklet";
      if (!scrollEnabled.value) return;
      const v = offset.value;
      if (v < 0 || v > maxOffset) {
        offset.value = withSpring(v < 0 ? 0 : maxOffset, {
          ...SPRING_SKOTTIE_LIST_EDGE,
          velocity: -e.velocityY,
        });
      } else {
        offset.value = withDecay({
          velocity: -e.velocityY,
          clamp: [0, maxOffset],
        });
      }
    });

  return {
    texture,
    layout,
    drawSource,
    gesture,
    source: { kind: "texture", texture, device: getSkiaDevice(), live: true },
  };
};

// ============================================================================
// Hook
// ============================================================================

/**
 * A scrollable list of Skottie animations that Skia draws into a shared GPU
 * texture every frame, ready to be the vortex's live source (task 34 mounts it
 * into `VortexCanvas`).
 *
 * FLOW: stage size (pt) ─► round(size * dpr) px texture on the shared device ─►
 * `drawSource(t)` on the UI runtime: clear #1a1a1a, draw only the visible cards
 * (rounded rect + animation seeked to `t mod duration`), `flush()` ─► the
 * canvas samples it. A vertical pan drives the `offset` SharedValue (clamped in
 * the worklet, spring at the edges, decay inside).
 *
 * KEY FEATURES:
 * - Lottie JSON parsed and `Skottie.Make`d once, shared across stage resizes.
 * - Crisp at DPR: the texture is physical px, layout values scale by dpr.
 * - Never snapshots (`asImage` / `makeImageSnapshot`): zero-copy surface.
 * - Ownership: the hook creates and destroys its texture (delayed, after the
 *   canvas tears down its scene). Draw cost shows up as `sourceMs` in
 *   `VortexCanvas` `onStats`.
 * - `scrollEnabled.value = false` freezes the pan (while the vortex runs).
 *
 * @example
 * const list = useSkottieListSource(stage);
 * {list.source && list.drawSource && list.gesture && (
 *   <GestureDetector gesture={list.gesture}>
 *     <VortexCanvas source={list.source} drawSource={list.drawSource} />
 *   </GestureDetector>
 * )}
 */
export function useSkottieListSource(stage: SkottieStage): SkottieListSource {
  const offset = useSharedValue(0);
  const scrollEnabled = useSharedValue(true);
  const start = useSharedValue(0);

  const width = stage ? Math.round(stage.width * PixelRatio.get()) : 0;
  const height = stage ? Math.round(stage.height * PixelRatio.get()) : 0;

  const built = useMemo(
    () =>
      width > 0 && height > 0
        ? build(width, height, PixelRatio.get(), offset, scrollEnabled, start)
        : null,
    [width, height, offset, scrollEnabled, start],
  );

  // Destroy the previous texture after the canvas rebuilt its scene, and the
  // current one on unmount.
  const prev = useRef<GPUTexture | null>(null);
  useEffect(() => {
    const old = prev.current;
    prev.current = built?.texture ?? null;
    if (old && old !== built?.texture) {
      setTimeout(() => old.destroy(), DESTROY_DELAY_MS);
    }
  }, [built]);
  useEffect(
    () => () => {
      const tex = prev.current;
      prev.current = null;
      if (tex) setTimeout(() => tex.destroy(), DESTROY_DELAY_MS);
    },
    [],
  );

  return {
    source: built?.source ?? null,
    drawSource: built?.drawSource ?? null,
    gesture: built?.gesture ?? null,
    layout: built?.layout ?? null,
    scrollEnabled,
    offset,
  };
}
