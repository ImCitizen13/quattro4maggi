# Liquid Bubbles Multi

A greeting that collapses into four labelled glass bubbles, heading toward
one shader pass for all of them. Plan and cost comparison:
`../liquid-bubble-live/multi_bubble.md`.

Separate from `liquid-bubble-live/`: it imports only that folder's pure
modules (`bubbleModes.ts`, `hooks/bubbleModeMath.ts`) and never touches the
single bubble's state.

## Files

- `LiquidBubblesMulti.tsx`: screen — greeting, the bubbles, panels, FPS
- `BaselineBubble.tsx`: one of today's single-bubble passes for one buffer slot (phase 2 baseline)
- `BubbleLabel.tsx`: one intro bubble's text, riding along inside it
- `TextTuningPanel.tsx`: live controls for the greeting and the bubbles' position
- `multiBubbleConfig.ts`: count, buffer size, spawn stagger, inflate spring, intro timeline
- `hooks/multiBubbleMath.ts`: one bubble's float life cycle as a pure step (+ test)
- `hooks/useMultiBubblePhysics.ts`: float + shape for every bubble in one frame callback
- `hooks/useIntroTimeline.ts`: the greeting-collapse → four-bubbles intro

Tests: `bun test src/components/liquid-bubbles-multi`

## Structure

What drives what. Everything below `MultiBubbleScene` runs on the UI thread;
the sliders write SharedValues, so dragging one never re-renders React.

```mermaid
flowchart TD
    LBM["LiquidBubblesMulti<br/>measures, keys the scene by size"]
    SCENE["MultiBubbleScene"]
    CLOCK["useClock<br/>seconds, for the drift"]
    PANELS["Text / Bubble panels<br/>sliders write SharedValues"]
    INTRO["useIntroTimeline<br/>textScale + 4 PinnedBubble"]
    PHYS["useMultiBubblePhysics<br/>one frame callback"]
    BUF["paramBuffer<br/>8 slots x 12 floats"]
    OPTICS["useBubbleOptics<br/>shared look uniforms"]
    PASS["BaselineBubble x 4<br/>one backdrop pass each"]

    LBM --> SCENE --> INTRO --> PHYS --> BUF --> PASS
    CLOCK --> INTRO
    PANELS --> INTRO
    PANELS --> PHYS
    PANELS --> OPTICS
    BUF --> OPTICS --> PASS
```

And what the canvas draws. Arrows are draw order, which is also refraction
order: the glass only bends what was drawn before it. The backdrop sits
INSIDE the `pd` group (authored in points); the passes sit outside it but
still inside `1 / pd`, which is what puts their filter in device pixels.

```mermaid
flowchart TD
    subgraph CANVAS["Canvas, Group scale 1 / pd - one local unit = one device pixel"]
        direction TB
        subgraph PTS["Group scale pd - backdrop, authored in points"]
            direction TB
            BG["Background image<br/>cover, full bleed"]
            GREET["Greeting + squiggle<br/>x intro textScale"]
            LABELS["BubbleLabel x 4<br/>one per bubble"]
            BG --> GREET --> LABELS
        end
        PASSES["BaselineBubble x 4<br/>point uniforms x pd, on top"]
        PTS --> PASSES
    end
    CANVAS --> OVERLAY["Outside the canvas: FPS, tuning panels, Replay"]
```

## Design notes

### LiquidBubblesMulti.tsx

```
 onLayout → size → scene (keyed by size: the physics captures the walls)
 draw     white → greeting paragraph + squiggle → labels → floaters
                → the four intro bubbles
```

- **Reuses the single bubble's look read-only:** `shaders.ts`,
  `useBubbleOptics`, `BubbleTuningPanel`, `useClock`, `liveConfig.ts`,
  `backgroundShaders.ts` (currently unused: the backdrop is plain white).
  They hold no shared state, so the two demos can't interfere.
- **Greeting:** a centered Skia `Paragraph` — "Good Morning" / the name on
  two lines — with a squiggle `Path` under the name, scaled to the name's
  measured width. It is drawn BEFORE the bubble, so the glass refracts it.
- **Intro bubbles:** slots `FLOATER_COUNT …  + INTRO_COUNT − 1`, all pinned
  (no buoyancy float) and driven by `useIntroTimeline`. Drawn last, so they
  are on top. Each one's label is drawn just before them, so the glass
  refracts its own text.
- **Replay** (top right) re-runs the intro from the greeting.
- **`CRISP_BUBBLES` / the DPR sandwich:** Skia can't apply the canvas matrix
  to a `RuntimeShader` image filter, so it factors the scale out and
  snapshots the backdrop at **1 texel per local unit** — at logical size
  that is 1 texel per point, upscaled `pd`× on screen, which is why text
  seen through the glass looked pixelated. So the whole canvas sits in a
  `1 / pd` group (`DPR_DOWN`): the bubbles' local unit is now a device
  pixel. The backdrop content sits in a matching `pd` group (`DPR_UP`) and
  is still authored in points; the bubbles sit outside it and get
  `pixelDensity={PD}`, which scales their point uniforms and clip.
  It costs ~`pd²` texels per pass — flip `CRISP_BUBBLES` to compare FPS.
