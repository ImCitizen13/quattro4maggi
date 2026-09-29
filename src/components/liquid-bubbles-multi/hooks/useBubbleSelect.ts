/**
 * useBubbleSelect — press an intro bubble: it rises to the top centre, the
 * others scroll off the top, and the detail card slides up under it.
 * Design notes: README.md → "hooks/useBubbleSelect.ts".
 *
 * FLOW:
 *   open(i)  — selected = i, `select` springs 0 → 1, React learns `i`
 *   every wrapped bubble reads its intro position, then:
 *     the chosen one  → lerp to (width / 2, SELECT_TOP_GAP + r) by `select`
 *     the others      → up by height × SELECT_SCROLL_MUL[i] × `select`
 *   cardTop → lerp from the canvas bottom to just under the chosen bubble
 *   close()  — `select` springs back to 0; only once it lands does
 *     `selected` clear (so the bubbles lerp home along the same path) and
 *     React unmount the card
 *
 * KEY FEATURES:
 * - One `withSpring` value drives everything — bubble, scroll and card move
 *   as one gesture and settle together.
 * - The wrapped bubbles go to the physics like any `PinnedBubble`, so the
 *   glass wobbles off the motion with no extra shape work (the same trick
 *   the intro's travel curve uses).
 * - At `select` = 0 the wrap is exact pass-through: the intro, the scrub bar
 *   and the drift are untouched until a bubble is pressed.
 */

import { useMemo, useState } from "react";
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { SPRING_BUBBLE_SELECT } from "@/lib/animations/constants";

import {
  SELECT_CARD_GAP,
  SELECT_SCROLL_MUL,
  SELECT_TOP_GAP,
} from "../multiBubbleConfig";
import type { IntroBubble } from "./useIntroTimeline";

// ============================================================================
// Types
// ============================================================================

export type UseBubbleSelectParams = {
  /** The intro's four bubbles, in slot order. */
  bubbles: IntroBubble[];
  /** Canvas size, pt. */
  width: number;
  height: number;
};

export type UseBubbleSelectReturn = {
  /** `bubbles`, with the selection motion applied — hand these to the physics and labels. */
  bubbles: IntroBubble[];
  /** 0 = nothing chosen, 1 = the chosen bubble at the top, card in place. */
  select: SharedValue<number>;
  /** Index of the chosen bubble, -1 when none (set until the close lands). */
  selected: SharedValue<number>;
  /** The chosen bubble for React (mounts the card), null when none. */
  activeIndex: number | null;
  /** The card's top edge, pt. */
  cardTop: DerivedValue<number>;
  /** Worklet: choose bubble `i`. */
  open: (i: number) => void;
  /** Worklet: send it back. */
  close: () => void;
};

// ============================================================================
// Hook
// ============================================================================

export function useBubbleSelect({
  bubbles,
  width,
  height,
}: UseBubbleSelectParams): UseBubbleSelectReturn {
  const select = useSharedValue(0);
  const selected = useSharedValue(-1);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const centerX = width / 2;

  const wrapped: IntroBubble[] = [];
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const scroll = height * SELECT_SCROLL_MUL[i % SELECT_SCROLL_MUL.length];

    /* eslint-disable react-hooks/rules-of-hooks */
    const x = useDerivedValue(() => {
      const base = b.x.value;
      if (selected.value !== i) {
        return base;
      }
      return base + (centerX - base) * select.value;
    });
    const y = useDerivedValue(() => {
      const base = b.y.value;
      const sel = selected.value;
      if (sel < 0) {
        return base;
      }
      if (sel !== i) {
        return base - scroll * select.value;
      }
      const targetY = SELECT_TOP_GAP + b.r.value;
      return base + (targetY - base) * select.value;
    });
    /* eslint-enable react-hooks/rules-of-hooks */

    wrapped.push({ ...b, x, y });
  }

  // Resting top edge: just under the chosen bubble at its final spot. Starts
  // at the canvas bottom, so the card rises in from off-screen.
  const cardTop = useDerivedValue(() => {
    const sel = selected.value;
    const r = sel >= 0 ? bubbles[sel].r.value : 0;
    const restTop = SELECT_TOP_GAP + 2 * r + SELECT_CARD_GAP;
    return height + (restTop - height) * select.value;
  });

  const { open, close } = useMemo(
    () => ({
      open: (i: number) => {
        "worklet";
        selected.value = i;
        select.value = withSpring(1, SPRING_BUBBLE_SELECT);
        scheduleOnRN(setActiveIndex, i);
      },
      close: () => {
        "worklet";
        select.value = withSpring(0, SPRING_BUBBLE_SELECT, (finished) => {
          // A re-open mid-flight cancels this spring (finished = false), so
          // it never clears a selection that has since been made.
          if (finished) {
            selected.value = -1;
            scheduleOnRN(setActiveIndex, null);
          }
        });
      },
    }),
    // Shared values and the state setter are stable for the mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
    bubbles: wrapped,
    select,
    selected,
    activeIndex,
    cardTop,
    open,
    close,
  };
}
