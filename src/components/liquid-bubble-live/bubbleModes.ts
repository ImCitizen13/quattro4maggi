/**
 * Liquid Bubbles — harmonic mode constants (buffer shape + tuning values).
 * Design notes: README.md → "bubbleModes.ts".
 */

// ============================================================================
// Buffer shape (must match iParams[3] in shaders.ts / SkSL)
// ============================================================================

/**
 * 12-float buffer layout, double-buffered exactly like `ballBuffer` was:
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
 *
 * NOT the saturation speed, despite what the "Physics contract" in
 * `temp/liquid-bubbles-divergence.md` calls it. The ratio saturates at
 * `A2_MAX * SPEED_REF`, and the target leaves its `A2_REST` floor at
 * `A2_REST * SPEED_REF`. With the doc's 1500 and the then-current `A2_MAX`
 * of 0.12, mode 2 therefore saturated at 180 pt/s — a leisurely drag —
 * leaving no dynamic range at all between a slow pan and a flick.
 *
 * Phase 10B: 9000, with `A2_MAX` now 0.10. Floor crossing at 360 pt/s, full
 * stretch at 900 pt/s (`A2_MAX * SPEED_REF`), so
 * a real flick saturates and a slow pan reads as a slow pan. This is also the
 * only constant-level lever for "a pinch must not excite mode 2": Pan runs
 * Simultaneous with Pinch, so the two-finger centroid drift still drives this
 * term, and at 9000 a drift below 360 pt/s leaves `target2` pinned to its
 * `A2_REST` floor — i.e. no stretch at all.
 *
 * TUNE: speed needed to stretch. 3000 slow pan · 20000 flicks only.
 */
export const SPEED_REF = 9000;

/**
 * Mode-2 target amplitude cap: `target2 = min(A2_MAX, speed / SPEED_REF)`.
 *
 * Phase 10B: 0.12 → 0.10, to make room for the overshoot. `A2_MAX` caps the
 * spring's TARGET; the only cap on the spring's actual output is the hard
 * `A_MAX` (0.15) magnitude clamp. After the `C2` retune the first overshoot
 * is ~37% of the swing, so a saturating flick from the `A2_REST` floor
 * reached `0.12 + 0.37·0.08 = 0.150` — exactly the clamp. The bounce this
 * phase exists to create was being sheared off into a flat top, and the
 * clamp additionally rescales the (c2, s2) vector, which is not something to
 * do on every flick. At 0.10 the peak lands near 0.122, well clear of the
 * clamp, so the overshoot survives intact — and the momentary stretch is
 * still LARGER than the 0.12 the old constants could reach at all.
 *
 * TUNE: max stretch. 0.06 subtle · 0.11 ceiling (above clips).
 */
export const A2_MAX = 0.06;

/**
 * Mode-2 rest floor: `target2 = max(A2_REST, min(A2_MAX, speed / SPEED_REF))`.
 * The bubble never returns to a perfect circle — this is its "memory".
 *
 * TUNE: resting out-of-roundness. 0.02 near-circle · 0.07 always oval.
 */
export const A2_REST = 0.02;

/** Below this drag speed (pt/s), the phi2 target direction is not updated. */
export const PHI2_SPEED_THRESHOLD = 40;

/**
 * Shortest-arc blend rate for phi2 → target, in 1/s.
 *
 * UNUSED since mode 2 became a sprung VECTOR rather than an angle lerp (see
 * `ModeState` in `hooks/bubbleModeMath.ts`): the axis is now carried by
 * (`c2`, `s2`) under the K2/C2 spring, so there is no separate phase-blend
 * rate. Kept because the "Physics contract" in
 * `temp/liquid-bubbles-divergence.md` still lists it — that doc needs the
 * same correction. Delete both together.
 */
export const PHI_RATE = 12;

// ============================================================================
// Idle drive — modes 3/4 breathe gently even at rest
// ============================================================================

// Phase 10B: the floors went UP and the swings went DOWN, keeping roughly the
// same mean. Before, `A3_REST === A3_IDLE` meant the mode-3 target touched
// exactly ZERO every idle cycle — the lobes fully vanished and came back, and
// it is that full-range change, not the peak amplitude, that made the rest
// pose read as something moving rather than as texture. Holding a floor with a
// smaller swing keeps the blob irregular (which the "never a circle" test and
// the reference look both want) while cutting the peak-to-peak idle change by
// 40% on mode 3 and 33% on mode 4 — "present, but you have to look for it".

