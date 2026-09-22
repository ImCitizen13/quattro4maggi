# Liquid Bubbles Multi

Five glass bubbles floating over live content, one shader pass for all of
them. Plan and cost comparison: `../liquid-bubble-live/multi_bubble.md`.

Separate from `liquid-bubble-live/`: it imports only that folder's pure
modules (`bubbleModes.ts`, `hooks/bubbleModeMath.ts`) and never touches the
single bubble's state.

## Files

- `multiBubbleConfig.ts`: count, buffer size, spawn stagger, inflate spring
- `hooks/multiBubbleMath.ts`: one bubble's float life cycle as a pure step (+ test)
- `hooks/useMultiBubblePhysics.ts`: float + shape for every bubble in one frame callback

Tests: `bun test src/components/liquid-bubbles-multi`

## Design notes

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
