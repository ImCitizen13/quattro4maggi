# Soap Film

A standalone, mesh-decoupled soap-film iridescence texture generator: a
scalar thickness field, animated and flowing, fed through a separate
thickness → color stage. Drag on the shape to disturb the flow, pinch or use
the panel to resize it, and toggle the film on/off to compare against a flat
fill. Self-contained: everything it needs is in this folder.

## Files

- `SoapFilm.tsx`: canvas, squircle shape, gestures, film toggle, panel
- `SoapFilmShader.tsx`: declarative Skia shader tree (pipe-able as a Paint
  fill or as a child `uniform shader` of another effect)
- `soapFilmConfig.ts`: every tunable default
- `SoapFilmTuningPanel.tsx`: the controls
- `hooks/`: clock, touch ring buffer, uniform `SharedValue`s, squircle path
- `../../lib/shaders/soapFilm.ts`: the SkSL — two thickness generators
  (`SOAP_THICKNESS` curl-noise, `SOAP_THICKNESS_SINE` domain warp) and one
  color stage (`SOAP_COLOR`, ramp LUT or physical thin-film)

## Architecture: thickness ⟂ color

The shader module keeps two things strictly separate:

1. **Thickness** — a scalar field in `[0,1]`, animated and flowing. Nothing
   in this stage knows about color.
2. **Color** — maps a thickness sample to RGB, either via a 20-stop ramp LUT
   or a physically-approximated thin-film interference formula. It takes the
   thickness stage as a child `uniform shader`, so it can equally well take
   a DIFFERENT thickness field, or be swapped for a different color mapping
   entirely, without touching the other side.

`SoapFilmShader`'s `output` prop exposes this split at the component level:
`"thickness"` returns the raw scalar field (useful standalone, e.g. as a
displacement map), `"color"` (default) wraps it in `SOAP_COLOR`.

## Why stateless backtrace, not a feedback buffer

The curl generator (`SOAP_THICKNESS`) advects a base noise field through a
divergence-free velocity field using a **semi-Lagrangian backtrace**: walk a
handful of steps backward through the velocity field from each pixel, then
sample the base noise at the traced-back position. This needs no previous
frame's texture, no ping-pong render targets, and no accumulation buffer —
every frame is computed fresh from `iTime` and the touch ring buffer alone.
That makes the shader a pure function of `(uv, t, touches)`, which is what
lets it be dropped in anywhere (a `<Path>` fill, a future bubble shader's
child) with no setup beyond compiling the `RuntimeEffect` and no lifecycle to
manage.

The curl velocity itself comes from the ANALYTIC DERIVATIVE of a scalar
potential noise (`curl(f) = (df/dy, -df/dx)`), not a finite-difference
approximation — the noise function already returns `(value, dx, dy)`, so curl
is free.

## Touch: a ring buffer, not per-touch shader instances

Touches disturb VELOCITY, not thickness directly (a push along the drag
vector plus a small vortex), so they interact with the flow rather than
stamping a static blob. Up to 8 concurrent impulses live in a flat
`SharedValue<number[]>` ring buffer (`[x,y,vx,vy] × 8`), written by
`useFilmTouches` on the UI thread with no React re-render, and decayed by
`exp(-age/tau)` where age is recomputed every frame from a single clock
`SharedValue` — never hand-incremented, so it can't drift out of sync with
the flow field's own `iTime`.

## Integration path (future bubble shader)

`SoapFilmShader`'s root element is a `<Shader>`, not a `<Fill>`/`<Path>`
wrapper, so it can be used two ways: as the Paint child of any shape (this
demo), or as the child `uniform shader film;` of ANOTHER `<Shader>` — e.g. a
future liquid-bubble effect. There, pass the bubble's own `cosθ` (view angle
at each point, from its surface normal) into `uCosTheta` instead of the flat
default, and multiply the result by the bubble's Fresnel term rather than
using `SOAP_COLOR`'s `uIntensity` alone — that keeps the film bright at
grazing angles and dim head-on, the way real soap film looks.

## Limitations

- No persistent advection: because nothing carries state between frames, the
  field can't accumulate structure over time the way a real simulated film
  does (e.g. draining into permanent thin/thick streaks). It reads as
  perpetually "fresh" rather than aging.
