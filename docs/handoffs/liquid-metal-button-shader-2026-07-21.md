> **Resume:** read this, then `git log -6 --oneline && git status`. Companion
> to `docs/liquid-metal-path-sdf.md` (the SDF pipeline). This handoff covers
> the **ExpoLiquidMetalShader + BShader bubble** button, a separate effect
> from the SDF morph work.

# Liquid Metal Button — Bubble Refraction + Metal Controls (2026-07-21)

**Branch:** `expo-metal-shader`

## What this effect is

`ExpoLiquidMetalShader` renders the paper-design liquid-metal (banded contour
field, `iShape` circle) into a `<Rect>`, then applies **`BShader`** (the
wabi-and-more prism/refraction shader) as a Group `layer` on top — a glass
bubble lens refracting the metal in the center. Used as a play-button in the
`LiquidButtonTest` scratch harness (uncommitted).

## Landed this session (committed)

**New metal controls** (`ExpoLiquidMetal.ts` + `ExpoLiquidMetalShader` props):
- **`rimLight` (0-1)** → `iRimLight`: a Fresnel-style bright bevel in a thin
  band just inside the outline (`smoothstep(0.55,0.85,rimEdge)…`), so the rim
  stays a bright polished edge instead of being darkened by the bands.
- **`brightness` (0-1)** → `iBrightness`: screen-blend shadow-lift
  (`1-(1-c)*(1-b)`) — raises the dark floor without flattening highlights.
  **Decouples "overall darkness" from shadow color / lobe depth** — the fix
  for the endless "too dark ↔ too flat" swing.
- **Animated angle**: `iAngle = angle + timeSec*(speed/3)*36` — the sweep
  rotates clockwise (~10°/s at speed 1). The `×36` is a visibility scale;
  literal speed/3 deg/s is imperceptible. Verified clockwise on-device.

**BShader bubble controls** (shared shader — `WabiTimerExperiment` also
updated to pass the new uniforms with neutral values, verified unchanged):
- **`u_transparentBg`**: liquid-metal passes 1 → premultiplied output, corners
  stay transparent (no `u_bgColor` fill). Wabi passes 0 → original opaque path.
- **`u_bubbleColor` / `u_bubbleOpacity`** (`bubbleColor`/`bubbleOpacity`
  props): glass tint color + strength (0 = clear lens, 1 = solid tint).

**Fixes:**
- **DPR rim pixelation**: the `<Group layer>` rasterized the metal at LOGICAL
  res (250²) then upscaled ~3× → staircased rim. Fixed with the DPR scaling
  trick (outer `scale 1/pd`, inner `scale pd`, bubble uniforms ×pd), same as
  Wabi. Metal stays logical on a `<Rect>`. See memory
  `skia-group-layer-dpr-pixelation`.
- Gray prism option (`gray_PRISM_COLORS` in BShader) for a colorless rim;
  note `u_dispersion` also adds rainbow via R/B split independent of the stops.

## The three darkness knobs (mental model)

Darkness has THREE independent sources — the confusion was they were
conflated:
| Knob | Controls |
|---|---|
| `bubbleOpacity` (black tint) | uniform dimming of the whole interior — the biggest crusher at high values |
| `brightness` | lifts the dark *floor* without touching highlights |
| `customShadow` | how deep the reflection *lobes* get |
"Flat" = low contrast (light shadow); "chrome depth" = dark shadow + bright
rim + `brightness` lift so it's bright-biased, not crushed.

## OPEN — unresolved aesthetic (next session)

The designer's target: a **bright** chrome with *contained* dark reflection
lobes that move but never engulf the surface. Our shader's failing per the
user: **"the bands expand and cover the whole metal shader"** — with low
`repetition` the single wide band scrolls and its shadow phase periodically
washes the WHOLE disc dark. `brightness` lifts the floor but doesn't fix the
band *coverage/area*.

- Reference video: `~/Downloads/ScreenRecording_07-21-2026 03-33-33_1.mov`
  (sandbox-blocked; `ffmpeg` even with `dangerouslyDisableSandbox` got
  "Operation not permitted" on `~/Downloads` — ask the user to move it into
  the repo/scratchpad to extract frames).
- Likely direction: bias the band *profile* so most of each cycle is
  highlight and only a narrow band is shadow (contained dark streaks on a
  bright base), rather than the current ~symmetric highlight↔shadow ramp in
  `getColorChanges`. Or a different reflection model entirely.

**Designer motion spec** (shared, mapping unconfirmed — some need new
uniforms): Depth 125→200%, RGB split 10→15%, Scale 100→200%, Angle -180→0,
Offset 0→-100%. Ambiguous whether one-shot reveal or seamless loop
(Scale+Offset pair is the loop signature; Angle half-turn isn't). Parked —
user dismissed the clarifying question.

## Uncommitted on purpose

`src/app/liquid-metal/index.tsx` (gutted to render the scratch harness),
`LiquidButtonTest.tsx` (scratch), `ColorsLiquidMetal.tsx` (platinum shadow
tuning 0.15→0.08), triangle/react-logo assets, older gooey-border docs.
