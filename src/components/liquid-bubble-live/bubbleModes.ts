/**
 * Liquid Bubbles — harmonic mode constants (buffer shape + tuning values).
 * Design notes: README.md → "bubbleModes.ts".
 */

// ============================================================================
// Buffer shape (must match iParams[3] in shaders.ts / SkSL)
// ============================================================================

/**
 * 12-float double-buffered layout:
 *   [0] cx, cy, R, unused              (pt)
 *   [1] a2, phi2, a3, phi3             (amplitude unitless, phase radians)
 *   [2] a4, phi4, filmPhase, unused
 */
export const PARAM_FLOATS = 12;

/** Hard cap on every mode amplitude `a2/a3/a4`, in both directions (±). */
export const A_MAX = 0.15;

// ============================================================================
// Drive — motion → mode 2 (stretch along the drag direction)
// ============================================================================

/**
 * Mode-2 drive gain, pt/s: `target2 = max(A2_REST, min(A2_MAX, speed / SPEED_REF))`.
 * Leaves the `A2_REST` floor at `A2_REST * SPEED_REF`, saturates at `A2_MAX * SPEED_REF`.
 *
 * TUNE: speed needed to stretch. 3000 slow pan · 20000 flicks only.
 */
export const SPEED_REF = 9000;

/**
 * Mode-2 target amplitude cap. Kept well under `A_MAX` so the spring's
 * overshoot isn't sheared flat by the magnitude clamp.
 *
 * TUNE: max stretch. 0.06 subtle · 0.11 ceiling (above clips).
 */
export const A2_MAX = 0.06;

/**
 * Mode-2 rest floor: the bubble never returns to a perfect circle.
 *
 * TUNE: resting out-of-roundness. 0.02 near-circle · 0.07 always oval.
 */
export const A2_REST = 0.02;

/** Below this drag speed (pt/s), the phi2 target direction is not updated. */
export const PHI2_SPEED_THRESHOLD = 40;

/** UNUSED: mode 2 is a sprung (c2, s2) vector now, so there is no phase-blend rate. */
export const PHI_RATE = 12;

// ============================================================================
// Idle drive — modes 3/4 breathe gently even at rest
// ============================================================================

// Floors are non-zero so the idle target never touches 0: the lobes stay
// irregular and the change reads as texture, not as something moving.

/** Mode-3 rest floor amplitude: `target3 = A3_REST + A3_IDLE * sin(t * IDLE_FREQ_3)`. */
export const A3_REST = 0.022;

/**
 * Mode-3 idle swing amplitude.
 *
 * TUNE: idle breathing. 0.005 near-still · 0.02 restless. Keep < A3_REST.
 */
export const A3_IDLE = 0.012;

/** Mode-4 rest floor amplitude: `target4 = A4_REST + A4_IDLE * sin(t * IDLE_FREQ_4 + IDLE_PHASE_4)`. */
export const A4_REST = 0.014;

/**
 * Mode-4 idle swing amplitude.
 *
 * TUNE: idle breathing. 0.004 near-still · 0.015 restless. Keep < A4_REST.
 */
export const A4_IDLE = 0.008;

/** Mode-3 phase, fixed (never sprung) so the rest pose is an irregular blob. */
export const PHI3_REST = 1.1;

/** Mode-4 phase, fixed (never sprung) so the rest pose is an irregular blob. */
export const PHI4_REST = 2.6;

/** Angular frequency of the mode-3 idle drive, rad/s. */
export const IDLE_FREQ_3 = 0.7;

/** Angular frequency of the mode-4 idle drive, rad/s. */
export const IDLE_FREQ_4 = 1.1;

/** Phase offset of the mode-4 idle drive, radians. */
export const IDLE_PHASE_4 = 1;

// ============================================================================
// Release kick — a pan release seeds modes 3/4 so they ring out
// ============================================================================

/**
 * Kick applied to `v3`/`v4` on an isActive 1→0 edge, scaled by fling speed.
 *
 * TUNE: wobble on release. 1e-4 barely · 6e-4 big splash.
 */
export const KICK = 2.5e-4;

/** `v4`'s kick relative to `v3`'s (and inverted in sign). */
export const KICK_V4_SCALE = 0.6;

