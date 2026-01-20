# Liquid Metal Shader

A React Native Skia shader component that renders animated liquid metal effects with customizable shapes, colors, and chromatic aberration.

---

## Required Libraries

```bash
npm install @shopify/react-native-skia react-native-reanimated
# or
npx expo install @shopify/react-native-skia react-native-reanimated
```

**Setup `react-native-reanimated`** in your `babel.config.js`:

```js
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: ['react-native-reanimated/plugin'],
};
```

---

## How It Works

### Animation Flow

1. **Component mounts** → Shader compiles via `Skia.RuntimeEffect.Make()`
2. **Clock starts** → `useClock()` provides continuous time updates
3. **Uniforms update** → `useDerivedValue()` recalculates shader inputs each frame
4. **GPU renders** → Skia draws the liquid metal effect at 60fps
5. **User sees** → Animated metallic stripes with chromatic aberration

### Key Concepts

| Concept | Description |
|---------|-------------|
| `iTime` | Animation time in seconds (drives all movement) |
| `iShape` | Shape mode: 0=full, 1=circle, 2=daisy, 3=diamond, 4=metaballs |
| `iRepetition` | Number of metallic stripes (1-20) |
| `iColorHighlight` | Bright reflection color (RGB 0-1) |
| `iColorShadow` | Dark shadow color (RGB 0-1) |
| Chromatic aberration | RGB channels offset to create color fringing effect |
| Simplex/Perlin noise | Procedural noise for organic distortion |

### Shader Variants

| Shader | Noise Type | Custom Colors | Interaction | Use Case |
|--------|------------|---------------|-------------|----------|
| `LiquidMetalShader` | Simplex | No (silver only) | None | Original paper-design port |
| `PerlinLiquidMetalShader` | Perlin | Yes (9 presets + custom) | None | Differentiated version |
| `SensorLiquidMetalShader` | Perlin | Yes (9 presets + custom) | Device tilt | Mobile-optimized with gyroscope |

---

## Usage

### Basic Example

```tsx
import { LiquidMetalShader } from "@/components/liquid-metal/LiquidMetalShader";

<LiquidMetalShader width={200} height={200} />
```

### With Metal Presets

```tsx
import { PerlinLiquidMetalShader } from "@/components/liquid-metal/PerlinLiquidMetalShader";

// Gold metal
<PerlinLiquidMetalShader
  width={200}
  height={200}
  metal="gold"
/>

// Rose gold with diamond shape
<PerlinLiquidMetalShader
  width={200}
  height={200}
  metal="roseGold"
  shape={3}
/>

// Chrome with metaballs
<PerlinLiquidMetalShader
  width={200}
  height={200}
  metal="chrome"
  shape={4}
/>
```

### With Custom Colors

```tsx
import { PerlinLiquidMetalShader } from "@/components/liquid-metal/PerlinLiquidMetalShader";

// Custom pink metal
<PerlinLiquidMetalShader
  width={200}
  height={200}
  metal="custom"
  customHighlight={[0.95, 0.6, 0.8]}
  customShadow={[0.4, 0.15, 0.25]}
/>
```

### With Device Sensor (Gyroscope)

```tsx
import { SensorLiquidMetalShader } from "@/components/liquid-metal/SensorLiquidMetalShader";

// Basic - tilt device to see reflections shift
<SensorLiquidMetalShader
  width={200}
  height={200}
  metal="gold"
/>

// Subtle sensor effect
<SensorLiquidMetalShader
  width={200}
  height={200}
  metal="chrome"
  sensorInfluence={0.3}
/>

// Maximum sensor reactivity
<SensorLiquidMetalShader
  width={200}
  height={200}
  metal="silver"
  sensorInfluence={1.0}
  sensorInterval={8}  // Faster updates (120fps)
/>
```

### Full Customization