/** Mode-3 rest floor amplitude: `target3 = A3_REST + A3_IDLE * sin(t * IDLE_FREQ_3)`. */
export const A3_REST = 0.022;

/**
 * Mode-3 idle target amplitude: `A3_IDLE * sin(t * IDLE_FREQ_3)`.
 *
 * TUNE: idle breathing. 0.005 near-still · 0.02 restless. Keep < A3_REST.
 */
export const A3_IDLE = 0.012;

/** Mode-4 rest floor amplitude: `target4 = A4_REST + A4_IDLE * sin(t * IDLE_FREQ_4 + IDLE_PHASE_4)`. */
export const A4_REST = 0.014;

/**
 * Mode-4 idle target amplitude: `A4_IDLE * sin(t * IDLE_FREQ_4 + IDLE_PHASE_4)`.
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
 * Kick magnitude applied to `v3`/`v4` on an isActive 1→0 edge, scaled by the
 * gesture's fling speed.
 *
 * Phase 10B: 2e-5 → 2.5e-4. An impulse `v` on a spring produces a peak
 * amplitude excursion of `v / omega_d`, and mode 3's damped frequency is
 * ~13 rad/s — so the old gain turned a brisk 2000 pt/s fling into
 * `0.04 / 13 = 0.003` of extra `a3`, about a seventh of mode 3's own idle
 * swing. The release kick was, in practice, invisible. At 2.5e-4 the same
 * fling gives `0.5 / 13 = 0.039`, a lobe pulse of the same order as the
 * mode-2 stretch it accompanies, and stays inside `A_MAX` for flings up to
 * ~4500 pt/s (beyond that the magnitude clamp takes over, as designed).
 *
 * TUNE: wobble on release. 1e-4 barely · 6e-4 big splash.
 */
export const KICK = 2.5e-4;

/**
 * `v4`'s kick is scaled down relative to `v3`'s (and inverted in sign).
 */
export const KICK_V4_SCALE = 0.6;

// ============================================================================
// Per-mode critically-underdamped spring constants
// ============================================================================
//
// `v += (K_k * (target - a) - C_k * v) * dt; a += v * dt`
// Underdamped on purpose — the bubble should visibly ring out, not snap.
//
// Read them as `omega0 = sqrt(K)` and `zeta = C / (2*sqrt(K))`: `zeta` alone
// sets how many overshoots you see (first overshoot =
// `exp(-pi*zeta/sqrt(1-zeta^2))`) and `1/(zeta*omega0)` is the envelope's time
// constant, so a ring-out is visually over at ~3 of those.
//
// Phase 10B lowered every damping coefficient and left every K alone. The
// target is "a fast flick overshoots once or twice then settles within ~1 s",
// and the old constants were too damped to overshoot visibly:
//
//   mode  K    C old -> new   zeta old -> new   1st overshoot   3*tau (settle)
//   2     140  14   -> 7      0.59 -> 0.30      10%  -> 37%     0.45 -> 0.85 s
//   3     180  10   -> 7      0.37 -> 0.26      28%  -> 42%     0.60 -> 0.86 s
//   4     220   9   -> 7      0.30 -> 0.24      38%  -> 47%     0.67 -> 0.86 s
//
// A 10% first overshoot is below the threshold of noticing on a 40 pt disk;
// ~40% is a clear bounce, and the second one (40% of that, ~16%) is the "or
// twice". Every K is unchanged on purpose: K sets how fast the stretch chases
// the drag, and with the sprung anchor already trailing the finger by 0.1 s,
// softening K as well would have compounded the lag.

// TUNE (K = stiffness/speed):  80 syrupy · 300 snappy (fights the pan lag).
// TUNE (C = damping, MAIN FEEL LEVER): 4 loose & jelly · 14 tight, one bounce.

export const K2 = 140;
export const C2 = 7;

export const K3 = 180;
export const C3 = 7;

export const K4 = 220;
export const C4 = 7;

// ============================================================================
// Traveling waves (phase 9B) — phase circulates, not just rings out
// ============================================================================
//
// See temp/liquid-bubbles-divergence.md → "Traveling waves (phase 9B)" for
// the derivation. Standing waves (the springs above) ring an amplitude up
// and down at a fixed angle; these add a phase angular velocity per mode
// (w2/w3/w4, rad/s) that rotates the pattern around the rim. W_FLOOR_2
// REPLACES PHI_DRIFT: instead of slowly rotating the mode-2 TARGET at rest,
// w2 (seeded at its floor, never zero) rotates the (c2, s2) vector directly,
// every frame, active or not — see `hooks/bubbleModeMath.ts`.