// ============================================================================
// Per-mode underdamped spring constants
// ============================================================================
//
// `v += (K_k * (target - a) - C_k * v) * dt; a += v * dt`
// Underdamped on purpose: the bubble should ring out, not snap.
// omega0 = sqrt(K), zeta = C / (2*sqrt(K)); zeta sets the overshoot count.

// TUNE (K = stiffness/speed):  80 syrupy · 300 snappy (fights the pan lag).
// TUNE (C = damping, MAIN FEEL LEVER): 4 loose & jelly · 14 tight, one bounce.

export const K2 = 140;
export const C2 = 7;

export const K3 = 180;
export const C3 = 7;

export const K4 = 220;
export const C4 = 7;

// ============================================================================
// Traveling waves — phase circulates, not just rings out
// ============================================================================
//
// Per-mode phase angular velocity w2/w3/w4 (rad/s) rotates the pattern around
// the rim; see `hooks/bubbleModeMath.ts`.

/**
 * Idle phase angular velocity floor per mode, rad/s. Incommensurate on purpose
 * so the shape never repeats; mode 4 runs the opposite way.
 *
 * TUNE: permanent slow crawl. 0 freezes · 0.4 obvious drift. Keep ratios non-simple.
 */
export const W_FLOOR_2 = 0.08;
export const W_FLOOR_3 = 0.13;
export const W_FLOOR_4 = -0.21;

/**
 * Relaxation time constant for `w_k` → its floor, seconds. Slower than the
 * amplitude springs so circulation outlives the ring-out.
 *
 * TUNE: how long travel outlives the wobble. 0.8 stops with it · 3 keeps drifting.
 */
export const TAU_W = 1.6;

/**
 * Release-kick gain per mode: `w_k += KICK_W_k · flingSpeed · turn`. `turn` is
 * small in practice (|turn| ≈ 0.05–0.2). Mode 2 stays tiny because a spinning
 * mode 2 reads as the whole bubble turning.
 *
 * TUNE (KICK_W_2): keep <= 1e-3.
 * TUNE (KICK_W_3): lobes travelling on a CURVED fling. 0.004 subtle · 0.03
 * races around. KICK_W_4 follows it.
 */
export const KICK_W_2 = 5e-4;
export const KICK_W_3 = 0.012;
export const KICK_W_4 = 1.5 * KICK_W_3;

/** Below this `|turn|` (normalised cross product, −1..1) a fling counts as straight. */
export const TURN_EPS = 0.05;

/** Hard cap on every phase angular velocity `|w_k|`, rad/s (3 ≈ 45–57°/s of rim travel). */
export const W_MAX = 3;

// ============================================================================
// Wobble visibility — a live master knob over the mode 3/4 wobble
// ============================================================================

/**
 * Master wobble multiplier: 0 = smooth sphere, 1 = as authored, 2 = double.
 * Amplitudes are fractions of R, so it is proportional to size; `A_MAX` is the
 * only ceiling.
 *
 * TUNE: overall wobble presence. 0 still glass · 2 ceiling before it fights
 * the "clear sharp center" look.
 */
export const WOBBLE_DEFAULT = 1;

// ============================================================================
// Per-bubble inertia and strength
// ============================================================================
//
// `stepBubbleModes` computes `springScale = strength / inertia` and multiplies
// every mode's K and C by it. `strength` also divides the mode 3/4 idle
// targets; `inertia` also scales the release kicks, the mode-2 stretch cap and
// the follow-spring mass in `useBubbleGestures.tsx`.

/** Default per-bubble inertia multiplier. */
export const INERTIA_DEFAULT = 1;

/** Default per-bubble strength multiplier. */
export const STRENGTH_DEFAULT = 1;

/**
 * Floor on both `inertia` and `strength` (guards `S/I` against divide-by-zero).
 *
 * TUNE: how weightless/floppy the extremes can go. 0.1 is already very light.
 */
export const MULT_MIN = 0.1;

/** Ceiling on the inertia-scaled mode-2 stretch cap; above this the overshoot clips against `A_MAX`. */
export const A2_MAX_CEIL = 0.11;