```tsx
import { LiquidMetalShader } from "@/components/liquid-metal/LiquidMetalShader";

<LiquidMetalShader
  width={300}
  height={300}
  shape={1}           // Circle
  repetition={5}      // More stripes
  shiftRed={0.5}      // More red shift
  shiftBlue={0.5}     // More blue shift
  distortion={0.15}   // More noise
  contour={0.5}       // Sharper edges
  angle={45}          // Rotated pattern
  speed={1.5}         // Faster animation
  softness={0.2}      // Softer transitions
/>
```

### Using Color Presets Directly

```tsx
import { METAL_PRESETS, getMetalColors, interpolateMetalColors } from "@/lib/shaders/ColorsLiquidMetal";

// Access preset directly
const goldColors = METAL_PRESETS.gold;
console.log(goldColors.highlight); // [1.0, 0.84, 0.0]
console.log(goldColors.shadow);    // [0.40, 0.25, 0.0]

// Use helper function
const copperColors = getMetalColors('copper');

// Blend between metals (for animations)
const blendedColors = interpolateMetalColors('silver', 'gold', 0.5);
```

---

## Props

### LiquidMetalShader Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | `300` | Canvas width in pixels |
| `height` | `number` | `300` | Canvas height in pixels |
| `shape` | `0 \| 1 \| 2 \| 3 \| 4` | `1` | Shape mode (see Shape Modes) |
| `colorBack` | `[number, number, number, number]` | `[0,0,0,0]` | Background RGBA (0-1) |
| `colorTint` | `[number, number, number, number]` | `[1,1,1,0]` | Tint color for color burn |
| `softness` | `number` | `0` | Blur/softness (0-1) |
| `repetition` | `number` | `3` | Stripe count (1-20) |
| `shiftRed` | `number` | `0.3` | Red chromatic shift (0-1) |
| `shiftBlue` | `number` | `0.3` | Blue chromatic shift (0-1) |
| `distortion` | `number` | `0.07` | Noise distortion (0-1) |
| `contour` | `number` | `0.3` | Edge sharpness (0-1) |
| `angle` | `number` | `30` | Pattern rotation (degrees) |
| `speed` | `number` | `1` | Animation speed multiplier |

### PerlinLiquidMetalShader Props

Includes all `LiquidMetalShader` props plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `metal` | `MetalPresetName` | `'silver'` | Metal preset name |
| `customHighlight` | `[number, number, number]` | - | Custom highlight RGB (if metal='custom') |
| `customShadow` | `[number, number, number]` | - | Custom shadow RGB (if metal='custom') |

### SensorLiquidMetalShader Props

Includes all `PerlinLiquidMetalShader` props plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `sensorInfluence` | `number` | `0.7` | How much device tilt affects reflection (0-1) |
| `sensorInterval` | `number` | `16` | Sensor update interval in ms (lower = smoother) |