- Full-resolution fill cost: every pixel runs the 3-layer curl backtrace (5
  steps × 3 layers) plus the 8-slot touch loop, every frame, at the shape's
  native resolution. Cheap enough for a single centered squircle; would need
  a 0.5× offscreen render (upscaled on composite) if used at full-screen
  scale — see project memory: "Gooey border high-DPI shader cost" for the
  same tradeoff measured on a different metaball shader.

## Controls

Every slider has a ↺ reset. **Reset all** restores every default.

| Tab   | Control                                | What it does                                    |
| ----- | --------------------------------------- | ------------------------------------------------ |
| Shape | Scale                                   | Squircle size (also pinchable)                   |
|       | Exponent                                | Superellipse corner sharpness                    |
| Flow  | Layer 0/1/2 selector → freq/speed/angle/weight | Curl-noise flow layers (curl generator only) |
|       | Swirl                                   | Global velocity multiplier (curl only)           |
|       | Seed                                    | Domain offset (curl only)                        |
|       | Touch decay                             | How long a touch disturbance lingers (curl only) |
|       | Sine freq / speed A / speed B           | Domain-warp params (sine generator only)         |
| Color | Curl / Sine                             | Which thickness generator drives the film        |
|       | Ramp / Physical                         | Color mapping mode                               |
|       | Drainage                                | Gravity thinning near the top                    |
|       | Thickness scale                         | Ramp wrap count, or nm in physical mode          |
|       | Cos theta                               | View-angle cosine (physical mode)                |
|       | Intensity                               | Overall brightness                               |

Defaults for every control live in `soapFilmConfig.ts`.

## Design notes

### SoapFilm.tsx

Full-screen `<Canvas>` (a plain `View`, not `ThemeView` — see the route's own
comment: `ThemeView` centers children with no `flex:1` on the cross axis,
which collapses a flex-only canvas to 0×0). Draws the same squircle outline
twice, each inside a `<Group layer={<Paint opacity={...}/>}>`: one flat
`#2a2a2a` fill (`filmOn → 0`), one `SoapFilmShader` fill (`filmOn → 1`),
crossfaded with `withSpring(SPRING_FILM_CROSSFADE)` on toggle. A rim stroke
draws on top unconditionally, in both states. A pinch gesture and the panel's
Scale slider both write the same `scale` `SharedValue` through
`withSpring(SPRING_SQUIRCLE_SCALE)`, so either input feels identical. Pan is
combined with pinch via `Gesture.Simultaneous` so dragging while resizing
still feeds the touch ring buffer.

### SoapFilmShader.tsx

Nested declarative shader tree: `<Shader source={SOAP_COLOR}><Shader
source={thicknessEffect}/><ImageShader image={ramp}/></Shader>`. Every
numeric uniform arrives as a `SharedValue`, combined per-effect into
`useDerivedValue` uniform objects, so dragging a tuning slider never
triggers a React re-render — only the UI-thread uniform recomputes.

### hooks/useSoapFilmUniforms.ts

Owns every live `SharedValue` behind the `flow`/`color` uniform groups,
seeded from `soapFilmConfig.ts`. Exports `SOAP_FILM_DEFAULTS` so the tuning
panel's per-slider reset and "Reset all" read the same numbers the hook
seeded from, with no duplication.

### hooks/useFilmTouches.ts

The 8-slot touch ring buffer. `touch`/`touchAge` are written by a Pan
gesture's `onBegin`/`onUpdate` (impulse position + clamped velocity, cursor
advances mod 8) and re-aged every frame from a single `useFrameCallback`
against the shared clock — ages are DERIVED (`time.value - impactTime[i]`),
never incremented by hand, so a stalled frame can't desync them from the
flow field's own `iTime`.

### hooks/useSquirclePath.ts

Builds the superellipse (`|x|^n + |y|^n = 1`) outline on the UI thread via
`useDerivedValue`, parametrized by angle (`x = sign(cosθ)·|cosθ|^(2/n)`) so
it can be sampled at a fixed vertex count instead of solved per-point.

### SoapFilmTuningPanel.tsx

Mirrors `liquid-bubble-live/BubbleTuningPanel.tsx`'s tab/reset structure.
The Flow tab's per-layer sliders write into a `FilmLayer` tuple `SharedValue`
in place (slice, mutate the copy, reassign) via a small `TupleTuningSlider`
— `uLayer0/1/2` are wired as single `float4` uniforms, so each layer stays
one `SharedValue`, not four.
