# quattro4maggi

A collection of React Native animation experiments built with **Skia** and **Reanimated**.

🌐 [quattro4maggi.com](https://quattro4maggi.com) · 𝕏 [@m090009](https://x.com/m090009)

---

## Demos

| Demo | Preview | Description |
|------|---------|-------------|
| [Shared Element](/src/app/shared-element) | ![shared-element](./assets/demos/shared-element.gif) | Smooth shared element transitions |
| [Ripple Shader](/src/app/ripple-shader) | ![ripple-shader](./assets/demos/ripple-shader.gif) | Custom ripple effect using Skia shaders |
| [Final Ripple](/src/app/final-ripple) | ![final-ripple](./assets/demos/final-ripple.gif) | Polished ripple with advanced timing |
| [Shader Wrapper](/src/app/shader-wrapper) | ![shader-wrapper](./assets/demos/shader-wrapper.gif) | Reusable wrapper for Skia shader effects |

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
│   ├── shared-element/
│   ├── ripple-shader/
│   ├── final-ripple/
│   └── shader-wrapper/
├── components/             # Demo-specific components
│   └── [demo-name]/
├── hooks/
└── lib/shaders/
```

---

## License

MIT – feel free to use in your projects. A ⭐ or mention is appreciated!
