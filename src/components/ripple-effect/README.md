# Ripple Effect

A touch-reactive water ripple shader using Skia RuntimeShader. Tap anywhere to create bouncy ripples that expand outward and reflect from edges.

---

## Required Libraries

```bash
bun add @shopify/react-native-skia react-native-reanimated react-native-gesture-handler
```

---

## How It Works

1. **Tap detected** -> Capture normalized position and timestamp
2. **Outward wave** -> Sinusoidal wave expands from tap point
3. **Reflected wave** -> Second wave bounces back from edges
4. **Refraction applied** -> UV coordinates distorted based on wave amplitude
5. **Decay** -> Both waves fade exponentially for natural damping

---

## Usage

```tsx
import { RippleEffect } from "@/components/ripple-effect/RippleEffect";

// Basic usage
<RippleEffect />

// Custom image
<RippleEffect imageSource={require("./my-image.png")} />

// Custom sizing
<RippleEffect
  widthRatio={0.95}
  heightRatio={0.5}
  borderRadius={20}
/>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `imageSource` | `DataSourceParam` | Built-in image | Image to apply ripple effect on |
| `borderRadius` | `number` | `15` | Corner radius for the container |
| `heightRatio` | `number` | `0.65` | Height as percentage of screen (0-1) |
| `widthRatio` | `number` | `0.9` | Width as percentage of screen (0-1) |

---

## Shader Parameters

The `BouncyRippleShader` uses these internal parameters:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `speed` | `0.65` | Wave propagation speed |
| `frequency` | `18.0` | Oscillation frequency |
| `decay` | `3.5` | Exponential damping factor |
| `amplitude` | `0.05` | Refraction strength |

---

## File Structure

```
src/components/ripple-effect/
├── RippleEffect.tsx   # Main component
├── shaders.ts         # Skia shader definitions
└── README.md          # This file
```

---

## Coming Soon

**Prism Effect Shader** - A prismatic light dispersion effect with RGB channel separation and touch-reactive positioning. Available for early access members.
