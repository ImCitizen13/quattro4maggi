# Multi-bubble: options and cost

Design notes for putting several bubbles (each with a picture inside and a
soap film) on one screen. Nothing here is built yet. Numbers are estimates
from the pass structure, not measurements.

## What goes wrong with several bubbles today

**1. The shape physics can only run one bubble.** `useBubbleShape` keeps its
state in one global slot on the UI thread (`__liquidBubblesShape`). A second
bubble would overwrite the first one's shape every frame. That is also why
the route mounts only one mode at a time. It has to become one physics step
for all N bubbles, writing one flat buffer, before anything else.

**2. The number of passes grows with every bubble.** Each bubble currently
costs:

| Step               | What happens                                                                                            | Pass breaks |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ----------- |
| `BackdropFilter`   | save a layer, snapshot what's behind, run the shader, paste the layer back                              | ~3          |
| Soap film `<Rect>` | a second pass, only because the backdrop filter takes one input (the backdrop), so the film can't be a second one | +1          |

So N bubbles means about 4N passes. On iPhone (tile-based) GPUs each break
writes the frame out to memory and reads it back, and shrinking each
bubble's clip area doesn't reduce that. On top of that, the film is the most
expensive shader per pixel (5-step backtrace × 3 curl layers plus an 8-slot
touch loop), which adds to the fill cost already hit in the gooey-border work.

## Combining it all in one shader

Drawing a bigger area with fewer passes is the right trade. Two ways:

**A. One backdrop filter for all bubbles (3 passes total, for any N)**

- A single `BackdropFilter` covering the screen, or the box around all
  bubbles, whose shader loops over a `float4 params[MAX]` array.
- Each pixel does a cheap distance check against every bubble and only does
  the expensive refraction and film work inside the one it's in.
- The filter still has only one input slot, so the film's shader code is
  pasted into the bubble shader with its own uniforms. That removes the
  separate film pass.
- Pictures and live content behind the bubbles keep working, because they're
  still drawn first as the backdrop.

**B. One plain shader pass, no backdrop snapshot (1 pass)**

- Only works if everything behind the bubbles is fixed images, which is true
  for Bounce and Arc (stars background plus pictures).
- One shader rect with several inputs: the background image, a texture sheet
  with all the pictures packed in (plus a position rect per bubble), the film
  thickness and the color ramp.
- The old still-image demo's layout, extended to N bubbles. The cheapest
  option.

### What you give up

- **Bubbles don't refract each other.** In one pass each bubble only sees the
  background. Where two overlap, the topmost wins. Fine for bubbles that
  bounce apart; wrong for stacked glass.
- **The film lag has to change.** The film shader has one 8-slot touch
  buffer shared by everything that uses it. Per-bubble lag would need 8×N
  slots, or a simpler replacement: a small per-bubble offset that springs
  back, which looks almost the same and costs nothing.
- **Pixels outside the bubbles still get shaded.** One quick check per
  bubble — cheap, and much cheaper than the passes removed. Past ~16 bubbles
  the checks at 3× resolution start to cost something.
- **Shared look settings.** Optics sliders apply to every bubble unless
  per-bubble values go into the arrays.
- **Longer shader compile**, and shader loops need a fixed maximum count.

## Comparison at 5 bubbles

**Assumptions:** iPhone at 393×852 pt, 3× resolution (~3.0M pixels on
screen). Each bubble R = 60 pt (~0.1M pixels of disk). Each current clip rect
~160 pt square (2R plus ~20 pt refraction padding per side), ~0.23M pixels.
The current film pass runs over the whole clip rect, not just the disk.

|                                       | **Current** (filter + film pass per bubble)          | **A** (one backdrop filter)                                    | **B** (one plain shader pass) |
| ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ----------------------------- |
| Pass breaks per frame                 | ~20 (4 × 5)                                          | 3                                                              | 1                             |
| Screen copies (snapshot + paste back) | 5 × 0.23M × 2 ≈ 2.3M px                              | 3.0M × 2 ≈ 6M px (full screen)                                 | none                          |
| Pixels running bubble math            | 5 × 0.23M ≈ 1.15M                                    | ~0.5M (inside disks); ~2.5M others do 5 quick distance checks  | same as A                     |
| Pixels running the film               | ~1.15M (whole clip rects)                            | ~0.5M (inside disks only)                                      | ~0.5M                         |
| Background draw                       | 3.0M px, separate draw                               | 3.0M px, separate draw                                         | built into the same pass      |
| UI-thread work                        | ~20 frame callbacks (shape, float, film motion, clock × 5) | 1 physics step for all + 1 uniform write                  | same as A                     |
| Bubbles refract each other            | yes (drawn in order)                                 | no, topmost wins                                               | no                            |
| Live content behind the bubbles       | yes                                                  | yes                                                            | no, fixed images only         |
| Per-bubble film lag                   | yes, a real 8-slot touch buffer each                 | simplified to a per-bubble offset                              | same as A                     |
| Per-bubble look settings              | yes                                                  | shared, unless added to the arrays                             | same as A                     |

**Reading it:**

- **Current:** copies less screen area, but its ~20 pass breaks are what
  hurts on an iPhone GPU. It also runs the film over twice the pixels it
  needs.
- **A:** 3 passes and half the film work. The catch: it snapshots and pastes
  back the whole screen (~6M px of copying vs 2.3M now) — the one row where A
  is worse. On a tile-based GPU a few big copies usually beat many small
  breaks. Clipping to the box around all bubbles only helps if they sit
  close together.
- **B:** wins on every cost: 1 pass, no copies, film only inside the disks.
  About the cost of drawing the background alone plus the bubble interiors.
  Only for scenes built from fixed images (Bounce, Arc).

**Expected order at 5 bubbles:** B well ahead, then A, then current. A's lead
over current grows with N (its cost barely changes, current adds 4 passes per
bubble). At 1 bubble, current is probably slightly cheaper than A.

## Plan

1. Replace the `useBubbleShape` singleton with one physics step for N
   bubbles writing one buffer. Both routes need this.
2. Build **A** as a new mode with 4–8 bubbles (keeps live content, 4N → 3
   passes).
3. If Bounce / Arc need more speed later, move them to **B**.

**Measure before committing to a route:** a stress mode with 5 current
bubbles on a release build (FPS overlay), then the same for A. The simulator
caps at 60 Hz and says nothing about fill cost.