/**
 * Idle phase angular velocity floor per mode, rad/s — the constant subtle
 * "clock tick" that keeps the pattern circulating even at rest. The three
 * values are incommensurate on purpose so the shape never exactly repeats;
 * W_FLOOR_4's sign is opposite the other two so mode 4 crawls the other way
 * (dispersion).
 *
 * TUNE: permanent slow crawl. 0 freezes · 0.4 obvious drift. Keep ratios non-simple.
 */
export const W_FLOOR_2 = 0.08;
export const W_FLOOR_3 = 0.13;
export const W_FLOOR_4 = -0.21;

/**
 * Relaxation time constant for `w_k` → its floor, seconds:
 * `w_k += (W_FLOOR_k − w_k) · (1 / TAU_W) · dt`. Deliberately slower than the
 * amplitude springs (`K2..K4` / `C2..C4`) so circulation outlives the
 * amplitude ring-out.
 *
 * Phase 10B: 0.9 → 1.6. After the `C2..C4` retune above the amplitude
 * ring-out itself lasts ~0.85 s, and at TAU_W = 0.9 the circulation was
 * effectively gone by ~2.7 s — the travel and the wobble ended together, so
 * there was no "…then it keeps drifting" tail at all. 1.6 s puts the
 * circulation's visible life at ~5 s, several times the wobble's, which is
 * what "lobes run around the rim, then slow to the idle crawl" describes.
 * It also doubles the total phase travel a given kick buys, since the
 * integral of the excess is `excess · TAU_W`.
 *
 * TUNE: how long travel outlives the wobble. 0.8 stops with it · 3 keeps drifting.
 */
export const TAU_W = 1.6;

/**
 * Release-kick gain per mode: `w_k += KICK_W_k · flingSpeed · turn`. Mode 2
 * is kept small on purpose — a spinning mode 2 reads as the whole bubble
 * spinning — while modes 3/4 carry the visible travel (dispersion: higher
 * modes run faster).
 *
 * Phase 10B raised 3 and 4 by ~20x and broke the old `KICK_W_k ∝ k`
 * proportionality, because `turn` is much smaller in practice than the
 * contract's −1..1 range suggests. `turn` is the normalised cross product of
 * two CONSECUTIVE gesture velocity samples, ~16 ms apart, so it is
 * `sin(direction change per frame)`: even an aggressively curved fling only
 * turns a few degrees per frame, giving |turn| ≈ 0.05–0.2, not ≈ 1. At the
 * old 6e-4 a 2000 pt/s fling with turn = 0.1 added 0.12 rad/s to `w3` —
 * indistinguishable from the 0.13 rad/s idle floor, i.e. phase 9B's traveling
 * wave never actually appeared on a real gesture. At 0.012 the same gesture
 * adds 2.4 rad/s, which over `TAU_W` integrates to ~3.8 rad of `phi3` ≈ 1.8
 * mode-3 lobe spacings of visible travel.
 *
 * Mode 2 is deliberately left ~24x below mode 3 rather than following the
 * ∝ k rule: `phi2 = 2·angle`, so `w2` rotates the stretch axis in REAL space
 * at `w2 / 2`, and that rotation is the one thing that reads as the whole
 * bubble turning rather than as a pattern running around a stationary rim.
 * At 5e-4 a realistic curved fling (2000 pt/s, |turn| 0.1–0.2) turns the axis
 * a total of 7–14° over the ~5 s the kick lives — under the idle crawl's own
 * 2.3°/s, so invisible as rotation — while the worst case the formula admits
 * (a single-frame direction reversal, |turn| → 1) is held to ~60°, half of
 * what 1e-3 gave.
 *
 * TUNE (KICK_W_2): WARNING — this is what reads as the whole bubble
 * spinning. Keep <= 1e-3.
 * TUNE (KICK_W_3): lobes travelling on a CURVED fling. 0.004 subtle · 0.03
 * races around. KICK_W_4 follows it.
 */
export const KICK_W_2 = 5e-4;
export const KICK_W_3 = 0.012;
export const KICK_W_4 = 1.5 * KICK_W_3;

