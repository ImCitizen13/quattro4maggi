# quattro4maggi

A collection of **production-quality** React Native animation experiments built with Skia and Reanimated.

Clone them. Learn from them. Ship them.

[quattro4maggi.com](https://quattro4maggi.com) · [@m090009](https://x.com/m090009)

---

## Demos

| Demo | Preview | Description |
|------|---------|-------------|
| [Scale Flip Card](./src/components/scale-flip-card/) | ![scale-flip-card](./assets/demos/scale-flip-card.gif) | Card that expands into fullscreen with 3D flip animation |
| [Text Flyin](./src/components/text-flyin/) | ![text-flyin](./assets/demos/text-flyin.gif) | Staggered character fly-in with spring physics |
| [Liquid Metal](./src/components/liquid-metal/) | ![liquid-metal](./assets/demos/liquid-metal.gif) | Skia shader with animated liquid metal effects |
| [Live Border Card](./src/components/live-border-card/) | ![live-border-card](./assets/demos/live-border-card.gif) | Animated glowing borders with rotating gradients |

---

## Quick Start

```bash
git clone https://github.com/m090009/quattro4maggi.git
cd quattro4maggi
bun install
bun run start
```

---

## Tech Stack

- [Expo](https://expo.dev) + [Expo Router](https://expo.github.io/router)
- [React Native Skia](https://shopify.github.io/react-native-skia/)
- [Reanimated 4](https://docs.swmansion.com/react-native-reanimated/)

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
```

---

## Want More?

I'm building **quattro4maggi membership** — deep-dive tutorials with video walkthroughs, step-by-step breakdowns, and 4 new explorations every month.

The code here is free. The membership saves you hours of reverse-engineering.

[**Get early access**](https://quattro4maggi.com) — Free for early subscribers

---

## License

MIT — use freely in your projects. A star or mention is appreciated!
