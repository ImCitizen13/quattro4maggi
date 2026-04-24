# quattro4maggi

A collection of React Native animation experiments built with **Skia** and **Reanimated**.

🌐 [quattro4maggi.com](https://quattro4maggi.com) · 𝕏 [@m090009](https://x.com/m090009)

---

## Demos

| Demo | Preview | Description |
|------|---------|-------------|
| [Wabi & More](/src/components/wabi-and-more/README.md) | ![wabi-and-more](./assets/demos/wabi_demo.gif) | Interactive prism bubble with gesture-driven reveals, split-flap text, and particle effects |
| [Scale Flip Card](/src/components/scale-flip-card/README.md) | ![scale-flip-card](./assets/demos/scale-flip-card.gif) | Card component that expands into a fullscreen portal with 3D flip animation |
| [Text Flyin](/src/components/text-flyin/README.md) | ![text-flyin](./assets/demos/text-flyin.gif) | Kinetic text animation with staggered character fly-in effect |
| [Liquid Metal](/src/components/liquid-metal/README.md) | ![liquid-metal](./assets/demos/liquid-metal.gif) | Skia shader component with animated liquid metal effects and customizable colors |
| [Live Border Card](/src/components/live-border-card/README.md) | ![live-border-card](./assets/demos/live-border-card.gif) | Animated glowing borders with rotating color gradients and customizable glow effects |

---

## Quick Start

```bash
# Clone
git clone https://github.com/m090009/quattro4maggi.git
cd quattro4maggi

# Install
bun install

# Run
bun run start
```

---

## Tech Stack

- [Expo](https://expo.dev) + [Expo Router](https://expo.github.io/router)
- [React Native Skia](https://shopify.github.io/react-native-skia/)
- [Reanimated](https://docs.swmansion.com/react-native-reanimated/)

---

## Structure

```
src/
├── app/                    # Expo Router routes
│   ├── index.tsx           # Home gallery
│   ├── bouncy-scale-ball/  # Bouncy ball with scale animation
│   ├── final-ripple/       # Polished ripple effect
│   ├── ripple-shader/      # Custom Skia ripple shader
│   ├── scale-flip-card/    # 3D flip card with portal
│   ├── shader-wrapper/     # Reusable shader wrapper
│   ├── shared-element/     # Shared element transitions
│   ├── text-flyin/         # Kinetic text animation
│   └── text-vertical-move/ # Text vertical move experiment
├── components/             # Demo-specific components
│   └── [demo-name]/
├── hooks/
└── lib/
    ├── animations/         # Animation constants
    └── shaders/            # Skia shader definitions
```

---

## License

MIT – feel free to use in your projects. A ⭐ or mention is appreciated!