// ============================================================================
// Float — the bubble moving on its own (liquid-bubble-interaction/hooks/multiBubbleMath.ts)
// ============================================================================
//
// Canvas points, y DOWN. Per frame while not dragged:
//   v.y −= FLOAT_BUOYANCY · buoyancy / I · dt      (minus = up)
//   v.x += FLOAT_SWAY · sin(2π t / FLOAT_SWAY_PERIOD + φ) · dt
//   v   *= exp(−FLOAT_DRAG / √I · dt)
// Terminal rise = FLOAT_BUOYANCY / FLOAT_DRAG = 80 pt/s at I = 1.

/** Float on at mount (live toggle: Shape tab). Off = the bubble parks where released. */
export const FLOAT_ON_DEFAULT = true;

/**
 * Upward acceleration, pt/s², before the Buoyancy lever and inertia.
 *
 * TUNE: 20 lazy rise · 40 · 80 eager (terminal speed doubles with it).
 */
export const FLOAT_BUOYANCY = 40;

/** Buoyancy lever default: multiplier on FLOAT_BUOYANCY. 0 = drifts, never rises. */
export const FLOAT_BUOYANCY_LEVER_DEFAULT = 1;

/**
 * Air drag rate, 1/s (velocity decays as `e^(−DRAG·t)`).
 *
 * TUNE: 0.25 floaty, launches coast far · 0.5 · 1.0 heavy air.
 */
export const FLOAT_DRAG = 0.5;

/**
 * Launch speed range when a bubble detaches from the spawn box, pt/s.
 *
 * TUNE: min 50 barely leaves · 100–300 · max 600 shot out.
 */
export const FLOAT_LAUNCH_MIN = 100;
export const FLOAT_LAUNCH_MAX = 300;

/**
 * Launch cone half-angle around straight up, radians (π/6 = ±30°).
 *
 * TUNE: 0 straight up · π/6 · π/3 wide spray.
 */
export const FLOAT_LAUNCH_CONE = Math.PI / 6;

/**
 * Sideways sway acceleration amplitude, pt/s², and its period, seconds.
 *
 * TUNE: sway 0 straight rise · 60 (~14 pt drift) · 150 wandering.
 */
export const FLOAT_SWAY = 60;
export const FLOAT_SWAY_PERIOD = 3;

/**
 * Fraction of speed kept after bouncing off the left, right or bottom edge.
 *
 * TUNE: 0.3 dead thud · 0.6 · 0.9 rubber ball.
 */
export const FLOAT_BOUNCE_KEEP = 0.6;

/**
 * Respawn once the center is this many radii above the top edge. > 1 so
 * the stretched, wobbling rim is off-screen too.
 *
 * TUNE: 1.0 respawns as the round rim leaves · 1.3 · 2.0 lingers off-screen.
 */
export const FLOAT_EXIT_RADII = 1.3;

// ============================================================================
// Birth — each bubble inflates out of the spawn box (liquid-bubble-interaction/hooks/multiBubbleMath.ts)
// ============================================================================
//
// Spawn → inflate over BIRTH_TIME (motion eases in over the same time) →
// float → out the top → spawn again. Every bubble rolls its own multipliers
// on the slider values; ranges are [min, max], drawn uniformly.

/** Radius the spawner starts from, pt — not 0, so nothing divides by zero. */
export const BIRTH_RADIUS_START = 1;

/**
 * Target radius as a multiple of `restRadius`.
 *
 * TUNE: [0.8, 1.2] uniform sizes · [0.6, 1.5] · [0.4, 2.0] pebbles to balloons.
 */
export const BIRTH_RADIUS_RANGE: readonly [number, number] = [0.6, 1.5];

/**
 * Birth time `T`, seconds: the radius spring and the motion ease-in both run over `T`.
 *
 * TUNE: 0.8 quick puff · 1.5 · 2.5 slow blow.
 */
export const BIRTH_TIME = 1.5;

/**
 * Per-bubble multipliers on the Wobble / Strength / Inertia / Buoyancy
 * sliders.
 *
 * TUNE: narrow a range toward [1, 1] to make every bubble alike on that axis.
 */
export const BIRTH_WOBBLE_RANGE: readonly [number, number] = [0.6, 1.6];
export const BIRTH_STRENGTH_RANGE: readonly [number, number] = [0.7, 1.4];
export const BIRTH_INERTIA_RANGE: readonly [number, number] = [0.7, 1.5];
export const BIRTH_BUOYANCY_RANGE: readonly [number, number] = [0.6, 1.5];