/**
 * Below this `|turn|` (the cross product of the last two non-zero gesture
 * velocity samples, normalised to −1..1), a fling is treated as straight —
 * no circulation is kicked in.
 */
export const TURN_EPS = 0.05;

/**
 * Hard cap on every phase angular velocity `|w_k|`, rad/s.
 *
 * Phase 10B: 6 → 3. With the `KICK_W_k` above, the pathological case — a
 * single-frame direction reversal at the moment of release, where `turn`
 * really does approach 1 — would otherwise pin `w3`/`w4` at 6 rad/s. Mode k's
 * pattern rotates in real space at `w_k / k`, so that is 85–115°/s sustained
 * for several `TAU_W`: unmistakably a spinning bubble. 3 rad/s caps the worst
 * case at ~45–57°/s, which is still fast travel but stays readable as the
 * pattern moving rather than the object turning. It does not bind for any
 * realistic gesture (expected `w3` excess ≈ 2.4 rad/s).
 */
export const W_MAX = 3;

// ============================================================================
// Wobble visibility — a live master knob over the mode 3/4 wobble
// ============================================================================
//
// Every mode-3/4 amplitude above is a FRACTION of R (`a3`/`a4` multiply the
// radius in the shader), so the wobble is PROPORTIONAL: `a3 = A3_REST = 0.022`
// is ±0.9 pt at the rest radius (R=40) and ±3.1 pt at the max pinch radius
// (R=140). The knob below is a bare multiplier over that — it does NOT
// compensate for R.
//
// A radius-compensated variant (`vis = wobble * WOBBLE_REF_R / R`) was tried
// first, on the theory that a real droplet's surface ripples do not grow just
// because the droplet does. It was wrong for this look: it divided the wobble
// by 3.4x at the max radius, and a big bubble is exactly where there is room
// for the lobes to read at all. Proportional means one number is tuned for one
// radius and accepted at the others — a real tradeoff, but the large-radius
// end is the one worth having.

/**
 * Master wobble visibility multiplier: 0 = perfectly smooth sphere (mode 3/4
 * contribution fully suppressed), 1 = the current tuning as authored above,
 * 2 = double. Applied as `vis = wobble`, flat — see `stepBubbleModes`.
 *
 * The only ceiling is `A_MAX` (0.15), which the amplitudes hit at roughly
 * `wobble = 4` on mode 3; past that the clamp flattens the idle breathing
 * into a hold.
 *
 * TUNE: overall wobble presence. 0 still glass · 2 ceiling before it fights
 * the "clear sharp center" look.
 */
export const WOBBLE_DEFAULT = 1;

// ============================================================================
// Per-bubble inertia and strength
// ============================================================================
//
// Two more per-bubble multipliers, both default 1, layered on top of the
// K2..K4/C2..C4 springs above. `inertia` (I) is how heavy the bubble feels;
// `strength` (S) is how stiff its surface is. `stepBubbleModes` computes one
// `springScale = S / I` per step and multiplies every mode's K and C by it:
// `K_eff = K * springScale`, `C_eff = C * springScale`. Since `omega0 =
// sqrt(K)` and `zeta = C / (2*sqrt(K))`, scaling K and C by the SAME factor
// scales BOTH `omega0` and `zeta` by `sqrt(S/I)`, and the envelope's decay
// rate `zeta*omega0 = C/2` by `S/I`. So a heavy bubble (I > 1, S/I < 1) is
// slower, overshoots more and rings longer; a strong one (S > 1, S/I > 1) is
// faster, overshoots less and snaps back; a weak one (S < 1, S/I < 1) wobbles
// longer — the same as heavy, because on the springs inertia and strength
// are reciprocal. `strength` alone also divides the mode 3/4 idle targets
// (rest wobble ∝ 1/S): a weak surface sits more deformed at rest. `inertia` alone additionally scales the release kicks
// (`KICK`/`KICK_W_*`), the mode-2 stretch cap (`A2_MAX`, up to `A2_MAX_CEIL`)
// and the follow-spring mass in `useBubbleGestures.tsx` — none of those are
// spring stiffness/damping, so `strength` does not touch them.

/** Default per-bubble inertia multiplier — 1 reproduces today's feel exactly. */
export const INERTIA_DEFAULT = 1;

/** Default per-bubble strength multiplier — 1 reproduces today's feel exactly. */
export const STRENGTH_DEFAULT = 1;

