> **Resume:** Read this, run `git log -5 && git status`, then act on "Next".

# gooey-chat-shader handoff — 2026-05-21 21:23

**Branch:** `demo/border-shader-test` · **Last commit:** `ddb5b29 Simplify GooeyBorderView with transparent background`

## Goal
Gooey metaball border with pan-driven mode transitions and glass-like shimmer effects.

## State
- Working on: `src/components/border-shader/GooeyBorderView.tsx:38` — transparent blob rendering
- Changed files: GooeyBorder.tsx, GooeyBorderView.tsx, ShimiringShader.tsx, useGooeyBorder.ts, shimiringGooeyBorderShader.ts
- Uncommitted: no

## Plan
- [x] Pan gesture sequence: button (h*0.75) → border → blob (h*0.5)
- [x] Direction-based gather (pan-up=bottom, pan-down=top)
- [x] High-DPI rendering with pd scaling + double transform trick
- [x] Rotating specular synced with pulse
- [x] Transparent background for GooeyBorderView
- [ ] **Next:** Add `u_bgColor` uniform to `gooeyBorderShader.ts` so shader renders LIGHT_TINT background internally
- [ ] Wire `u_bgColor` uniform in GooeyBorderView.tsx

## Gotchas
- Layer approach without children → black screen. Shader needs `image` uniform to sample.
- High-DPI: both ball positions AND u_resolution must be pd-scaled, plus double transform (scale pd inner, 1/pd outer).
- `smoothstep(0.0, -threshold, field)` for anti-aliased edges — note inverted edge params.

## Refs
- [gooeyBorderShader.ts:37](src/components/border-shader/gooeyBorderShader.ts) — alpha calculation needs u_bgColor
- [constants.ts:LIGHT_TINT](src/components/border-shader/constants.ts) — background color to use
- [cf9510f] — high-DPI + rotating specular commit
