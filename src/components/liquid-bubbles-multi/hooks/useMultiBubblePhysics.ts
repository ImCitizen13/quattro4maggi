/**
 * Liquid Bubbles Multi — physics for N bubbles in ONE frame callback.
 * Design notes: README.md → "hooks/useMultiBubblePhysics.ts".
 *
 * FLOW (UI worklet, one `useFrameCallback`):
 *   for each bubble i < count:
 *     stepBubbleFloat(float[i])                 → x, y, R, traits
 *     spawned → scheduleOnRN(onSpawn, i)
 *     needsAnchor → resetModeState + birth shape (a teleport is not motion)
 *     stepBubbleModes(mode[i], x, y, R, …)     → 12 floats
 *     copy into out[i·12 … i·12 + 11], grow the union bbox
 *   pinned slots (i ≥ count): position + radius from the caller, then the
 *     same stepBubbleModes — anchored the first frame their radius > 0
 *   waiting / unused slots → 12 zeros (R = 0: nothing to draw)
 *   paramBuffer = out  (double-buffered), bbox = union
 *
 * KEY FEATURES:
 * - Replaces, for this demo only, the `useBubbleShape` singleton: its own
 *   UI-runtime key (`__liquidBubblesMulti`), so it never touches the single
 *   bubble's state.
 * - Float runs BEFORE the modes in the same frame, so the buffer's center
 *   and radius are this frame's (no one-frame lag between the float and the
 *   glass).
 * - Zero per-frame allocation: all state is built once per mount on the UI
 *   runtime, then mutated in place.
 * - Sliders are the base; each bubble multiplies them by its own traits.
 */