/**
 * Floor on both `inertia` and `strength` — guards `springScale = S/I` (and
 * the standalone `I` uses) against divide-by-zero / zero-stiffness at the
 * slider's low end.
 *
 * TUNE: how weightless/floppy the extremes can go. 0.1 is already very light.
 */
export const MULT_MIN = 0.1;

/**
 * Absolute ceiling on the inertia-scaled mode-2 stretch cap
 * (`Math.min(A2_MAX_CEIL, A2_MAX * inertia)`), same value as `A2_MAX`'s own
 * TUNE ceiling note — above this the overshoot clips against `A_MAX`.
 */
export const A2_MAX_CEIL = 0.11;

// ============================================================================
// Float — the bubble moving on its own (hooks/useBubbleFloat.ts)
// ============================================================================
//
// Canvas points, y DOWN. Per frame while not dragged:
//   v.y −= FLOAT_BUOYANCY · buoyancy / I · dt      (minus = up)
//   v.x += FLOAT_SWAY · sin(2π t / FLOAT_SWAY_PERIOD + φ) · dt
//   v   *= exp(−FLOAT_DRAG / √I · dt)
// Terminal rise speed = FLOAT_BUOYANCY / FLOAT_DRAG = 80 pt/s at I = 1
// (40 / √I in general: ~51 pt/s at I 2.5, ~146 at I 0.3). A launch speed
// decays with τ = √I / FLOAT_DRAG = 2 s. Sway: velocity amplitude
// SWAY / ω = 60 / 2.1 ≈ 29 pt/s, position amplitude ≈ 29 / 2.1 ≈ 14 pt.

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
 * Release fling cap, pt/s — a hard flick can't send the bubble through
 * several edge bounces in a frame or two.
 *
 * TUNE: 1500 tame · 2500 · 4000.
 */
export const FLOAT_FLING_MAX = 2500;

/**
 * Respawn once the center is this many radii above the top edge. > 1 so
 * the stretched, wobbling rim is off-screen too.
 *
 * TUNE: 1.0 respawns as the round rim leaves · 1.3 · 2.0 lingers off-screen.
 */
export const FLOAT_EXIT_RADII = 1.3;

// ============================================================================
// Birth — each bubble inflates out of the spawn box (hooks/useBubbleFloat.ts)
// ============================================================================
//
// Spawn → inflate (attached at the box's top edge, R springs ≈ 1 → target
// over BIRTH_TIME) with the motion easing in up the launch cone over the
// same BIRTH_TIME → float → out the top → spawn again. Every bubble rolls its own multipliers on the slider
// values, so the sliders stay the BASE and are never overwritten. Ranges are
// [min, max], drawn uniformly.

/** Radius the spawner starts from, pt — not 0, so nothing divides by zero. */
export const BIRTH_RADIUS_START = 1;

/**
 * Target radius as a multiple of `restRadius`.
 *
 * TUNE: [0.8, 1.2] uniform sizes · [0.6, 1.5] · [0.4, 2.0] pebbles to balloons.
 */
export const BIRTH_RADIUS_RANGE: readonly [number, number] = [0.6, 1.5];

/**
 * Birth time `T`, seconds. Inflation and motion start together at spawn and
 * both run over `T`: the spring grows R ≈ 1 → target, while the motion eases
 * in (smoothstep 0 → full launch speed). At `T` the bubble is full size, at
 * full speed, and hands off to FLOAT.
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
 * plus random 3- and 4-lobe amplitudes. The modes spring these back to rest
 * as the bubble rises. Sum of maxima 0.14 stays under `A_MAX` (0.15).
 *
 * TUNE: halve for a subtle birth · these · anything past A_MAX gets clamped.
 */
export const BIRTH_A2_RANGE: readonly [number, number] = [0.02, 0.07];
export const BIRTH_A3_MAX = 0.04;
export const BIRTH_A4_MAX = 0.03;

// ============================================================================
// Film drift
// ============================================================================

/** `filmPhase += dt * FILM_DRIFT`, drives the thin-film color cycle (phase 8B). */
export const FILM_DRIFT = 0.15;

// ============================================================================
// Frame timing
// ============================================================================

