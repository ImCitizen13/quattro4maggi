/**
 * Liquid Bubbles — bubble mode shape hook (drives the physics each frame).
 * Design notes: README.md → "hooks/useBubbleShape.ts".
 */

import {
  useFrameCallback,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import {
  createModeState,
  createParamBuffer,
  resetModeState,
  stepBubbleModes,
  type Bbox,
  type ModeState,
} from "./bubbleModeMath";

// ============================================================================
// Types
// ============================================================================

/** Mutable per-frame state, owned by the UI runtime (constants in `bubbleModes.ts`). */
type UiShape = {
  state: ModeState;
  bufA: number[];
  bufB: number[];
  useA: boolean;
  bbox: Bbox;
};

type UiShapeHost = { __liquidBubblesShape?: UiShape };

/** Key on the UI runtime's global object holding the singleton state. */
const UI_STATE_KEY = "__liquidBubblesShape";

export type UseBubbleShapeParams = {
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  scaledRadius: SharedValue<number>;
  /** 1 while a pan is active, 0 otherwise — drives the mode 3/4 release kick. */
  isActive: SharedValue<number>;
  /** Gesture fling velocity (pt/s); only the release kick reads it (the anchor's position delta is ~0 on release). */
  velocityX: SharedValue<number>;
  velocityY: SharedValue<number>;
  /** Master wobble multiplier for mode 3/4: 0 smooth, 1 tuned, 2 double. */
  wobble: DerivedValue<number>;
  /** Per-bubble inertia: > 1 heavier (rings longer, bigger kick), < 1 lighter. */
  inertia: DerivedValue<number>;
  /** Per-bubble strength: > 1 stiffer (snaps back faster), < 1 wobbles longer. */
  strength: DerivedValue<number>;
  /** Optional birth deformation `[a2, phi2, a3, phi3, a4, phi4]` (fractions of R) applied after a re-anchor; empty = none. */
  birthShape?: SharedValue<number[]>;
};

export type UseBubbleShapeReturn = {
  /** 12-float `iParams` buffer: [0] cx,cy,R,_ [1] a2,phi2,a3,phi3 [2] a4,phi4,filmPhase,_ */
  paramBuffer: SharedValue<number[]>;
  bboxX: SharedValue<number>;
  bboxY: SharedValue<number>;
  bboxW: SharedValue<number>;
  bboxH: SharedValue<number>;
  /** True once anchored at the current center; write `false` to re-anchor after a teleport (else a huge-speed stretch kick). */
  anchored: SharedValue<boolean>;
};

// ============================================================================
// Hook
// ============================================================================

export function useBubbleShape({
  bubbleX,
  bubbleY,
  scaledRadius,
  isActive,
  velocityX,
  velocityY,
  wobble,
  inertia,
  strength,
  birthShape,
}: UseBubbleShapeParams): UseBubbleShapeReturn {
  const paramBuffer = useSharedValue<number[]>([]);
  const bboxX = useSharedValue<number>(0);
  const bboxY = useSharedValue<number>(0);
  const bboxW = useSharedValue<number>(0);
  const bboxH = useSharedValue<number>(0);
  // Per-mount flag so a remount re-anchors instead of inheriting old modes.
  const initialized = useSharedValue<boolean>(false);

  useFrameCallback((frameInfo) => {
    "worklet";
    const cx = bubbleX.value;
    const cy = bubbleY.value;
    const R = scaledRadius.value;

    const host = globalThis as unknown as UiShapeHost;
    let ui = host[UI_STATE_KEY];

    if (ui === undefined) {
      // First frame on this runtime: allocate here so the objects stay mutable.
      ui = {
        state: createModeState(cx, cy),
        bufA: createParamBuffer(),
        bufB: createParamBuffer(),
        useA: true,
        bbox: { x: 0, y: 0, w: 0, h: 0 },
      };
      host[UI_STATE_KEY] = ui;
      initialized.value = true;
    } else if (!initialized.value) {
      // Remount onto existing state: re-anchor in place, no allocation.
      resetModeState(ui.state, cx, cy);
      // Birth deformation; mode 2 goes in as the (c2, s2) vector.
      const birth = birthShape ? birthShape.value : undefined;
      if (birth !== undefined && birth.length === 6) {
        ui.state.c2 = birth[0] * Math.cos(birth[1]);
        ui.state.s2 = birth[0] * Math.sin(birth[1]);
        ui.state.a2 = birth[0];
        ui.state.phi2 = birth[1];
        ui.state.a3 = birth[2];
        ui.state.phi3 = birth[3];
        ui.state.a4 = birth[4];
        ui.state.phi4 = birth[5];
      }
      initialized.value = true;
    }

    const dtMs = frameInfo.timeSincePreviousFrame ?? 16.7;
    const outBuf = ui.useA ? ui.bufB : ui.bufA;
    // Velocity components, not magnitude: the turn needs handedness.
    stepBubbleModes(
      ui.state,
      cx,
      cy,
      R,
      wobble.value,
      isActive.value,
      velocityX.value,
      velocityY.value,
      dtMs,
      outBuf,
      ui.bbox,
      inertia.value,
      strength.value,
    );
    ui.useA = !ui.useA;

    paramBuffer.value = outBuf;
    bboxX.value = ui.bbox.x;
    bboxY.value = ui.bbox.y;
    bboxW.value = ui.bbox.w;
    bboxH.value = ui.bbox.h;
  }, true);

  return { paramBuffer, bboxX, bboxY, bboxW, bboxH, anchored: initialized };
}
