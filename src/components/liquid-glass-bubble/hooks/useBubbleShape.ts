/**
 * Liquid Bubbles — bubble mode shape hook (divergence phase 6B)
 *
 * FLOW
 *   bubbleX/bubbleY/scaledRadius/isActive (from useBubblePanGesture /
 *   useBubblePinchGesture) → useFrameCallback('worklet') →
 *   stepBubbleModes (see bubbleModeMath.ts) → paramBuffer SharedValue<number[]>
 *   (12 floats, one of two buffers flipped each frame) + bboxX/Y/W/H
 *   SharedValues.
 *
 * KEY FEATURES
 *   - Zero per-frame allocation: the mode state, both output buffers and the
 *     scratch bbox are created ONCE, lazily, on the first frame, and filled
 *     in place afterwards. The frame callback never calls `new` or `.fill`
 *     on a steady-state frame.
 *   - All mutable state lives on the UI runtime (hung off `globalThis`
 *     there), not in JS module scope — same reasoning as the phase 3 Verlet
 *     hook this replaced (commit a724cc6; see
 *     `temp/liquid-bubbles-divergence.md`): a JS module-scope object
 *     captured by a worklet is cloned into a frozen shareable on the UI
 *     side, so the state has to be born on the runtime that mutates it.
 *   - Double-buffered `paramBuffer`: the shader always reads a fully-written
 *     buffer, never one being mutated mid-frame.
 *
 * Mounted in `LiquidBubbles.tsx` (phase 7B), replacing the phase 3/4 Verlet
 * ball-physics hook it superseded.
 */

import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import {
  createModeState,
  createParamBuffer,
  resetModeState,
  stepBubbleModes,
  type Bbox,
  type ModeState,
} from './bubbleModeMath';

// ============================================================================
// Types
// ============================================================================

/**
 * Mutable per-frame state, owned by the UI runtime. See `bubbleModeMath.ts`
 * / `bubbleModes.ts` for the tuning constants (K2..K4, C2..C4, SPEED_REF,
 * A2_REST..A4_REST, PHI3_REST, PHI4_REST, W_FLOOR_2..4, TAU_W, etc).
 */
type UiShape = {
  state: ModeState;
  bufA: number[];
  bufB: number[];
  useA: boolean;
  bbox: Bbox;
};

type UiShapeHost = { __liquidBubblesShape?: UiShape };

/** Key on the UI runtime's global object holding the singleton state. */
const UI_STATE_KEY = '__liquidBubblesShape';

export type UseBubbleShapeParams = {
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  scaledRadius: SharedValue<number>;
  /** 1 while a pan is active, 0 otherwise — drives the mode 3/4 release kick. */
  isActive: SharedValue<number>;
  /**
   * Gesture fling velocity (pt/s). Only the release kick reads this — the
   * amplitude kick (v3/v4) from its magnitude, and since phase 9B also the
   * traveling-wave kick (w2/w3/w4) from the turn between the last two
   * non-zero samples. Mode 2's drive still comes from the anchor's position
   * delta. Needed because the anchor tracks the finger directly, so on the
   * release frame the position delta is already ~0 and would give a kick of
   * zero.
   */
  velocityX: SharedValue<number>;
  velocityY: SharedValue<number>;
};

export type UseBubbleShapeReturn = {
  /** 12-float `iParams` buffer: [0] cx,cy,R,_ [1] a2,phi2,a3,phi3 [2] a4,phi4,filmPhase,_ */
  paramBuffer: SharedValue<number[]>;
  bboxX: SharedValue<number>;
  bboxY: SharedValue<number>;
  bboxW: SharedValue<number>;
  bboxH: SharedValue<number>;
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
}: UseBubbleShapeParams): UseBubbleShapeReturn {
  const paramBuffer = useSharedValue<number[]>([]);
  const bboxX = useSharedValue<number>(0);
  const bboxY = useSharedValue<number>(0);
  const bboxW = useSharedValue<number>(0);
  const bboxH = useSharedValue<number>(0);
  // Per-mount flag (fresh SharedValue per hook call) so a remount re-anchors
  // the shape instead of inheriting the previous mount's modes across a
  // center/radius jump.
  const initialized = useSharedValue<boolean>(false);

  useFrameCallback((frameInfo) => {
    'worklet';
    const cx = bubbleX.value;
    const cy = bubbleY.value;
    const R = scaledRadius.value;

    const host = globalThis as unknown as UiShapeHost;
    let ui = host[UI_STATE_KEY];

    if (ui === undefined) {
      // First frame ever on this runtime: allocate everything once, here, so
      // the objects belong to the UI runtime and stay mutable.
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
      initialized.value = true;
    }

    const dtMs = frameInfo.timeSincePreviousFrame ?? 16.7;
    const outBuf = ui.useA ? ui.bufB : ui.bufA;
    // Pass the velocity components through directly — the traveling-wave
    // turn (phase 9B) needs the VECTOR, not just its magnitude, to tell a
    // clockwise fling from a counter-clockwise one.
    stepBubbleModes(
      ui.state,
      cx,
      cy,
      R,
      isActive.value,
      velocityX.value,
      velocityY.value,
      dtMs,
      outBuf,
      ui.bbox,
    );
    ui.useA = !ui.useA;

    paramBuffer.value = outBuf;
    bboxX.value = ui.bbox.x;
    bboxY.value = ui.bbox.y;
    bboxW.value = ui.bbox.w;
    bboxH.value = ui.bbox.h;
  }, true);

  return { paramBuffer, bboxX, bboxY, bboxW, bboxH };
}