**Sensor Behavior:**
- **Roll (left/right tilt)**: Rotates reflection angle
- **Pitch (forward/backward tilt)**: Shifts lighting gradient
- Requires physical device (simulator won't show sensor effect)

### Shape Modes

| Value | Shape | Description |
|-------|-------|-------------|
| `0` | Full-fill | Fills entire canvas with edge effects |
| `1` | Circle | Centered circular shape |
| `2` | Daisy | Flower/petal pattern (animated) |
| `3` | Diamond | Rotated square |
| `4` | Metaballs | Animated blob shapes |

### Metal Presets

| Preset | Highlight | Shadow | Description |
|--------|-----------|--------|-------------|
| `silver` | `[0.98, 0.98, 1.0]` | `[0.10, 0.10, 0.10]` | Classic metallic silver |
| `gold` | `[1.0, 0.84, 0.0]` | `[0.40, 0.25, 0.0]` | Warm yellow gold |
| `copper` | `[0.72, 0.45, 0.20]` | `[0.25, 0.12, 0.05]` | Reddish-brown copper |
| `roseGold` | `[0.98, 0.76, 0.70]` | `[0.35, 0.15, 0.12]` | Pink-tinted gold |
| `bronze` | `[0.80, 0.50, 0.20]` | `[0.30, 0.15, 0.05]` | Antique bronze |
| `platinum` | `[0.90, 0.89, 0.88]` | `[0.15, 0.15, 0.17]` | Cool silvery-white |
| `chrome` | `[1.0, 1.0, 1.0]` | `[0.05, 0.05, 0.05]` | High-contrast chrome |
| `titanium` | `[0.62, 0.62, 0.65]` | `[0.12, 0.12, 0.15]` | Dark gunmetal |
| `brass` | `[0.95, 0.80, 0.30]` | `[0.35, 0.28, 0.08]` | Warm yellow brass |

---

## Shader Architecture

### Simplex vs Perlin Noise

The two shader variants use different noise algorithms:

**Simplex Noise** (LiquidMetalShader):
- More organic, irregular patterns
- Slightly faster computation
- Used in original paper-design shader

**Perlin Noise** (PerlinLiquidMetalShader):
- Smoother, more regular gradients
- Quintic interpolation for better quality
- Differentiates from the original

### Chromatic Aberration

The liquid metal effect uses chromatic aberration to create color fringing:

```
R channel: direction + dispersionRed   (shifts one way)
G channel: direction                    (no shift)
B channel: direction - dispersionBlue  (shifts opposite)
```

This creates the characteristic rainbow edges seen in real liquid metal reflections.

### Sensor Integration

The `SensorLiquidMetalShader` uses `react-native-reanimated`'s `useAnimatedSensor` with `SensorType.ROTATION` to track device orientation:

```
Device Tilt → Sensor Data → Shader Uniforms → Visual Effect
     │              │              │               │
     │         pitch/roll    iSensorX/Y      Reflection
     │         (-π to π)     (-1 to 1)        shift
     └──────────────────────────────────────────────┘
```

**What changes with tilt:**
1. **Reflection angle**: Stripe pattern rotates as you tilt left/right
2. **Light gradient**: Highlight shifts up/down as you tilt forward/back
3. **Bump mapping**: Surface normals respond to orientation
4. **Chromatic aberration**: Color fringing shifts with tilt

**Note:** Sensor effects only work on physical devices. The iOS Simulator and Android Emulator don't simulate gyroscope data.

---

## File Structure

```
src/
├── components/liquid-metal/
│   ├── LiquidMetalShader.tsx        # Original shader component (simplex)
│   ├── PerlinLiquidMetalShader.tsx  # Differentiated component (perlin + colors)
│   ├── SensorLiquidMetalShader.tsx  # Sensor-reactive component (gyroscope)
│   └── README.md                    # This file
│
└── lib/shaders/
    ├── liquidMetal.tsx              # Simplex noise SkSL shader
    ├── PerlinLiquidMetal.ts         # Perlin noise SkSL shader with color uniforms
    ├── SensorLiquidMetal.ts         # Perlin shader with sensor uniforms
    └── ColorsLiquidMetal.tsx        # Metal color presets and helpers
```

---

## Attribution

This shader is ported from [paper-design/shaders](https://github.com/paper-design/shaders).

**License:** PolyForm Shield License 1.0.0

- Allowed: Personal/educational use, mobile apps
- Not allowed: Creating competing shader libraries

The `PerlinLiquidMetalShader` variant differentiates from the original by:
1. Using Perlin noise instead of simplex noise
2. Adding customizable metal color presets
3. Optimizing for React Native/mobile

---

## Future Enhancements

- [ ] **Image mode**: Apply liquid metal effect to images using `uniform shader image`
- [ ] **Touch interaction**: Ripples emanating from tap points
- [x] **Gyroscope response**: Metal reflects based on device tilt (`SensorLiquidMetalShader`)
- [ ] **Additional shapes**: Heart, star, rounded rectangle