/**
 * `dt` (ms) is clamped to this range before every physics step.
 *
 * `DT_MAX_MS` was 33. The target frames are 8.4 ms (120 Hz) and 16.7 ms
 * (60 Hz); the cap only bites on a dropped frame. At the slider extremes
 * (strength 2.5, inertia 0.3 → `springScale` 8.3) a 33 ms step made the
 * semi-implicit Euler springs unstable (growth ×2.3 per step on mode 4).
 * At 20 ms the same case decays (spectral radius ≤ 0.63), and a stall
 * advances the physics by at most 20 ms instead of jumping.
 */
export const DT_MIN_MS = 1;
export const DT_MAX_MS = 20;

// ============================================================================
// Optics defaults (phase 8B) — see "Shader math" in the divergence doc
// ============================================================================
//
// These are the START values for the two optics uniforms. Phase 9B owns the
// final feel of `iRefract`/`iFilm`/`iColor`; 8B only needs them to exist and
// to be the single source of truth for the bbox padding below.

/**
 * `iRefract`: maximum refraction sample offset at the rim, in points. The
 * shader offsets the image sample by `iRefract * (1 - nz)` along the analytic
 * surface normal, so this is 0 at the center and `iRefract` at the rim.
 *
 * Phase 10B: 14 → 9. This is an ABSOLUTE point offset while the bubble's
 * radius is not: at the `maxRadius` 140 it is 10% of the radius and reads as
 * a believable bend, but at the `restRadius` 40 — where the bubble actually
 * sits most of the time — 14 pt was 35% of the radius. The outer third of the
 * disk sampled past the edge of the image rect (which is only `2·R·1.1`
 * across) and returned clamp-repeated edge pixels, so the small bubble
 * rendered as a smeared dark ring around a squeezed face. 9 pt is 22% at rest
 * and 6% at full size: still visible refraction at both ends without the
 * small-radius smear. (Making the offset proportional to R would be the real
 * fix, but that is shader work and out of this phase's scope.)
 *
 * TUNE: refraction. 4 flat glass · 12 ceiling (above = smeared rim).
 */
export const REFRACT = 9;

/**
 * `iFilm`: thin-film iridescence strength, 0..1.
 *
 * Phase 10B: 0.8 → 0.55. The fresnel weight is `om³` (`om = 1 − nz`), which
 * still carries real weight a good way in from the rim, so at 0.8 the film
 * did not read as an edge highlight — it read as a broad olive/maroon halo
 * ~15 pt deep, muddying the "clear sharp center" the look is built around.
 * Lowering the strength pulls the perceptible band back to the outer few
 * points, where `om³` is genuinely near 1 — the rainbow living ON the rim,
 * which is what the divergence doc's reference images describe.
 *
 * TUNE: rainbow. 0.3 hint · 0.7 ceiling (above = thick halo).
 */
export const FILM = 0.55;

/**
 * Soap-film overlay only (filmOverlayShader.ts): how far in from the rim the
 * film reaches. Scales the fresnel exponent, `om^(3·(1 − reach))` — 0 keeps
 * the rim-only `om³` weight above, 1 drops the exponent to 0 so the film
 * covers the whole bubble evenly (strength is then just `iFilm`).
 *
 * TUNE: reach. 0 rim only · 0.6 half the body · 1 whole bubble.
 */
export const FILM_REACH = 0;

/**
 * `iColor.a`: tint WEIGHT of `iColor.rgb` over the refracted body (not
 * opacity). Was the literal `0.35` in each demo's `BUBBLE_COLOR`; lifted here
 * so the live tuning panel has one default to start from.
 *
 * TUNE: tint. 0 clear glass · 0.6 ceiling (above = colored disk).
 */
export const TINT = 0.35;

/**
 * `iOptics.x`: how much the dark rim line darkens, 0..1. Was the literal
 * `0.35` in the shader; lifted to a uniform for live tuning, value unchanged.
 *
 * TUNE: rim line. 0 none · 0.7 ink outline.
 */
export const RIM_DARK = 0.35;

/**
 * `iOptics.y`: width of the dark rim line, in points (the shader's
 * `smoothstep(width, 0, d)`). Was the literal `3.0`. Must stay > 0 —
 * `smoothstep` with equal edges is undefined.
 *
 * TUNE: rim width. 1 hairline · 8 soft vignette.
 */
export const RIM_WIDTH = 3;

/**
 * `iOptics.z`: thin-film band count across the rim (`tf = om · this +
 * filmPhase`). Was the literal `2.5`.
 *
 * TUNE: film bands. 1 one soft hue shift · 6 tight rainbow rings.
 */
