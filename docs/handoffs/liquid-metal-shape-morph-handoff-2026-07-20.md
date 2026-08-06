> **Resume:** read this, then `git log -5 --oneline && git status`. The
> pipeline doc (`docs/liquid-metal-path-sdf.md`) is the reference for *how
> things work*; this handoff records *what happened and where to pick up*.

# Liquid Metal — Shape Morph Session Handoff (2026-07-20)

**Branch:** `expo-metal-shader` · **Demo:** `src/app/liquid-metal/index.tsx`

## What got built (on-device verified)

**SDF shape morph** — path changes melt shape-to-shape instead of popping.
The user wanted the metaball/gooey fuse of the SwiftUI blur+threshold trick;
since we already bake exact distance fields, the morph is field interpolation
(`d = mix(dA, dB, m)`) with a static perlin bias on `m` (regions flow
unevenly — "noisy liquid melt", chosen over a clean symmetric blend). Mask,
bands, and bevel all derive from the blended field, so the whole metal
effect morphs coherently, not just the silhouette.

## The three problems hit, in order (each cost a round)

1. **Ghost flash** (user caught on video): first implementation swapped the
   target texture and reset `morph` 0→1 in a `queueMicrotask` — which lands
   *after* the React commit, so the new shape rendered at full weight for a
   frame. **Fix: two-slot scheme.** The shader holds `iSdfTexA`/`iSdfTexB`;
   a new bake always loads the *hidden* slot and the blend springs toward
   it. The committed texture has zero weight under the current blend value —
   flash impossible by construction, and mid-morph changes retarget smoothly.
   This race applies to ANY "swap texture + reset shared value" pattern.

2. **"Takes 2 seconds"**: Reanimated duration-based springs solve stiffness
   for settling at `duration × 1.5` (`perceptualCoefficient` in
   `springUtils.ts`), and the morph is visually back-loaded (zero-crossings
   where old field is deep / new is shallow flip at m ≈ 0.99, in the spring's
   asymptotic tail). User switched `SPRING_SDF_MORPH` to a physical config
   (stiffness 900 / damping 120 / mass 4 — critically damped, ω₀ = 15).

3. **"Spring doesn't start until some delay"** — the real one. Profiled the
   bake on-device: **~1.1s at 750² (EDT alone 950ms)**, ~1.5s at text size.
   The docs' "a few ms" claim was wrong (Hermes has no JIT; corrected in the
   pipeline doc). Every tap was freezing the JS thread for a second before
   the spring could kick. **Fix: module-level bake cache in `usePathSdf`**
   (svgPath sources, keyed source+size, cap 6 ≈ 11MB/entry). Verified: two
   full 5-logo cycles = 5 bakes, second cycle zero; StrictMode double-bake
   at mount also gone. Cached taps morph within a frame or two.

## Where to pick up

- **First bake of a shape still blocks JS ~1.1s** (felt on first cycle
  through logos). Options, in rough order of value: progressive two-phase
  bake (coarse 1× field in ~120ms, start morph, swap full-res in async);
  native/JSI EDT (~50×, kills it outright); persist bakes to disk.
- **Typed text can never hit the cache** (fresh `SkPath` per keystroke,
  ~1.5s per key at text size ×1.4). Same fixes apply; or lower `pixelScale`
  for text mode only.
- Bake log left in `usePathSdf` on purpose (fires only on real bakes) —
  remove when the latency work is done.
- Uncommitted on purpose: `repetition: 3→2` in `SvgLiquidMetalShader.tsx`
  (user's, unrelated); `LiquidMetalDemo.1.tsx` scratch (causes a missing-
  default-export route warning); older gooey-border docs.

## Prior roadmap (unchanged, see pipeline doc)

Bubble containment, gradient-flow settle, metal-colored dots, and the
stacked-canvas metal↔particles transition are still open. The morph may
reduce the need for the particle transition on path changes — the metal now
handles those itself.
