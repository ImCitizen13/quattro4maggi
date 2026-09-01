/**
 * Pure (CPU-side, no GPU/typegpu) math for the moving-bubble animation.
 *
 * Split out so the simulation can be exercised in isolation by `bun test`.
 * The sprite is treated as a world-space point at `(worldX, worldY, z)` that
 * moves toward the camera by decreasing `z`. Pinhole projection gives screen
 * position `(worldX/z, worldY/z)` and a depth-driven size, fade-in scale, and
 * end-of-life alpha.
 */

/**
 * Tunable simulation parameters. Defaults live in {@link DEFAULTS}; the scene
 * factory builds a `SpriteParams` from defaults plus user-supplied overrides.
 */
export interface SpriteParams {
  /** Spawn depth — larger = sprites start tinier and closer to screen center. */
  zFar: number;
  /** Floor for `1/z`; also the depth at which alpha hits its minimum. */
  zNear: number;
  /** Base z-decrement per second before per-sprite speed and depth boost. */
  baseSpeed: number;
  /** Extra acceleration as `z→0`: total speed multiplier is `1 + nearBoost/z`. */
  nearBoost: number;
  /** Scene-level multiplier on every sprite's speed. */
  speedFactor: number;
  /** Per-sprite random speed lower bound (applied as `* speedFactor`). */
  speedMin: number;
  /** Per-sprite random speed upper bound (applied as `* speedFactor`). */
  speedMax: number;
  /** Smallest target NDC width a sprite may grow to at near depth. */
  sizeMin: number;
  /** Largest target NDC width a sprite may grow to at near depth. */
  sizeMax: number;
  /**
   * Exponent applied to depth progress when computing on-screen size:
   * `size ∝ depthScale ^ sizePower`. `1` is linear (size half at half depth);
   * larger values keep the sprite small for most of the trip and only let it
   * approach `finalSize` near the very end (the screen). Default 3.
   */
  sizePower: number;
  /** Radius in pixels of the spawn disc centered on screen. */
  spawnRadiusPx: number;
  /** Seconds for a freshly spawned sprite to scale from 0 to its target size. */
  spawnDuration: number;
  /**
   * Depth-progress fraction (0 = far, 1 = near) at which alpha begins fading.
   * Below this fraction alpha is held at 1.
   */
  fadeStartDepth: number;
  /** Alpha at the closest point (depth-progress = 1). */
  minAlpha: number;
}

/**
 * Default tunables. The scene factory shallow-merges user overrides on top.
 */
export const DEFAULTS: SpriteParams = {
  zFar: 12.0,
  zNear: 0.25,
  baseSpeed: 1.5,
  nearBoost: 1.7,
  speedFactor: 1.2,
  speedMin: 1.0,
  speedMax: 1.5,
  sizeMin: 0.25,
  sizeMax: 0.7,
  sizePower: 3,
  spawnRadiusPx: 25,
  spawnDuration: 0.4,
  fadeStartDepth: 0.7,
  minAlpha: 1,
};

/**
 * Per-sprite simulation state, mutated in place each frame.
 *
 * `worldX/worldY` are constants once spawned — the radial outward motion comes
 * "for free" from `screenX = worldX/z` as `z` decreases. `age` drives the
 * scale-from-zero ramp; `finalSize` is the per-sprite target NDC width once
 * fully scaled in and at near depth.
 */
export interface SpriteState {
  worldX: number;
  worldY: number;
  z: number;
  speed: number;
  age: number;
  finalSize: number;
}

/** Per-frame projection result handed to the GPU layer. */
export interface ProjectedRect {
  /** NDC bottom-left x (vertex shader expands by `c * w`). */
  x: number;
  /** NDC bottom-left y. */
  y: number;
  /** NDC width. */
  w: number;
  /** NDC height. */
  h: number;
  /** [0, 1] alpha multiplier for the fragment stage. */
  alpha: number;
}

/** Injectable RNG so tests can seed and verify distributions. */
export type Rng = () => number;

/**
 * Build a complete `SpriteParams` from a partial override. Keeps the scene
 * factory's call site small while letting tests pass exact configurations.
 */
export function makeParams(overrides: Partial<SpriteParams> = {}): SpriteParams {
  return { ...DEFAULTS, ...overrides };
}

/**
 * Reset a sprite into a fresh spawn state.
 *
 * Spawn position is sampled uniformly (by area, via `sqrt(rand)` on the radius)
 * within a disc of `spawnRadiusPx` centered on screen. World-space coords are
 * scaled by `z = zFar` so that the immediate projected position equals the
 * picked NDC offset — i.e. the sprite *appears* inside the spawn disc on the
 * very first frame, then radiates outward as `z` shrinks.
 */