/**
 * Birth deformation, fractions of R: mode-2 stretch along a random axis,
 * plus random 3- and 4-lobe amplitudes. Sum of maxima 0.14 stays under `A_MAX`.
 *
 * TUNE: halve for a subtle birth · these · anything past A_MAX gets clamped.
 */
export const BIRTH_A2_RANGE: readonly [number, number] = [0.02, 0.07];
export const BIRTH_A3_MAX = 0.04;
export const BIRTH_A4_MAX = 0.03;

// ============================================================================
// Film drift
// ============================================================================

/** `filmPhase += dt * FILM_DRIFT`, drives the thin-film color cycle. */
export const FILM_DRIFT = 0.15;

// ============================================================================
// Film motion — the soap film lags the bubble's travel (hooks/useBubbleFilmMotion.ts)
// ============================================================================
//
// The bubble's velocity becomes touch impulses at the film center:
//   vFilm = −v · (200 / R) · FILM_DRAG_GAIN · drag   (film pt/s, |vFilm| ≤ MAX)
// GAIN 1 pins the film to the world (full lag); < 1 reads as sloshing.

/** Film drag lever default (Surface → Film drag): 0 off · 1 calibrated · 2 exaggerated. */
export const FILM_DRAG_DEFAULT = 1;

/**
 * Fraction of full lag.
 *
 * TUNE: 0.2 subtle · 0.4 visible slosh · 1 film pinned to the world.
 */
export const FILM_DRAG_GAIN = 0.4;

/**
 * Cap on the STEADY impulse sum, film pt/s, so a fling never smears the film
 * past the far rim.
 *
 * TUNE: 120 gentle flings · 240 · 400 flings wash the pattern out.
 */
export const FILM_DRAG_MAX = 240;

/**
 * Gaussian radius of each impulse, normalized film units (rim is at 0.5).
 *
 * TUNE: 0.3 only the middle moves · 0.45 · 0.7 near-uniform shift.
 */
export const FILM_DRAG_RADIUS = 0.45;

/**
 * Bubble speed below which no impulse is written, canvas pt/s (filters
 * settling jitter at rest).
 *
 * TUNE: 5 everything counts · 20 · 60 only real drags.
 */
export const FILM_DRAG_SPEED_MIN = 20;

/**
 * Impulse decay at inertia 1, seconds (× inertia, clamped to the soap-film's
 * touch tau range [0.2, 4]). How long the film sloshes after the bubble stops.
 *
 * TUNE: 0.4 settles at once · 0.8 · 2 long lazy slosh.
 */
export const FILM_DRAG_TAU = 0.8;

/**
 * Seconds between impulse writes (each copies the 32-float ring, so this bounds
 * allocation; the hook's stacking factor depends on it).
 *
 * TUNE: 0.05 smoother onset, 2× the writes · 0.1 · 0.2 steppy.
 */
export const FILM_DRAG_WRITE_INTERVAL = 0.1;

// ============================================================================
// Frame timing
// ============================================================================

/**
 * `dt` (ms) is clamped to this range before every physics step. The max stays
 * at 20: a 33 ms step made the Euler springs unstable at the slider extremes.
 */
export const DT_MIN_MS = 1;
export const DT_MAX_MS = 20;

// ============================================================================
// Optics defaults — START values for the optics uniforms
// ============================================================================

/**
 * `iRefract`: max refraction sample offset at the rim, points (0 at the
 * center). Absolute, not proportional to R.
 *
 * TUNE: refraction. 4 flat glass · 12 ceiling (above = smeared rim).
 */
export const REFRACT = 9;

/**
 * `iFilm`: thin-film iridescence strength, 0..1.
 *
 * TUNE: rainbow. 0.3 hint · 0.7 ceiling (above = thick halo).
 */
export const FILM = 0.55;

/**
 * Soap-film overlay only: how far in from the rim the film reaches. Scales the
 * fresnel exponent, `om^(3·(1 − reach))`.
 *
 * TUNE: reach. 0 rim only · 0.6 half the body · 1 whole bubble.
 */
export const FILM_REACH = 0;