import {
  useFrameCallback,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { PARAM_FLOATS } from "../../liquid-bubble-live/bubbleModes";
import {
  createModeState,
  createParamBuffer,
  resetModeState,
  stepBubbleModes,
  type Bbox,
  type ModeState,
} from "../../liquid-bubble-live/hooks/bubbleModeMath";
import { MAX_BUBBLES, MULTI_PARAM_FLOATS } from "../multiBubbleConfig";
import {
  PHASE_WAIT,
  createFloatEnv,
  createFloatState,
  stepBubbleFloat,
  type FloatEnv,
  type FloatState,
} from "./multiBubbleMath";

// ============================================================================
// Types
// ============================================================================

type UiMulti = {
  floats: FloatState[];
  modes: ModeState[];
  env: FloatEnv;
  /** One bubble's 12 floats, copied into the flat buffer. */
  scratch: number[];
  bbox: Bbox;
  bufA: number[];
  bufB: number[];
  useA: boolean;
  /**
   * Per slot: false until that pinned bubble's modes are anchored at its
   * first visible position, so being placed is never read as motion.
   */
  pinnedAnchored: boolean[];
};

type UiMultiHost = { __liquidBubblesMulti?: UiMulti };

export type UseMultiBubblePhysicsParams = {
  /** Bubbles to run, clamped to `MAX_BUBBLES`. Fixed for the mount. */
  count: number;
  /** Canvas size, points. */
  width: number;
  height: number;
  /** Spawn box top-center, canvas points. */
  spawnX: number;
  spawnY: number;
  /** Mean birth radius, points. */
  restRadius: number;
  /** 1 = float, 0 = park. */
  enabled: SharedValue<number>;
  /** Slider bases, × each bubble's traits. */
  buoyancy: SharedValue<number>;
  wobble: SharedValue<number>;
  inertia: SharedValue<number>;
  strength: SharedValue<number>;
  /** JS-thread callback fired with the bubble's index at each spawn. */
  onSpawn?: (index: number) => void;
  /**
   * Pinned bubbles, taking the slots right after the floaters (`count`,
   * `count + 1`, …). They don't float: each sits at (`x`, `y`) with radius
   * `r` (r ≤ 0 hides it), and moving one still drives the shape like a drag.
   * The array's length is fixed for the mount.
   */
  pinned?: readonly PinnedBubble[];
};

/** One caller-driven bubble: position and radius, all on the UI thread. */
export type PinnedBubble = {
  x: DerivedValue<number>;
  y: DerivedValue<number>;
  r: DerivedValue<number>;
  /** Multiplies the wobble slider for this bubble only (default 1). */
  wobbleMul?: number;
};

export type UseMultiBubblePhysicsReturn = {
  /**
   * `MULTI_PARAM_FLOATS` floats: bubble i at `i · 12`, same layout as
   * `iParams` — [cx, cy, R, _, a2, phi2, a3, phi3, a4, phi4, filmPhase, _].
   * R = 0 marks a slot with nothing to draw.
   */
  paramBuffer: SharedValue<number[]>;
  /** Box around every visible bubble's shape (w = h = 0 when none). */
  bboxX: SharedValue<number>;
  bboxY: SharedValue<number>;
  bboxW: SharedValue<number>;
  bboxH: SharedValue<number>;
};

// ============================================================================
// Hook
// ============================================================================

export function useMultiBubblePhysics({
  count,
  width,
  height,
  spawnX,
  spawnY,
  restRadius,
  enabled,
  buoyancy,
  wobble,
  inertia,
  strength,
  onSpawn,
  pinned,
}: UseMultiBubblePhysicsParams): UseMultiBubblePhysicsReturn {
  const pinnedCount = Math.min(pinned?.length ?? 0, MAX_BUBBLES);
  // The pinned bubbles take the slots after the floaters, so leave room.
  const n = Math.min(
    Math.max(Math.floor(count), 0),
    MAX_BUBBLES - pinnedCount,
  );

  // Zeroed from the start so a shader reading it before the first frame gets
  // the right uniform size.
  const paramBuffer = useSharedValue<number[]>(
    new Array<number>(MULTI_PARAM_FLOATS).fill(0),
  );
  const bboxX = useSharedValue<number>(0);
  const bboxY = useSharedValue<number>(0);
  const bboxW = useSharedValue<number>(0);
  const bboxH = useSharedValue<number>(0);
  // Per-mount flag: a remount rebuilds the state instead of inheriting it.
  const initialized = useSharedValue<boolean>(false);

  useFrameCallback((frameInfo) => {
    "worklet";
    const host = globalThis as unknown as UiMultiHost;
    let ui = host.__liquidBubblesMulti;

    if (ui === undefined || !initialized.value) {
      // Once per mount: build everything on the UI runtime so it stays
      // mutable (a JS-side object would arrive frozen).
      const floats: FloatState[] = [];
      const modes: ModeState[] = [];
      for (let i = 0; i < MAX_BUBBLES; i++) {
        floats.push(createFloatState(i));
        modes.push(createModeState(spawnX, spawnY));
      }
      const bufA: number[] = [];
      const bufB: number[] = [];
      for (let i = 0; i < MULTI_PARAM_FLOATS; i++) {
        bufA.push(0);
        bufB.push(0);
      }
      const pinnedAnchored: boolean[] = [];
      for (let i = 0; i < MAX_BUBBLES; i++) {
        pinnedAnchored.push(false);
      }
      ui = {
        floats,
        modes,
        env: createFloatEnv(),
        scratch: createParamBuffer(),
        bbox: { x: 0, y: 0, w: 0, h: 0 },
        bufA,
        bufB,
        useA: true,
        pinnedAnchored,
      };
      host.__liquidBubblesMulti = ui;
      initialized.value = true;
    }

    const env = ui.env;
    env.spawnX = spawnX;
    env.spawnY = spawnY;
    env.width = width;
    env.height = height;
    env.restRadius = restRadius;
    env.enabled = enabled.value;
    env.buoyancy = buoyancy.value;
    env.inertia = inertia.value;

    const dtMs = frameInfo.timeSincePreviousFrame ?? 16.7;
    const wob = wobble.value;
    const iner = inertia.value;
    const str = strength.value;
    const out = ui.useA ? ui.bufB : ui.bufA;
    const scratch = ui.scratch;
    const bbox = ui.bbox;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < MAX_BUBBLES; i++) {
      const base = i * PARAM_FLOATS;
      const f = ui.floats[i];

      // ---- Pinned bubbles: no float, position from the caller ----
      if (pinned !== undefined && i >= n && i < n + pinnedCount) {
        const p = pinned[i - n];
        const pr = p.r.value;
        if (!(pr > 0)) {
          // Not out yet (or already gone): nothing to draw, and it must
          // re-anchor wherever it next appears.
          for (let k = 0; k < PARAM_FLOATS; k++) {
            out[base + k] = 0;
          }
          ui.pinnedAnchored[i] = false;
          continue;
        }
        const px = p.x.value;
        const py = p.y.value;
        const mode = ui.modes[i];
        if (!ui.pinnedAnchored[i]) {
          resetModeState(mode, px, py);
          ui.pinnedAnchored[i] = true;
        }
        stepBubbleModes(
          mode,
          px,
          py,
          pr,
          wob * (p.wobbleMul ?? 1),
          0,
          0,
          0,
          dtMs,
          scratch,
          bbox,
          iner,
          str,
        );
        for (let k = 0; k < PARAM_FLOATS; k++) {
          out[base + k] = scratch[k];
        }
        if (bbox.x < minX) minX = bbox.x;
        if (bbox.y < minY) minY = bbox.y;
        if (bbox.x + bbox.w > maxX) maxX = bbox.x + bbox.w;
        if (bbox.y + bbox.h > maxY) maxY = bbox.y + bbox.h;
        continue;
      }

      if (i < n && stepBubbleFloat(f, env, dtMs, Math.random) && onSpawn) {
        scheduleOnRN(onSpawn, i);
      }

      if (i >= n || f.phase === PHASE_WAIT) {
        for (let k = 0; k < PARAM_FLOATS; k++) {
          out[base + k] = 0;
        }
        continue;
      }

      const mode = ui.modes[i];
      if (f.needsAnchor) {
        resetModeState(mode, f.x, f.y);
        // Birth deformation on top of the rest shape. Mode 2 is stored as a
        // vector (see ModeState), so its amplitude/axis go in as (c2, s2).
        const b = f.birth;
        mode.c2 = b[0] * Math.cos(b[1]);
        mode.s2 = b[0] * Math.sin(b[1]);
        mode.a2 = b[0];
        mode.phi2 = b[1];
        mode.a3 = b[2];
        mode.phi3 = b[3];
        mode.a4 = b[4];
        mode.phi4 = b[5];
        f.needsAnchor = false;
      }

      stepBubbleModes(
        mode,
        f.x,
        f.y,
        f.R,
        wob * f.wobbleMul,
        0,
        0,
        0,
        dtMs,
        scratch,
        bbox,
        iner * f.inertiaMul,
        str * f.strengthMul,
      );

      for (let k = 0; k < PARAM_FLOATS; k++) {
        out[base + k] = scratch[k];
      }
      if (bbox.x < minX) minX = bbox.x;
      if (bbox.y < minY) minY = bbox.y;
      if (bbox.x + bbox.w > maxX) maxX = bbox.x + bbox.w;
      if (bbox.y + bbox.h > maxY) maxY = bbox.y + bbox.h;
    }
    ui.useA = !ui.useA;

    paramBuffer.value = out;
    if (maxX > minX) {
      bboxX.value = minX;
      bboxY.value = minY;
      bboxW.value = maxX - minX;
      bboxH.value = maxY - minY;
    } else {
      bboxX.value = 0;
      bboxY.value = 0;
      bboxW.value = 0;
      bboxH.value = 0;
    }
  }, true);

  return { paramBuffer, bboxX, bboxY, bboxW, bboxH };
}
