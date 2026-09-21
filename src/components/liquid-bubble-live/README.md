# Liquid Bubble Live

A wobbly glass bubble that bends whatever is drawn behind it, live.

Drag to move it, pinch to resize it. It refracts through a Skia
`<BackdropFilter>`. Self-contained: everything it needs is in this folder.

## Files

- `LiquidBubbleLive.tsx`: canvas, background, backdrop clip, panel
- `BouncingImagesBubble.tsx`: Bounce mode — images bouncing inside one big bubble
- `ArcCarouselBubble.tsx`: Arc mode — image wheel on a bottom semicircle, bubble at its top slot
- `shaders.ts`: the bubble shader
- `filmOverlayShader.ts`: the soap-film overlay pass (film from `soap-film`)
- `bubbleModes.ts`: physics + look constants
- `liveConfig.ts`: background + clip constants
- `BubbleTuningPanel.tsx`: the controls
- `hooks/`: gestures, float, image bubble, shape physics (`bubbleModeMath` + test), optics, film motion, clock

## Controls

Every slider has a ↺ reset. **Reset all** restores defaults. **Gargantua**
loads the look from `gargantua-type-gpu/centerBubbleScene.ts`.

| Tab        | Slider               | What it does                                                                                                 |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Shape      | Float: On/Off        | Bubbles inflate out of the box and float (rise, sway, bounce, respawn) · off = park                          |
|            | Buoyancy             | How strongly it rises · 0 drifts without rising (× each bubble's random trait)                               |
|            | Wobble               | How much the edge wobbles                                                                                    |
|            | Inertia              | How heavy the bubble feels — lags more, rings longer, bigger release kick, stretches further                 |
|            | Strength             | How stiff the surface is — higher snaps back faster and rests rounder, lower wobbles longer and more at rest |
| Refraction | Refract              | How far the rim bends the background                                                                         |
|            | Lens falloff         | How deep the bending reaches from the rim                                                                    |
|            | Lens                 | + magnify, − pincushion                                                                                      |
|            | Dispersion           | Rainbow color split at the rim                                                                               |
|            | Edge width           | Width of the rim band                                                                                        |
| Surface    | Soap film: On/Off    | Swap the built-in cosine film for the animated soap-film overlay                                             |
|            | Film                 | Film strength (both films)                                                                                   |
|            | Film reach           | Soap film only: 0 rim only · 1 covers the whole bubble                                                       |
|            | Film drag            | Soap film only: how far the film lags the bubble's motion · 0 off · 1 calibrated · 2 exaggerated             |
|            | Film bands           | Number of built-in film color bands (soap film off)                                                          |
|            | Tint                 | Blue tint amount                                                                                             |
|            | Specular             | Shine highlight, top-left                                                                                    |
| Rim        | Rim dark / Rim width | Dark outline strength and width                                                                              |
|            | Rainbow mix / glow   | Rainbow color around the rim                                                                                 |
|            | Halo spread / Halo   | Glow outside the bubble (− dark, + light)                                                                    |

Defaults for every control live in `bubbleModes.ts`.

Tests: `bun test src/components/liquid-bubble-live/hooks/bubbleModeMath.test.ts`

## Design notes

### LiquidBubbleLive.tsx

Divergence phase 12B (`temp/liquid-bubbles-divergence.md` → "Refraction
source"): the harmonic bubble from the retired `liquid-glass-bubble` demo,
refracting LIVE content instead of a still image. Its physics, gestures and
controls now live in this folder; the notes below comparing against the
still-image version are history.

**Why this is a separate demo, not a flag**

The two differ in pass structure, not in a prop. The still-image version is:

```
pass 1: draw Rect, shader samples a child ImageShader → store
```

— one pass, the photo already a texture. This one is:

```
pass 1: draw the background                        → STORE (forced:
        the backdrop must be samplable)
pass 2: bubble shader reads that snapshot          → store
pass 3: composite the layer back onto the canvas   → store
```

Pass 3 exists only because Skia's `saveLayer` is a TEMPORARY it has to paste
back; there is no "keep this layer between frames" in Skia. Clipping bounds
how much AREA each pass touches, but not how many passes there are, and on a
tile-based GPU each break is real main-memory traffic. That is the price of
live content on this route, and it is why the doc lists a 2-pass
WebGPU/TypeGPU variant as the alternative if these three ever prove too many.

**Flow:**

1. Gestures and physics are IMPORTED from the still-image demo, not
   reimplemented: `useBubblePanGesture` / `useBubblePinchGesture` own the
   anchor and radius, `useBubbleShape` steps `stepBubbleModes` on the UI
   runtime and publishes the double-buffered 12-float `iParams` buffer plus
   the shape bbox. The mode state is renderer-independent — nothing in it
   knows whether the thing behind the bubble is a photo or a live scene.
2. A `<Fill>` draws the live background (`backgroundShaders.ts`) FIRST, so
   it is what Skia snapshots as the backdrop. It has to live inside this
   same `<Canvas>`: sibling RN views are composited by CoreAnimation only
   after Skia has finished, so at shader time there is nothing behind the
   Canvas to read.
3. `<BackdropFilter>` runs the bubble effect over that snapshot. Skia binds
   the snapshot to the effect's single `uniform shader` slot; there is no
   `<ImageShader>` child here and therefore no `tx/ty="clamp"` guardrail.
4. `clipRect` is the shape bbox grown by `REFRACT + CLIP_SLACK`. This is the
   ONE place where the still-image demo's `BBOX_PAD` reasoning inverts — see
   `liveConfig.ts`. A clip governs which pixels are READABLE, and the rim
   samples outward; the draw rect governs where alpha is non-zero, and that
   never leaves `r + 0.75`.

**Key features:**

- The 12-float physics buffer is forwarded to the shader VERBATIM. The
  backdrop filter was expected to need a PixelRatio conversion (a runtime
  shader image filter is usually handed the layer's device space); measuring
  it showed this one runs in absolute canvas POINTS, so there is nothing to
  rescale and nothing allocated per frame. See `shaders.ts` for the
  measurement and how to redo it.
- Outside the bubble the filter returns alpha 0, and the layer composites
  src-over, so the clip rect never reads as a visible box over the
  background.
- `LIVE_REFRACT` (18 pt) is a demo-local starting `iRefract`, not the
  still-image demo's `REFRACT` (9); it is now live-tunable via
  `BubbleTuningPanel`, so the clip pads by the current slider value, not the
  constant. That 9 exists to stop the rim sampling past the edge of a small
  `<ImageShader>` rect; the backdrop is the whole canvas, so the bend can be
  twice as strong without smearing.
- `SHOW_FPS_OVERLAY` mounts `FpsOverlay`. Note the simulator caps at 60 Hz,
  which pins `j120` at 100% and makes it carry no signal — real numbers need
  a release build on a 120 Hz device.
- `SHOW_TUNING_PANEL` mounts `BubbleTuningPanel` (Wobble + the 7 optics
  levers), all `SharedValue`s written on the UI thread with no React
  re-render per tick.

### ArcCarouselBubble.tsx

Arc mode: the `assets/liquid-glass-bubble` images as rectangular thumbnails
(each keeps its own aspect) on a semicircle at the bottom, a fixed glass
bubble at the arc's top slot, and the top image as the full-screen
background.

```
 pan (UI)      offset = start − dx / (arcR · STEP)        STEP = 2π / N (wraps)
 release (UI)  offset = withSpring(round(offset + v · 0.25), SPRING_ARC_SNAP, velocity v)
 item i        d = wrap(i − offset), θ = d · STEP
               x = cx + arcR·sinθ, y = cy − arcR·cosθ, height × 1.4 at θ 0 → 1 at ±STEP
               fades out below the horizon (90° → 115°), not drawn past it
 background i  weight = max(0, 1 − |d|), blend "plus" over black
 draw          black → backgrounds → thumbnails → BackdropFilter bubble → soap film
 film motion   virtual bubble x = cx + offset · stepPx → useBubbleFilmMotion
```

- **Crossfade:** "plus" makes the two nearest layers sum to an exact mix, in
  any draw order (a src-over pair breaks at the 9 → 0 wrap). Layers with
  weight 0 get height 0, so at most 2 full-screen images are drawn.
- **Images load once** with Skia's `useCollectionLoading`, shared by the
  background and the thumbnail. All 10 stay decoded at full size.
- **Bubble:** fixed; `isActive` + the release velocity (× `BUBBLE_KICK`) feed
  `useBubbleShape`, so a flick makes it wobble. Radius = `BUBBLE_FIT` (1.35) ×
  the widest centered rectangle's half-diagonal, so its corners stay off the
  rim; Shape → Size scales it 0.6–1.6×.
- **Soap film:** the bubble never moves, so the film lags the wheel instead:
  content sliding right under the glass reads as the bubble moving left.
- **Controls:** `BubbleTuningPanel` via its `style` prop at the top (the arc
  owns the bottom), starting on Hide. No Float / Buoyancy.
- **Geometry** comes from `onLayout`, not the window, so the arc sits on the
  real bottom edge under the header.

### shaders.ts

Liquid Bubble Live — harmonic bubble shader, as a BACKDROP image filter
(divergence phase 12B, Skia route).

Originally a port of the retired `liquid-glass-bubble` still-image shader
(history below compares against it). The field, the analytic
`dr/dθ`, the normal, the refraction sample, the thin film and the dark rim
are IDENTICAL line for line. Two things, and only two things, differ:

1. **What `iImage` is.** In the still-image demo it is a child
   `<ImageShader>` — a photo, already a texture, mapped onto the bubble.
   Here it is the BACKDROP: Skia's snapshot of everything already drawn in
   this Canvas, bound automatically to the effect's single `uniform shader`
   slot by `SkImageFilters::RuntimeShader`. That is why this effect must
   declare EXACTLY ONE child shader — with no explicit child name, Skia
   requires the effect to have precisely one, and binds the input to it.

2. **What `iRefract` can be.** The still-image demo caps it at 9 pt because
   its `<ImageShader>` rect is only `2·R·1.1` across, so a bigger offset
   sampled past the photo's edge and smeared clamped edge pixels into a dark
   ring at the rest radius. The backdrop is the whole screen, so that
   constraint is gone — see `LIVE_REFRACT` in `liveConfig.ts`.

**Coordinate space — measured, not assumed**

A backdrop `RuntimeShader` filter was expected to run in DEVICE PIXELS: the
`<Group layer>` note in project memory says "the layer-filter uniforms run
in DEVICE pixels → multiply by pd", and `SkRuntimeShaderImageFilter`
declares only a translate matrix capability, which usually means Skia bakes
the CTM scale into the layer. On iOS with `@shopify/react-native-skia`
2.10.2 that is NOT what happens here. Rendering `half4(p.x/1200, p.y/2600,
0, 1)` from this filter and reading the corner pixels back gave a red ramp
reaching ~0.36 at the right edge, not ~1.0 — i.e. `p` tops out near the
canvas width in POINTS (~400), not in pixels (~1200). Two consequences,
both load-bearing:

- `p` and `iImage.eval(uv)` are both in POINTS, so `iParams` is forwarded
  from `useBubbleShape` verbatim with no rescale and no per-frame
  allocation, and every line below is byte-for-byte the still-image
  shader.
- `p` is ABSOLUTE canvas points, not relative to the backdrop clip. The
  bubble lands under the finger with a clip that tracks it, which would
  not happen if the clip's top-left were the origin.

The memory note is not wrong, it just describes a different setup: there the
content had already been scaled by `pd` by the DPR trick's inner `<Group>`,
so the filter's space was `pd ×` logical. Nothing scales the content here.
The rim was checked at native resolution for the stair-stepping that a
logical-resolution intermediate would cause, and it is clean — so the DPR
trick is not needed on this path. If this is ever ported to Android, MEASURE
IT AGAIN with the same one-line diagnostic rather than trusting this
paragraph.

**Flow (per pixel, no loop):**

1. `q = pp − c` → `dist`, `th` (ONE atan2).
2. ONE pass over the three modes yields BOTH `r` and `dr` (= dr/dθ) from
   the same three angle arguments: 3 cos + 3 sin. **`r` is evaluated exactly
   once per pixel** — there is no second field evaluation anywhere below,
   and no finite-difference normal.
3. `alpha = smoothstep(-0.75, 0.75, r − dist)` — analytic AA, 1.5pt wide.
4. Shell tilt `nz = sqrt(1 − (dist/r)²)`: 1 at the center, 0 at the rim.
   Everything optical is weighted by `om = 1 − nz`.
5. The surface normal comes from `r` and `dr` ANALYTICALLY: for
   `P(θ) = r(θ)·(cosθ, sinθ)` the outward normal is `radial − tang·(r'/r)`
   after normalising, so a wobbly rim bends the normal.
6. `uv = p + n·iRefract·om` samples the backdrop. ONE texture tap. Zero
   offset at the center, `iRefract` pt of outward displacement at the rim —
   which is why the `BackdropFilter`'s clip must be padded by `iRefract`
   (see `liveConfig.ts`): the snapshot is bounded by that clip and returns
   TRANSPARENT outside it.
7. Thin film weighted by `om³`, then the dark rim line.

DIVERGENCE from the retired still-image shader: this one alone carries the
Gargantua-derived levers (`iLens`, `iPrism`, ported from
`gargantua-type-gpu/centerBubbleScene.ts`) — radial lens warp, rim
chromatic aberration (+2 taps when on), angular rainbow, specular, and a
signed halo drawn OUTSIDE the rim. Superellipse `shapeN` was not ported:
it would fight the harmonic shape. All default off (see `bubbleModes.ts`).
The halo and the pincushion/dispersion reads go past the rim, so the
`BackdropFilter` clip pads for them in `LiquidBubbleLive`.

The filter's output is composited over the untouched background with
src-over (`saveLayer(undefined, null, filter)` then `restore()`), so the
`alpha = 0` region outside the bubble leaves the live background showing
through — the clip rect is not a visible box.

### filmOverlayShader.ts

Puts the animated soap film from `src/components/soap-film` (curl-noise
flow, vortices, ring bands) on the bubble.

**Why a second pass, not a child shader.** The bubble is a `<RuntimeShader>`
image filter inside `<BackdropFilter>`, and that filter's single child slot
is the backdrop. It cannot also take the film as `uniform shader film`. So
the film is drawn after the `BackdropFilter`, as a `<Rect>` over the same
`clipRect`:

```
pass 1: BackdropFilter → bubble shader (built-in film zeroed: iFilm = 0)
pass 2: Rect(clipRect) → overlay shader
          ├─ child: SoapFilmShader output="thickness"
          └─ child: 20x1 ramp ImageShader
```

**Same shape, same weight.** The overlay reads the same `iParams` buffer and
re-derives the harmonic radius, AA alpha and shell tilt `nz` with the same
math as `shaders.ts`, so it tracks every wobble, pinch and inertia frame.
It composites with `fresnel · iFilm · alpha`. src-over with that weight is
the bubble's own `mix(col, film, f · iFilm)`, now as a separate pass.

**Film space.** The film is sampled in bubble-local coordinates: the rest
disk (radius `R`) maps onto the inscribed circle of a virtual
`FILM_OVERLAY_SIZE` square. The film rides with the bubble, the rings center
on it, and wobble shows as the rim cutting through the pattern.

**Color.** The shared `SOAP_FILM_COLOR_FN` from `src/lib/shaders/soapFilm.ts`,
so the palette can never drift from the standalone demo. It gets the
bubble's real per-pixel view angle (`cosθ = nz`, clamped ≥ 0.2), which
shortens the optical path toward the rim and shifts colors there.

**Film reach.** `f = om^(3·(1 − reach))`: 0 is the bubble's rim-only `om³`,
1 drops the exponent to 0 so the film covers the whole disk evenly.

**Toggle.** React state mounts/unmounts the pass (off = no fill cost); a
`SharedValue` mirror zeroes the bubble's built-in film on the UI thread.

**Known limits**

- The overlay draws AFTER the whole bubble, so near the rim it partly covers
  the specular, rainbow rim and dark rim line, which the built-in film sat
  under. The fix, if needed, is moving those terms into the overlay pass.
- Extra fill: the film shader (5-step backtrace × 3 curl layers + 2 vortex
  phases) runs over the whole clip rect. The bubble is already fill-bound;
  watch the FPS overlay when pinched large.
- Film controls beyond Film / Film reach / Film drag use the soap-film
  defaults (`soap-film/soapFilmConfig.ts`).

**Film motion.** Moving the bubble drags its film behind the direction of
travel, and the film sloshes back once the bubble stops
(`hooks/useBubbleFilmMotion.ts`, constants in `bubbleModes.ts` → "Film
motion"):

```
 UI worklet   v = Δ(bubbleX, bubbleY) / dt    (spring-smoothed, so it keeps
                                               seeing motion after release)
              |v| ≥ FILM_DRAG_SPEED_MIN, every FILM_DRAG_WRITE_INTERVAL
              → vFilm = −v · (200 / R) · FILM_DRAG_GAIN · drag, ≤ FILM_DRAG_MAX
              → impulse at the film center, into the 8-slot touch ring
 overlay      flow.touchTau = FILM_DRAG_TAU × inertia, flow.touchRadius =
              FILM_DRAG_RADIUS → soap-film's touchVelocity() in the backtrace
```

- The minus sign makes the backtrace sample ahead of travel, so the pattern
  shifts backward. GAIN 1 would pin the film to the world; 0.4 is a partial
  lag that reads as sloshing.
- Heavier bubbles (inertia) slosh longer. Nothing is written while the soap
  film is off.
- `touchTau` / `touchRadius` override the soap-film demo's finger-poke
  defaults (0.18 radius is a local poke; 0.45 moves the whole disk).
- Live lever: Surface → **Film drag** (0 off · 1 calibrated · 2 exaggerated).

### bubbleModes.ts

Liquid Bubbles — harmonic mode constants (divergence phase 5B+).

Pure data: the buffer shape shared between the physics step
(`hooks/bubbleModeMath.ts`, phase 6B) and the `iParams` uniform in
`shaders.ts`, plus the spring/idle tuning constants that
`stepBubbleModes` (phase 6B) will read. No React, no Skia, no Reanimated
imports here — safe to import from a worklet or from plain TS.

See `temp/liquid-bubbles-divergence.md` → "Physics contract" for the
derivation of every constant below. Do not re-derive or re-tune these in
phase 5B; phase 9B is the only phase that retunes feel.

### liveConfig.ts

Liquid Bubble Live — demo-local constants (phase 12B, Skia route).

Everything the harmonic bubble itself needs — mode springs, amplitudes,
`REFRACT`, `FILM`, `BBOX_PAD` — lives in `./bubbleModes.ts` (moved here
from the retired `liquid-glass-bubble` demo). This file holds only what is
specific to refracting LIVE content: the backdrop clip padding and the
background scene's own look/speed.

No React, no Skia imports — safe to read from a worklet.

### backgroundShaders.ts

Liquid Bubble Live — the live background (phase 12B, Skia route).

This is the content the bubble refracts. It is drawn as a plain `<Fill>`
INSIDE the same `<Canvas>` as the bubble, because that is the only place it
can be: the Canvas is one iOS view backed by one Metal texture, and sibling
React Native views are composited by CoreAnimation only AFTER Skia has
finished — at the moment the bubble's shader runs there is nothing "behind"
it to read (see `temp/liquid-bubbles-divergence.md` → "The surface
boundary").

**Flow (per pixel):**

1. `uv = p / iResolution.y` — aspect-preserving, so the bands keep their
   angle on any screen. `p` is in POINTS here: an ordinary `<Fill>` shader
   draws straight into the canvas and never goes through a layer, so unlike
   `shaders.ts` there is no device-pixel conversion to do.
2. One scrolling diagonal coordinate → `fract` → 4 hard-edged colour bands.
   Hard edges on purpose: a smooth gradient hides refraction, a hard edge
   makes every point of the bend visible.
3. A drifting grid, moving on a different axis at a different rate, so the
   two motions never lock and the scene never looks like a still.

**Cost:** one divide, ~2 `fract`, one `floor`, a 4-way branch, one `min`, one
`smoothstep`. Deliberately cheap — this is the thing being refracted, not
the thing being measured.

### BubbleTuningPanel.tsx

Live tuning levers for the harmonic bubble, shared by `LiquidBubbles` and
`LiquidBubbleLive`. Every slider writes a `SharedValue` on the UI thread
(`TuningSlider`), so dragging never re-renders React.

**Flow:**

1. Tab row: Hide · Shape · Refraction · Surface · Rim (React state — changes
   only on tap). Wraps onto two lines on a ~393pt phone.
2. Shape → Wobble (mode 3/4 master multiplier).
3. Refraction → Refract, Lens falloff, Lens, Dispersion, Edge width.
4. Surface → Film, Film bands, Tint, Specular.
5. Rim → Rim dark, Rim width, Rainbow mix, Rainbow glow, Halo
   spread, Halo.
6. Every slider is wrapped in `ResettableSlider`, pairing it with a small
   "↺" button that snaps that one value back to its default.
7. When a slider tab is open, a row of two buttons sits under the tabs:
   "Reset all" (every optics value + wobble back to its default) and
   "Gargantua" (applies `GARGANTUA_PRESET` on top of the current values).

**Key features:**

- Render it AFTER the bubble's `GestureDetector`, not inside it, so the
  bubble's pan can't steal slider touches.
- Hide collapses to the tab row so the bubble can be judged unobstructed.

### hooks/bubbleModeMath.ts

Liquid Bubbles — harmonic mode physics (divergence phase 6B).

Advances the three damped harmonic modes (`a2/phi2`, `a3`, `a4`) that
`shaders.ts` reads as `iParams`. No React, no Reanimated, no Skia imports —
this module only touches plain numbers and arrays, so `bun:test` can
exercise it directly (see `bubbleModeMath.test.ts`).

Every exported function carries a `'worklet'` directive so the worklets
babel plugin compiles it for the Reanimated UI runtime: an UNMARKED
imported function captured by a worklet becomes a remote function and
throws when called synchronously on the UI thread. A `'worklet'`-marked
function is still an ordinary callable on the JS thread, so the tests are
unaffected — same pattern as the Verlet math module this replaced (phase 3,
commit a724cc6; see `temp/liquid-bubbles-divergence.md`).

`stepBubbleModes` is ONE function with the spring integration and the
shortest-arc phase lerp written INLINE, and never allocates. Two reasons,
both learned the hard way in phase 3/4 (see
`temp/liquid-bubbles-divergence.md` → "Lessons"):

- react-native-worklets 0.10.1 in Bundle Mode resolves a `'worklet'`
  -marked sibling helper captured by another worklet as `undefined` at
  runtime — a helper function is not an option here.
- A function nested inside `stepBubbleModes` would allocate a fresh
  closure every frame, which the zero-per-frame-allocation rule forbids.

Callers own `state`, `outBuf`, and `outBbox`; this function only writes
into them. The `create*`/`reset*` helpers allocate (or mutate in place)
once at init/remount, never per frame.

Per-bubble inertia and strength (see `bubbleModes.ts` → "Per-bubble inertia
and strength") are two TRAILING optional params, `inertia = 1, strength = 1`,
appended after `outBbox` so every pre-existing call site (all 21 in
`bubbleModeMath.test.ts`) keeps working untouched. Inside, both are guarded by
`MULT_MIN` and combined into one `springScale = strength / inertia` computed
once per step, which multiplies every mode spring's K and C (K2/C2, K3/C3,
K4/C4); `inertia` alone additionally scales the release/traveling-wave kicks
and the mode-2 stretch cap (`A2_MAX`, capped at `A2_MAX_CEIL`).

### hooks/useBubbleShape.ts

Liquid Bubbles — bubble mode shape hook (divergence phase 6B).

**Flow:**

bubbleX/bubbleY/scaledRadius/isActive (from useBubblePanGesture /
useBubblePinchGesture) → useFrameCallback('worklet') →
stepBubbleModes (see bubbleModeMath.ts) → paramBuffer SharedValue<number[]>
(12 floats, one of two buffers flipped each frame) + bboxX/Y/W/H
SharedValues.

**Key features:**

- Zero per-frame allocation: the mode state, both output buffers and the
  scratch bbox are created ONCE, lazily, on the first frame, and filled
  in place afterwards. The frame callback never calls `new` or `.fill`
  on a steady-state frame.
- All mutable state lives on the UI runtime (hung off `globalThis`
  there), not in JS module scope — same reasoning as the phase 3 Verlet
  hook this replaced (commit a724cc6; see
  `temp/liquid-bubbles-divergence.md`): a JS module-scope object
  captured by a worklet is cloned into a frozen shareable on the UI
  side, so the state has to be born on the runtime that mutates it.
- Double-buffered `paramBuffer`: the shader always reads a fully-written
  buffer, never one being mutated mid-frame.

Mounted in `LiquidBubbles.tsx` (phase 7B), replacing the phase 3/4 Verlet
ball-physics hook it superseded.

### hooks/useBubbleOptics.ts

Owns the live "look" levers of the harmonic bubble and builds the shader
`uniforms` from them. Currently wired to `LiquidBubbleLive` only: the
`iLens`/`iPrism` uniforms exist in `liquid-bubble-live/shaders.ts`, not yet
in the still-image shader.

**Flow:**

1. One `SharedValue` per lever, seeded from the `bubbleModes.ts` defaults
   (every Gargantua-derived lever defaults OFF, so the untouched panel
   renders the pre-lever look).
2. `BubbleTuningPanel` sliders write those values on the UI thread; resets
   write back `defaults`, the preset button writes `GARGANTUA_PRESET`.
3. `uniforms` reads them plus `paramBuffer` → `iParams`, `iColor`,
   `iRefract`, `iFilm`, `iOptics`, `iLens`, `iPrism`. No React re-render
   per slider tick.

**Key features:**

- Pre-first-frame fallback: `paramBuffer` is empty until `useBubbleShape`'s
  first frame; a zeroed `PARAM_FLOATS` buffer stands in, or Skia throws
  "Incorrect uniform size for: iParams".
- `refract` default is per demo (still image caps at `REFRACT`, live uses
  `LIVE_REFRACT`), so it is a parameter.

### hooks/useBubbleFloat.ts

The bubble's life cycle. Every bubble is born in the black spawn box at the
bottom of the screen, inflates out of the box's top edge, launches upward,
floats like a soap bubble (buoyancy, sideways sway, air drag, soft bounces
off the left, right and bottom edges), drifts out the top, and is born
again from the box.

```
 UI worklet (useFrameCallback), phases SPAWN → INFLATE → FLOAT → SPAWN
   SPAWN   roll traits: wobble ×0.6–1.6 · strength ×0.7–1.4 · inertia ×0.7–1.5
           · buoyancy ×0.6–1.5 · birthShape [a2, phi2, a3, phi3, a4, phi4]
           launch v = 100–300 pt/s within ±30° of straight up
           scaledRadius = 1 → withSpring(restRadius × 0.6–1.5, duration T = BIRTH_TIME 1.5 s)
           pos = box top-center, anchored = false
   INFLATE attached at spawnY − R (grows out of the box's top edge) + offset
           motion eases in from spawn: m = smoothstep(age / T), same T as the spring,
           offset += v · m · dt (forces already act on v) → FLOAT at age = T
           no hold, no velocity jump; whole birth = T = 1.5 s
           (float off: the newborn keeps growing but waits at the mouth)
   FLOAT   v.y −= FLOAT_BUOYANCY · buoyancy · buoyancyMul / I · dt  (y DOWN, minus = up)
           v.x += FLOAT_SWAY · sin(2π t / FLOAT_SWAY_PERIOD + φ) · dt
           v   *= exp(−FLOAT_DRAG / √I · dt)
           pos += v·dt → bubbleX / bubbleY  (direct write cancels any leftover spring)
           x < R, x > W − R, y > H − R → reflect v, keep FLOAT_BOUNCE_KEEP
           y < −R · FLOAT_EXIT_RADII   → SPAWN
   finger down (any phase) → the pan's follow spring drives bubbleX/Y
   release                 → FLOAT with the fling (≤ FLOAT_FLING_MAX)
 useBubbleShape
   anchored false → re-anchor the modes at the box, then apply birthShape
   (a teleport is not motion); the modes spring the birth deformation back to rest
 LiquidBubbleLive
   wobble / strength / inertia fed to the physics = slider × trait (useDerivedValue)
```

- **Traits:** `useBubbleTraits` holds one bubble's random multipliers and
  birth shape. The sliders are the base and are never overwritten by a
  spawn. It's a separate hook because `useBubbleShape` needs the effective
  values before `useBubbleFloat` can take its `anchored` output.
- **Numbers (inertia 1):** cruising rise ≈ 80 pt/s (`FLOAT_BUOYANCY /
  FLOAT_DRAG`), sway ≈ ±14 pt over 3 s, a full screen in ~10 s. The launch
  decays with τ = 2 s. Derivations are in `bubbleModes.ts` → "Float" and
  "Birth".
- **Inertia:** buoyancy ÷ I and drag ÷ √I, so rise speed is 80 / √I: a heavy
  bubble rises slower and coasts longer.
- **Drag interplay:** a touch anywhere grabs it (the pan covers the whole
  canvas). Letting go throws it with the fling velocity.
- **Multi-bubble ready:** one `useBubbleTraits` + one `useBubbleFloat` per
  bubble; all state is in their own SharedValues.
- **Limits:** the spawn box is drawn after the bubble, so it isn't in the
  refracted backdrop and covers the bubble where they overlap. The tuning
  panel covers the box unless it's on Hide. Width/height are captured as
  numbers, so a rotation keeps the old bounds until remount. Touching
  without moving freezes the bubble in place until the first move.

### hooks/useImageBubble.ts

A picture that rides behind the bubble. It's drawn after the background and
before the `BackdropFilter`, so it's part of the backdrop snapshot and the
glass refracts it.

```
 JS, mount     8 distinct random sources from assets/Bubbles/256 imageArray
               → preloaded with useImage (IMAGE_BUBBLE_POOL_SIZE)
 JS, spawn     useBubbleFloat → scheduleOnRN(onSpawn) → random pool index → image
 UI, per frame [cx, cy, R] = paramBuffer[0..2]   (what the glass draws this frame)
               x = cx − 0.75R, y = cy − 0.75R, size = 1.5R  (useDerivedValue)
```

- **Same frame as the glass:** the center and radius come from `paramBuffer`,
  not `bubbleX/Y`. `useBubbleShape` samples `bubbleX/Y` before `useBubbleFloat`
  moves them, so reading them directly drew the picture one frame ahead of the
  glass and its clip rect: a jitter inside the glass on uneven frames, and on
  fast flings a leading edge outside the 2 pt `CLIP_SLACK`, where the glass
  refracted empty pixels.

- **Sits inside the bubble:** the rect is a `1.5R` square around the center,
  so a clear glass ring shows around it. It inflates out of the box with the
  bubble and follows pinch.
- **Preloaded pool:** a spawn never waits on a decode. One React render per
  spawn, never per frame.
- **Limit:** the pool is fixed at mount, so a session shows only 8 of the
  46 images. Growing the pool means adding explicit `useImage` calls.

### hooks/useClock.ts

Liquid Bubble Live — elapsed-seconds clock (phase 12B, Skia route).

The background needs a wall clock and the bubble physics does not expose
one: `stepBubbleModes` advances `filmPhase`, but that is a tuned drift rate
for the thin-film colour cycle, not a time base to hang a second animation
off. A dedicated `useFrameCallback` is a handful of instructions per frame
on a thread that is already ticking, and keeps the background's speed
independent of `FILM_DRIFT`.

`dt` is clamped to the same `[DT_MIN_MS, DT_MAX_MS]` window the mode physics
uses, so a stalled frame cannot jump the bands across the screen.
