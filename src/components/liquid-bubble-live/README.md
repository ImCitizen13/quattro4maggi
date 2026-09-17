# Liquid Bubble Live

A wobbly glass bubble that bends whatever is drawn behind it, live.

Drag to move it, pinch to resize it. Physics and gestures are shared with
`liquid-glass-bubble`; this demo only swaps the image source for a Skia
`<BackdropFilter>`.

## Files

- `LiquidBubbleLive.tsx`: canvas, background, backdrop clip, panel
- `shaders.ts`: the bubble shader
- `liveConfig.ts`: demo-only constants
- Controls: `../liquid-glass-bubble/BubbleTuningPanel.tsx` + `hooks/useBubbleOptics.ts`

## Controls

Every slider has a ↺ reset. **Reset all** restores defaults. **Gargantua**
loads the look from `gargantua-type-gpu/centerBubbleScene.ts`.

| Tab | Slider | What it does |
|---|---|---|
| Shape | Wobble | How much the edge wobbles |
| Refraction | Refract | How far the rim bends the background |
| | Lens falloff | How deep the bending reaches from the rim |
| | Lens | + magnify, − pincushion |
| | Dispersion | Rainbow color split at the rim |
| | Edge width | Width of the rim band |
| Surface | Film | Soap-film rainbow strength |
| | Film bands | Number of film color bands |
| | Tint | Blue tint amount |
| | Specular | Shine highlight, top-left |
| Rim | Rim dark / Rim width | Dark outline strength and width |
| | Rainbow mix / glow | Rainbow color around the rim |
| | Halo spread / Halo | Glow outside the bubble (− dark, + light) |

Defaults for every control live in `../liquid-glass-bubble/bubbleModes.ts`.