export const FILM_SCALE = 2.5;

/**
 * `iOptics.w`: exponent on the optics weight, `om = (1 − nz)^this`. Controls
 * how deep refraction and film reach in from the rim. 1 reproduces the
 * pre-lever shader exactly. Must stay > 0 (`pow(0, ≤0)` is undefined).
 *
 * TUNE: lens depth. 0.5 thick lens (bends deep) · 3 thin shell (edge only).
 */
export const OPTICS_FALLOFF = 1;

// ----------------------------------------------------------------------------
// Gargantua-derived levers (Live shader only, for now)
// ----------------------------------------------------------------------------
//
// Ported from `gargantua-type-gpu/centerBubbleScene.ts`. All default to OFF so
// the bubble's look is unchanged until tuned; the Gargantua values are in each
// TUNE note and in `GARGANTUA_PRESET` (`hooks/useBubbleOptics.ts`).

/**
 * `iLens.x`: radial lens warp, as a fraction of R, scaled by `(dist/r)²`.
 * + pulls samples toward the center (magnify), − pushes out (pincushion).
 * Negative values reach OUTSIDE the rim, so the Live clip pads by `R·max(0,−lens)`.
 *
 * TUNE: lens. Gargantua 0.5 · −0.3 fisheye-in.
 */
export const LENS = 0;

/**
 * `iLens.y`: chromatic aberration at the rim, fraction of R. R/B channels are
 * re-sampled ±`R·this·edge` along the radial — 2 extra texture taps, skipped
 * when 0.
 *
 * TUNE: dispersion. Gargantua 0.9 · 0.2 subtle fringe.
 */
export const DISPERSION = 0;

/**
 * `iLens.z`: width of the rim band (`edge = smoothstep(1 − this, 1, dist/r)`)
 * used by dispersion and the rainbow. Must stay > 0.
 *
 * TUNE: edge band. Gargantua 0.1 · 0.3 wide.
 */
export const EDGE_WIDTH = 0.1;

/**
 * `iLens.w`: specular highlight strength, light from `(-0.4, -0.6)` (up-left)
 * against the analytic normal, so the highlight follows the wobble.
 *
 * TUNE: specular. Gargantua 1.0.
 */
export const SPECULAR = 0;

/** `iPrism.x`: angular rainbow mixed into the rim band. TUNE: Gargantua 0.15. */
export const RAINBOW_MIX = 0;

/** `iPrism.y`: additive rainbow glow on the rim band. TUNE: Gargantua 0.05. */
export const RAINBOW_GLOW = 0;

/**
 * `iPrism.z`: halo reach outside the rim, fraction of R. Must stay > 0. The
 * Live clip pads by `R·this` because the halo draws there.
 *
 * TUNE: halo spread. Gargantua 0.2.
 */
export const HALO_SPREAD = 0.2;

/**
 * `iPrism.w`: halo opacity, SIGNED: + light halo, − dark halo. Gargantua uses
 * +0.15 (white on a dark scene); on this demo's white backdrop only − shows.
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
 * Extra padding added to the harmonic-field bounding box, in points.
 *
 * `AA_PAD` only — deliberately NOT `REFRACT + AA_PAD`, which is what the
 * "Physics contract" in `temp/liquid-bubbles-divergence.md` specifies. That
 * formula is wrong, and the doc has been corrected to match this.
 *
 * The `<Rect>` has to cover every pixel where the shader returns a non-zero
 * alpha, and `alpha = smoothstep(-0.75, 0.75, r − dist)` depends on `r` and
 * `dist` ONLY. Refraction changes `uv` — WHICH texel is sampled — not where
 * alpha is non-zero, and the dark rim line and thin film only scale `col`. So
 * nothing is ever drawn beyond `r + 0.75`, and `AA_PAD = 2` already covers the
 * feather with room to spare.
 *
 * Padding by `iRefract` instead cost real fill for no pixels: at the rest
 * radius R=40 the shaded area went from ~8.1k pt² to ~13.9k pt² (×1.7). This
 * demo's shaders are GPU-fill-bound (see the gooey-border findings in project
 * memory — the 128-ball cliff was fragment fill, not CPU), so a 1.7× fill
 * multiplier on the one region we shade is the most expensive kind of mistake
 * to leave in.
 */
export const BBOX_PAD = AA_PAD;