export function spawnSprite(
  s: SpriteState,
  params: SpriteParams,
  canvasH: number,
  rng: Rng = Math.random,
): void {
  const angle = rng() * Math.PI * 2;
  const radiusPx = Math.sqrt(rng()) * params.spawnRadiusPx;
  // 1 NDC = canvasH/2 pixels along the Y axis.
  const radiusNdc = radiusPx / (canvasH / 2);
  const worldR = radiusNdc * params.zFar;
  s.worldX = Math.cos(angle) * worldR;
  s.worldY = Math.sin(angle) * worldR;
  s.z = params.zFar;
  s.speed = params.speedMin + rng() * (params.speedMax - params.speedMin);
  s.finalSize = params.sizeMin + rng() * (params.sizeMax - params.sizeMin);
  s.age = 0;
}

/**
 * Advance a sprite by `dt` seconds. `z` decreases by
 * `baseSpeed * speedFactor * speed * (1 + nearBoost/z) * dt` — the `1 +
 * nearBoost/z` term is what gives the perspective rush on top of the natural
 * 1/z screen acceleration.
 */
export function advanceSprite(
  s: SpriteState,
  params: SpriteParams,
  dt: number,
): void {
  s.age += dt;
  const boost = 1 + params.nearBoost / Math.max(s.z, params.zNear);
  s.z -= params.baseSpeed * params.speedFactor * s.speed * boost * dt;
}

/**
 * Depth progress: 0 at `zFar`, 1 at `zNear`, clamped at both ends. Used both
 * as a size-growth factor and as the input to the alpha fade.
 */
export function depthScale(z: number, params: SpriteParams): number {
  const t = (params.zFar - z) / (params.zFar - params.zNear);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

/**
 * Smooth 0→1 ramp over `spawnDuration` seconds since spawn. Cubic smoothstep
 * for soft start/end (no popping when a fresh sprite appears).
 */
export function spawnScale(age: number, params: SpriteParams): number {
  if (params.spawnDuration <= 0) return 1;
  const t = age / params.spawnDuration;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Depth-driven size factor, decoupled from the (linear) `depthScale` used for
 * alpha. Returns 0 at `zFar` and 1 at `zNear`, but with a `sizePower` curve so
 * the sprite stays small for most of the journey and only approaches its
 * `finalSize` close to the screen.
 */
export function sizeScale(z: number, params: SpriteParams): number {
  const ds = depthScale(z, params);
  if (params.sizePower === 1) return ds;
  return Math.pow(ds, params.sizePower);
}

/**
 * Alpha multiplier as a function of depth: held at 1 until the sprite passes
 * `fadeStartDepth` (a fraction along [0=far, 1=near]), then linearly fading to
 * `minAlpha` at `zNear`.
 */
export function alphaFor(z: number, params: SpriteParams): number {
  const ds = depthScale(z, params);
  if (ds <= params.fadeStartDepth) return 1;
  const t = (ds - params.fadeStartDepth) / (1 - params.fadeStartDepth);
  return 1 + (params.minAlpha - 1) * t;
}

/**
 * Project a sprite's state to a viewport rect + alpha.
 *
 * Aspect compensation (`sizeY = sizeX * canvasW/canvasH`) keeps sprites
 * pixel-square: 1 NDC X = `canvasW/2` px and 1 NDC Y = `canvasH/2` px, so
 * matching pixel dimensions requires Y-NDC to be scaled by `cw/ch`.
 */
export function projectSprite(
  s: SpriteState,
  params: SpriteParams,
  canvasW: number,
  canvasH: number,
): ProjectedRect {
  const aspect = canvasW / canvasH;
  const invZ = 1 / Math.max(s.z, params.zNear);
  const sz = sizeScale(s.z, params);
  const ss = spawnScale(s.age, params);
  const sizeX = s.finalSize * sz * ss;
  const sizeY = sizeX * aspect;
  const cx = s.worldX * invZ;
  const cy = s.worldY * invZ;
  return {
    x: cx - sizeX / 2,
    y: cy - sizeY / 2,
    w: sizeX,
    h: sizeY,
    alpha: alphaFor(s.z, params),
  };
}

/**
 * `true` once the projected rect has fully cleared the [-1, 1] NDC viewport
 * along either axis. Computed from rect (not z-threshold) so a slow-moving
 * sprite at low z can still finish sweeping off-screen before recycling.
 */
export function hasExited(rect: ProjectedRect): boolean {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return Math.abs(cx) > 1 + rect.w / 2 || Math.abs(cy) > 1 + rect.h / 2;
}
