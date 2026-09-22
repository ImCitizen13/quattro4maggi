# Liquid Bubbles Multi

Five glass bubbles floating over live content, one shader pass for all of
them. Plan and cost comparison: `../liquid-bubble-live/multi_bubble.md`.

Separate from `liquid-bubble-live/`: it imports only that folder's pure
modules (`bubbleModes.ts`, `hooks/bubbleModeMath.ts`) and never touches the
single bubble's state.

## Files

- `LiquidBubblesMulti.tsx`: screen — greeting, the bubbles, panels, FPS
- `BaselineBubble.tsx`: one of today's single-bubble passes for one buffer slot (phase 2 baseline)
- `TextTuningPanel.tsx`: live controls for the greeting and the bubble's position
- `multiBubbleConfig.ts`: count, buffer size, spawn stagger, inflate spring
- `hooks/multiBubbleMath.ts`: one bubble's float life cycle as a pure step (+ test)
- `hooks/useMultiBubblePhysics.ts`: float + shape for every bubble in one frame callback

Tests: `bun test src/components/liquid-bubbles-multi`

## Design notes

### LiquidBubblesMulti.tsx

```
 onLayout → size → scene (keyed by size: the physics captures the walls)
 draw     white → greeting paragraph + squiggle → floaters → pinned bubble
```

- **Reuses the single bubble's look read-only:** `shaders.ts`,
  `useBubbleOptics`, `BubbleTuningPanel`, `useClock`, `liveConfig.ts`,
  `backgroundShaders.ts` (currently unused: the backdrop is plain white).
  They hold no shared state, so the two demos can't interfere.
- **Greeting:** a centered Skia `Paragraph` — "Good Morning" / the name on
  two lines — with a squiggle `Path` under the name, scaled to the name's
  measured width. It is drawn BEFORE the bubble, so the glass refracts it.
- **Pinned bubble:** slot `FLOATER_COUNT`, resting `TEXT_BUBBLE_GAP` above
  the paragraph's top edge; it follows the text's Vertical and Size and its
  own radius. Drawn last, so it is on top.
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
 waiting / unused:     12 zeros (R = 0 = nothing to draw)
```

- **Own state key** (`__liquidBubblesMulti`), so it never collides with the
  `useBubbleShape` singleton.
- **Float before shape**, in the same frame: the buffer never lags the
  float by a frame.
- **Buffer is always `MAX_BUBBLES × 12`** (96 floats), so the shader's
  uniform size is fixed; it starts zeroed so a pre-first-frame read has the
  right size.
- **Zero per-frame allocation;** state is rebuilt once per mount.
