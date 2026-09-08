# quattro4maggi 🍕

Production-grade React Native animation demos, built with Skia, Reanimated and WebGPU.

Four new demos every month. MIT licensed. Free, forever.

Clone them. Learn from them. Ship them.

[quattro4maggi.com](https://quattro4maggi.com) · [@m090009](https://x.com/m090009)

⭐ Star the repo to catch the monthly drops.

---

## Demos

| Demo | Preview | Description |
| --- | --- | --- |
| [Wabi & More](./src/components/wabi-and-more/README.md) | ![wabi-and-more](./assets/demos/wabi-and-more.gif) | Interactive prism bubble with gesture-driven reveals, split-flap text, and particle effects |
| [Ripple Effect](./src/components/ripple-effect/README.md) | ![ripple-effect](./assets/demos/ripple-effect.gif) | Touch-reactive ripple shader with customizable colors |
| [Scale Flip Card](./src/components/scale-flip-card/README.md) | ![scale-flip-card](./assets/demos/scale-flip-card.gif) | Card component that expands into a fullscreen portal with 3D flip animation |
| [Text Flyin](./src/components/text-flyin/README.md) | ![text-flyin](./assets/demos/text-flyin.gif) | Kinetic text animation with staggered character fly-in effect |
| [Liquid Metal](./src/components/liquid-metal/README.md) | ![liquid-metal](./assets/demos/liquid-metal.gif) | Skia shader component with animated liquid metal effects and customizable colors |
| [Live Border Card](./src/components/live-border-card/README.md) | ![live-border-card](./assets/demos/live-border-card.gif) | Animated glowing borders with rotating color gradients and customizable glow effects |
| [Pull To Refresh](./src/components/pull-to-refresh/README.md) | ![pull-to-refresh](./assets/demos/pull-to-refresh.gif) | Gesture-driven pull-to-refresh with a three-stage animation, switchable iOS/Android layout models, and a sticky Threads-style glyph header driven by the same lifecycle |
| [Bubble Reveal](./src/components/bubble-reveal/README.md) | ![bubble-reveal](./assets/demos/bubble-reveal.gif) | Glowing bubble mask with speed-controlled reveal |

---

## Quick Start

```bash
git clone https://github.com/ImCitizen13/quattro4maggi.git
cd quattro4maggi
bun install
bun run start
```

---

## Tech Stack

- [Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/)
- [React Native Skia](https://shopify.github.io/react-native-skia/)
- [Reanimated 4](https://docs.swmansion.com/react-native-reanimated/)
- [Bun](https://bun.sh)

---

## Structure

```
src/
├── app/                    # Expo Router routes
│   ├── index.tsx           # Home gallery
│   └── [demo-name]/        # Individual demo routes
├── components/             # Demo-specific components
│   └── [demo-name]/
├── hooks/
└── lib/
    ├── animations/         # Animation constants
    └── shaders/            # Skia shader definitions

assets/
├── demos/                  # Preview captures
└── videos/
```

---

## Breakdowns

Most React Native animations look good in isolation and fall apart in a real app.

Each demo has a written breakdown covering how it works, what runs on the UI thread and why, and how to adapt the pattern to your own codebase.

Read them at [quattro4maggi.com](https://quattro4maggi.com) — free, no signup.

---

Built by [Mohamed Eltohamy](https://meltohamy.xyz) — open for remote contract and part-time work.

[meltohamy.xyz](https://meltohamy.xyz) · meltohamy@protonmail.com

## License

MIT — use freely in your projects. A star or mention is appreciated!