- **Floaters are off** (`SHOW_FLOATERS = false`) while the text is being
  designed; set it true for the phase 2 stress baseline.
- **Panels** (one at a time, top right): **Text** (size, vertical, squiggle
  thickness/gap, bubble X/Y) and **Bubble** (`BubbleTuningPanel`: size,
  wobble, inertia, strength + all the optics). Every slider writes a
  SharedValue — dragging never re-renders React; Size scales the text group
  instead of rebuilding the paragraph.
- **Cosine film only**, no soap-film pass. No gestures yet.

### BaselineBubble.tsx

The phase 2 stress baseline: today's `BackdropFilter` + `liveBubbleEffect`,
once per slot, so 5 bubbles cost ~15 pass breaks.

- `iParams` = this slot's 12 floats (a 12-float slice per frame).
- **Clip** is a circle bound, `R·(1 + |a2| + |a3| + |a4|)`, grown by the same
  refract / lens / dispersion / halo padding as the single bubble. A waiting
  slot (R = 0) gets an empty clip.
- **`pixelDensity`** multiplies everything it hands the shader in points —
  `iParams` cx / cy / R, `iRefract`, `iOptics.y` (rim width) — and the clip.
  Nothing else: the remaining levers are fractions of R, so they follow. The
  rim AA (`smoothstep(±0.75, d)`) is now ±0.75 device px rather than points,
  which is a sharper edge, not a broken one.

### hooks/useIntroTimeline.ts

```
 textScale  1 → 1.2 (spring) → 0 (collapse)
 bubble i, after INTRO_BUBBLE_DELAY + i · STAGGER:
   inflate  0 → 1   bouncy   → r  = Size slider × INTRO_RADIUS_MUL[i]
   travel   0 → 1   springy  → xy = center → its corner of a tilted quad
   label    0 → 1   fade, once it is nearly there
 forever:   x / y carry a sin drift, scaled by travel
```

- **The wobble on the way out is free:** the travel spring is underdamped
  (ζ 0.52), and `stepBubbleModes` reads that velocity as motion, so the glass
  deforms toward the corner and settles there. No extra shape work.
- **The quad is tilted** (`INTRO_TILT`) with per-corner reach jitter, so four
  bubbles never read as a grid; sizes and wobble vary per bubble too.
- **Drift is gated by travel**, so a bubble still at the birth point is still.
- **`play()` re-arms from zero** — it is both the autoplay and Replay.
- One `PinnedBubble` per bubble: this hook says where and how big, the
  physics hook owns the shape.

### hooks/multiBubbleMath.ts

`useBubbleFloat` from the single bubble, rewritten as plain numbers so N
bubbles can share one frame callback and `bun test` can run it.

```
 WAIT     hidden, counts down index × SPAWN_STAGGER (1.2 s) while float is on
 SPAWN    traits, birth shape, target R, launch v; mouth = box ± SPAWN_SPREAD
 INFLATE  R springs 1 → target, motion eases in over BIRTH_TIME
 FLOAT    buoyancy, sway, drag, bounces; out the top → SPAWN
```

- **Same forces and constants** as `useBubbleFloat`, from `bubbleModes.ts`.
- **Radius spring by hand:** `withSpring` can't run inside a pure step, so the
  radius is a damped spring (ζ 0.6, the same as `SPRING_BUBBLE_INFLATE`) with ω
  chosen to settle within `BIRTH_TIME`.
- **Stagger + spread:** without them all five inflate on top of each other.
- **`rand` is a parameter:** `Math.random` on device, seeded in tests.
- **No gestures yet** (phase 4).

### hooks/useMultiBubblePhysics.ts

```
 per frame, bubble i:  stepBubbleFloat → (re-anchor) → stepBubbleModes
                       → out[i·12 … i·12+11], union bbox
 pinned slots (i ≥ count):  position/radius from the caller → stepBubbleModes
 waiting / unused / R ≤ 0:  12 zeros (R = 0 = nothing to draw)
```

- **Own state key** (`__liquidBubblesMulti`), so it never collides with the
  `useBubbleShape` singleton.
- **Float before shape**, in the same frame: the buffer never lags the
  float by a frame.
- **Buffer is always `MAX_BUBBLES × 12`** (96 floats), so the shader's
  uniform size is fixed; it starts zeroed so a pre-first-frame read has the
  right size.
- **Zero per-frame allocation;** state is rebuilt once per mount.
- **Pinned slots** take the indices after the floaters. Each re-anchors the
  first frame its radius goes above 0 (so being placed, or a Replay, is never
  read as motion) and carries its own `wobbleMul`.
