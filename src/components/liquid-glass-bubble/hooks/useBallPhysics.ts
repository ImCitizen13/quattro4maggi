/**
 * Liquid Bubbles — ball physics (Phase 3)
 *
 * FLOW
 *   bubbleX/bubbleY/scaledRadius (from useBubbleGestures) →
 *   useFrameCallback('worklet') → stepBallPhysics (see ballPhysicsMath.ts) →
 *   ballBuffer SharedValue<number[]> (48 floats, one of two buffers flipped
 *   each frame) + bboxX/Y/W/H SharedValues.
 *
 * KEY FEATURES
 *   - Zero per-frame allocation: the Verlet position arrays, both output
 *     buffers and the scratch bbox are created ONCE, lazily, on the first
 *     frame, and filled in place afterwards. The frame callback never calls
 *     `new` or `.fill` on a steady-state frame.
 *   - All mutable state lives on the UI runtime (hung off `globalThis` there),
 *     not in JS module scope. A JS module-scope array captured by a worklet is
 *     cloned into a frozen shareable on the UI side — writing to it throws in
 *     dev and silently diverges in release — so the state has to be born on
 *     the runtime that mutates it.
 *   - Double-buffered `ballBuffer`: the shader always reads a fully-written
 *     buffer, never one being mutated mid-frame.
 *
 * Does not modify `useBubbleGestures.tsx` — only consumes its SharedValues.
 */

import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import {
  createBallBuffer,
  createBallPhysicsState,
  resetBallPhysicsState,
  stepBallPhysics,
  type BallPhysicsState,
  type Bbox,
} from './ballPhysicsMath';

// ============================================================================
// Types
// ============================================================================

/**
 * Mutable per-frame state, owned by the UI runtime. See `ballPhysicsMath.ts`
 * for the tuning constants (K_FRONT, K_BACK, DAMPING, ITER, RING_STIFF,
 * SPOKE_STIFF, SNAP_FACTOR, BBOX_*).
 */
type UiPhysics = {
  state: BallPhysicsState;
  bufA: number[];
  bufB: number[];
  useA: boolean;
  bbox: Bbox;
};

type UiPhysicsHost = { __liquidBubblesPhysics?: UiPhysics };

/** Key on the UI runtime's global object holding the singleton state. */
const UI_STATE_KEY = '__liquidBubblesPhysics';

export type UseBallPhysicsParams = {
  bubbleX: SharedValue<number>;
  bubbleY: SharedValue<number>;
  scaledRadius: SharedValue<number>;
};

export type UseBallPhysicsReturn = {
  /** 48-float [x, y, r, active] × 12 buffer, ready for the `iBalls` uniform. */
  ballBuffer: SharedValue<number[]>;
  bboxX: SharedValue<number>;
  bboxY: SharedValue<number>;
  bboxW: SharedValue<number>;
  bboxH: SharedValue<number>;
};

// ============================================================================
// Hook
// ============================================================================

export function useBallPhysics({
  bubbleX,
  bubbleY,
  scaledRadius,
}: UseBallPhysicsParams): UseBallPhysicsReturn {
  const ballBuffer = useSharedValue<number[]>([]);
  const bboxX = useSharedValue<number>(0);
  const bboxY = useSharedValue<number>(0);
  const bboxW = useSharedValue<number>(0);
  const bboxH = useSharedValue<number>(0);
  // Per-mount flag (fresh SharedValue per hook call) so a remount re-anchors
  // the cluster instead of inheriting the previous mount's positions across a
  // center/radius jump.
  const initialized = useSharedValue<boolean>(false);

  useFrameCallback((frameInfo) => {
    'worklet';
    const cx = bubbleX.value;
    const cy = bubbleY.value;
    const R = scaledRadius.value;

    const host = globalThis as unknown as UiPhysicsHost;
    let ui = host[UI_STATE_KEY];

    if (ui === undefined) {
      // First frame ever on this runtime: allocate everything once, here, so
      // the objects belong to the UI runtime and stay mutable.
      ui = {
        state: createBallPhysicsState(cx, cy, R),
        bufA: createBallBuffer(),
        bufB: createBallBuffer(),
        useA: true,
        bbox: { x: 0, y: 0, w: 0, h: 0 },
      };
      host[UI_STATE_KEY] = ui;
      initialized.value = true;
    } else if (!initialized.value) {
      // Remount onto existing state: re-anchor in place, no allocation.
      resetBallPhysicsState(ui.state, cx, cy, R);
      initialized.value = true;
    }

    const dtMs = frameInfo.timeSincePreviousFrame ?? 16.7;
    const outBuf = ui.useA ? ui.bufB : ui.bufA;
    stepBallPhysics(ui.state, cx, cy, R, dtMs, outBuf, ui.bbox);
    ui.useA = !ui.useA;

    ballBuffer.value = outBuf;
    bboxX.value = ui.bbox.x;
    bboxY.value = ui.bbox.y;
    bboxW.value = ui.bbox.w;
    bboxH.value = ui.bbox.h;
  }, true);

  return { ballBuffer, bboxX, bboxY, bboxW, bboxH };
}