/**
 * `iColor.a`: tint WEIGHT of `iColor.rgb` over the refracted body (not opacity).
 *
 * TUNE: tint. 0 clear glass · 0.6 ceiling (above = colored disk).
 */
export const TINT = 0.35;

/**
 * `iOptics.x`: how much the dark rim line darkens, 0..1.
 *
 * TUNE: rim line. 0 none · 0.7 ink outline.
 */
export const RIM_DARK = 0.35;

/**
 * `iOptics.y`: width of the dark rim line, points. Must stay > 0 (equal
 * `smoothstep` edges are undefined).
 *
 * TUNE: rim width. 1 hairline · 8 soft vignette.
 */
export const RIM_WIDTH = 3;

/**
 * `iOptics.z`: thin-film band count across the rim.
 *
 * TUNE: film bands. 1 one soft hue shift · 6 tight rainbow rings.
 */
export const FILM_SCALE = 2.5;

/**
 * `iOptics.w`: exponent on the optics weight, `om = (1 − nz)^this`. Must stay
 * > 0 (`pow(0, ≤0)` is undefined).
 *
 * TUNE: lens depth. 0.5 thick lens (bends deep) · 3 thin shell (edge only).
 */
export const OPTICS_FALLOFF = 1;

// ----------------------------------------------------------------------------
// Gargantua-derived levers (default OFF; values in each TUNE note and in
// `GARGANTUA_PRESET`, `hooks/useBubbleOptics.ts`)
// ----------------------------------------------------------------------------

/**
 * `iLens.x`: radial lens warp, fraction of R, scaled by `(dist/r)²`.
 * + magnify, − pincushion. Negative values reach OUTSIDE the rim, so the clip
 * pads by `R·max(0,−lens)`.
 *
 * TUNE: lens. Gargantua 0.5 · −0.3 fisheye-in.
 */
export const LENS = 0;

/**
 * `iLens.y`: chromatic aberration at the rim, fraction of R (2 extra taps,
 * skipped when 0).
 *
 * TUNE: dispersion. Gargantua 0.9 · 0.2 subtle fringe.
 */
export const DISPERSION = 0;

/**
 * `iLens.z`: width of the rim band used by dispersion and the rainbow. Must stay > 0.
 *
 * TUNE: edge band. Gargantua 0.1 · 0.3 wide.
 */
export const EDGE_WIDTH = 0.1;

/**
 * `iLens.w`: specular highlight strength (light up-left, follows the wobble).
 *
 * TUNE: specular. Gargantua 1.0.
 */
export const SPECULAR = 0;

/** `iPrism.x`: angular rainbow mixed into the rim band. TUNE: Gargantua 0.15. */
export const RAINBOW_MIX = 0;

/** `iPrism.y`: additive rainbow glow on the rim band. TUNE: Gargantua 0.05. */
export const RAINBOW_GLOW = 0;

/**
 * `iPalette`: prismatic rim colors. 0 = smooth hue wheel · 1 = 5 poster colors
 * as hard bands (defined in `shaders.ts`).
 */
export const PRISM_PALETTE_RAINBOW = 0;
export const PRISM_PALETTE_POSTER = 1;
export const PRISM_PALETTE = PRISM_PALETTE_RAINBOW;

/**
 * `iPrism.z`: halo reach outside the rim, fraction of R. Must stay > 0; the
 * clip pads by `R·this`.
 *
 * TUNE: halo spread. Gargantua 0.2.
 */
export const HALO_SPREAD = 0.2;

/**
 * `iPrism.w`: halo opacity, SIGNED: + light, − dark.
 *
 * TUNE: halo. Gargantua 0.15 · −0.15 soft shadow on white.
 */
export const HALO_OPACITY = 0;

// ============================================================================
// Bounding box
// ============================================================================

/** AA feather padding — the shader's `smoothstep(-0.75, 0.75, d)` band. */
export const AA_PAD = 2;

/**
 * Padding on the harmonic-field bbox, points. `AA_PAD` only, NOT plus
 * `REFRACT`: alpha depends on `r` and `dist` alone, so nothing is drawn past
 * `r + 0.75`, and padding by refraction would only add GPU fill.
 */
export const BBOX_PAD = AA_PAD;
