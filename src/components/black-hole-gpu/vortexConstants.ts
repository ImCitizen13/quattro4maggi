import type { VortexConfig } from "./vortexScene";

// ============================================================================
// Vortex constants: the single source of defaults
// ============================================================================
//
// Every vortex number lives here. The scene, shaders, run hook, wrapper, demo
// screen and settings panel import from this file; change a value and every
// consumer follows. Lens knobs have their own source (lensTune.ts).
//
// Worklets capture these as plain numbers / objects (no functions, no class
// instances), so they cross to the UI runtime by value.

// ---- Physics ----------------------------------------------------------------

/** Physics defaults for a run. Per-field units and effects: see VortexConfig. */
export const DEFAULT_VORTEX: VortexConfig = {
  tile: 4,
  holeT0: 0,
  vortexT0: 0.6,
  ramp: 0.6,
  inflow: 0.15,
  refRadius: 0.5,
  horizon: 0.06,
  wave: 0.25,
  drag: 3,
  swirl: 1.6,
  sticky: 1.6,
  patch: 0.06,
};

/** Tile sizes (physical px) the demo's settings panel offers. */
export const TILE_SIZES = [8, 4, 2] as const;

// ---- Speed ------------------------------------------------------------------

/** Sim speed multiplier a run starts at. Scales sim time only, paths are identical. */
export const DEFAULT_SPEED = 1;
/** Lowest sim speed multiplier (slider floor, scene clamp). */
export const SPEED_MIN = 0.25;
/** Highest sim speed multiplier (slider ceiling, scene clamp). */
export const SPEED_MAX = 4;

// ---- Sim clock and limits ---------------------------------------------------

/** Fixed sim step, s (120 Hz). The sim is a pure function of the step index. */
export const H = 1 / 120;
/** Substep cap per frame at 1x speed; scaled up with the speed multiplier. */
export const MAX_SUBSTEPS = 8;
/** Death histogram length: step indices 0..MAX_STEPS-1 (68 s of sim at H). */
export const MAX_STEPS = 8192;
/** Compute workgroup size (particles per group). */
export const WORKGROUP = 64;
/** Frames between `onStats` reports. */
export const STATS_EVERY = 30;

// ---- Hole spring ------------------------------------------------------------

/**
 * The hole grows in from Release and overshoots once: an underdamped spring
 * step response. `k` = stiffness (1/s^2), `d` = damping (1/s).
 */
export const HOLE_SPRING = { k: 70, d: 9 };

// ---- Keyframes and seek -----------------------------------------------------

/** Keyframe storage cap, bytes. */
export const KEYFRAME_BYTES = 64 * 1024 * 1024;
/** Fewest keyframe slots kept. */
export const MIN_SLOTS = 2;
/** Most keyframe slots kept. */
export const MAX_SLOTS = 32;
/** Never space keyframes closer than this many steps (0.25 s of sim). */
export const MIN_KEY_INTERVAL = 30;
/**
 * Replay budget of a seek frame in particle-steps (count x steps in one step
 * dispatch). Tuned on the Simulator so a scrub frame stays inside ~16 ms.
 */
export const SEEK_BUDGET = 40e6;
/** Max steps a forward chase runs ahead of the last read-back step. */
export const CHASE_AHEAD = 120;
/** Fewest steps a seek frame replays. */
export const MIN_SEEK_STEPS = 16;
/** Most steps a seek frame replays. */
export const MAX_SEEK_STEPS = 2048;

// ---- Colors and center ------------------------------------------------------

/** Opaque space color for a full-stage run (premultiplied RGBA). */
export const SPACE_COLOR = [0.035, 0.035, 0.045, 1] as const;
/** Default tile-pass clear color: transparent (premultiplied RGBA). */
export const TRANSPARENT = [0, 0, 0, 0] as const;
/** Default hole center, 0..1 fraction of the snapshot. */
export const DEFAULT_CENTER = { x: 0.5, y: 0.5 };

// ---- Wrapper and run hook ---------------------------------------------------

/** A touch older than this (ms) no longer picks the swallow origin. */
export const TOUCH_WINDOW_MS = 1000;
/**
 * Pause (ms) between the release press and the capture: the capture blocks
 * the platform UI thread ~0.4 s, so let the press animation settle first.
 */
export const RELEASE_DELAY_MS = 120;
/** Wrapper default: build the scene only when needed (false) or up front (true). */
export const DEFAULT_PREWARM = false;
/** Wrapper default: the swallow starts where the user touched. */
export const DEFAULT_TOUCH_ORIGIN = true;
/** Wrapper default: sticky patches on. */
export const DEFAULT_STICKY = true;
/** Wrapper default: content is ready to capture. */
export const DEFAULT_READY = true;
/** Demo screen: build the scene anyway (ms) if the push transition never ends. */
export const TRANSITION_FALLBACK_MS = 1000;

// ---- Shader tuning ----------------------------------------------------------
//
// Baked into the WGSL at module load. Fixed math stays in the shader.

/** Max random extra release delay per tile, s (breaks up the wave ring edge). */
export const RELEASE_JITTER = 0.35;
/** Sticky tiles ramp up (1 + STICKY_RAMP * stickiness) times slower. */
export const STICKY_RAMP = 2;
/** Velocity relaxes at least this many times the local angular rate |v| / r. */
export const RELAX_FLOOR = 3;
/** Sticky patch noise threshold: below LOW is not sticky, above HIGH fully. */
export const STICKY_BLOB_LOW = 0.5;
export const STICKY_BLOB_HIGH = 0.8;
/** Per-tile stickiness jitter, peak to peak (0..1 stickiness units). */
export const STICKY_JITTER = 0.2;
/** Tiles shrink to zero between this many horizons and 1 horizon from the hole. */
export const TILE_SHRINK_RADIUS = 4;
