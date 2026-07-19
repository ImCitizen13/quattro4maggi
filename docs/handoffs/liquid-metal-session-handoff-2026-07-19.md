> **Resume:** read this, then `git log -8 --oneline && git status`. The
> pipeline doc (`docs/liquid-metal-path-sdf.md`) is the reference for *how
> things work*; this handoff records *what happened and where to pick up*.

# Liquid Metal — Session Handoff (2026-07-17 → 2026-07-19)

**Branch:** `expo-metal-shader` · **Demo:** `src/app/liquid-metal/index.tsx`

## What got built and committed (all on-device verified unless noted)

| Commit | What |
|---|---|
| `65693ac` | Path SDF pipeline: Felzenszwalb EDT bake (subpixel-seeded from AA coverage), bands/mask/edge all from one field, no clip. Debug view = long-press ghost (currently commented out in demo). |
| `16a45b8` | Bake at device pixel ratio (capped 3×) — crisp edges. `iSdfScale` maps logical→texture coords; `PathSdf.scale` for JS consumers. |
| `89daaa6` | Typed text as path (`Skia.Path.MakeFromText`, per-keystroke re-bake), pencil-button↔TextInput spring morph, keyboard-controller lift (`KeyboardProvider` in `_layout.tsx`; needs the native module in the dev build — red "not linked" screen means rebuild). |
| `70d8f1a` | `ParticlePathAssembly`: path → 500 dots, single Atlas draw call, per-frame RSXforms on the UI thread; shape-to-shape morphing (1:1 dot mapping via target wrapping). |
| `d2158d6` | `MorphingLiquidMetal` (metal→particles→metal transitions) + `usePathSdf` shared-bake hook (roadmap step 1). Logos moved to `svgs/svgs.ts`. |
| (this commit) | Demo simplified back to **two separate effects**; mixed effect parked; reverted work preserved as a patch. |

## Where things stand

- **Demo:** metal shader OR raw particle view, toggled by the grid/drop
  button. Pencil morphs into the text input; typing re-bakes per keystroke.
  Text renders in LobsterTwo. Logo taps cycle `svgs/svgs.ts` LOGOS.
- **`MorphingLiquidMetal`:** exists, compiles, unused. Its handoffs pop —
  reverted cross-fade attempt lives in
  `docs/handoffs/liquid-metal-step2-crossfades-reverted-2026-07-19.patch`
  (also contains roadmap step 2: field-sampled targets + `min(r,d)` dot
  sizing + `fromSdf`/`playDelayMs` plumbing — reusable pieces, they were
  reverted for the popping, not for being wrong).
- **User's requested target sequence** for the mixed effect (verbatim
  intent): *metal fades out WHILE dots (same shape) fade in → dots morph →
  new metal fades in WHILE dots fade out.* The attempt implemented exactly
  this via Reanimated `entering`/`exiting` on the two branches + a
  `playDelayMs` hold — it worked in my screenshots but felt broken to the
  user in real use; not diagnosed before reverting.

## Next-attempt design for the mixed effect (the important lesson)

Mount/unmount layout animations are the fragile part. Build the transition
**inside one component that renders BOTH layers stacked** (absolute-fill),
with two opacity shared values driven explicitly by one timeline —
metal-out → hold → morph → metal-in — no unmounts until fully invisible.
That also allows the metal to keep animating during fades.

## Open roadmap (docs/liquid-metal-path-sdf.md has the full versions)

1. ~~Shared bake~~ ✅ (`usePathSdf`)
2. Field-driven particle targets + wall-aware sizing — in the patch, re-apply
3. Gradient-flow settle (worklet bilinear sampler over `PathSdf.field`) —
   then bubble containment (original handoff steps 3–5) specializes it
4. Metal-colored dots from a snapshot of the rendered metal
5. Cross-fades — fold into the stacked-canvas redesign above

## Gotchas (also in auto-memory)

- Offscreen-surface snapshots draw **nothing** on-screen without
  `makeNonTextureImage()` (cost one debugging round).
- Don't write shared values during render — defer with `queueMicrotask`.
- Reload resets to home; the sim's HID typing can race focus (retype works).
- `.claude/` is gitignored — durable docs go in `docs/`.
- Uncommitted on purpose: `repetition: 3→2` default tweak in
  `SvgLiquidMetalShader.tsx` (user's, unrelated).
