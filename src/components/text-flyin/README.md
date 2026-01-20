# KineticText

A React Native text animation component that creates a kinetic "fly-in" effect where each character animates in with a staggered delay, featuring both simple and 3D warp animation modes.

---

## Required Libraries

```bash
bun add react-native-reanimated
# or
npx expo install react-native-reanimated
```

**Note:** Reanimated requires additional setup. See [Reanimated installation docs](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/).

---

## How It Works

### Animation Flow

1. **Text splitting** → Text string is split into individual characters
2. **Progress initialization** → Shared `progress` value starts at 0
3. **Animation trigger** → `start()` animates progress from 0 → 1 using spring physics
4. **Staggered calculation** → Each character calculates `localProgress` based on index
5. **Transform application** → Characters animate opacity, position, and rotation
6. **Completion** → `onAnimationComplete` callback fires when spring settles

### Key Concepts

| Concept | Description |
|---------|-------------|
| `progress` | SharedValue (0-1) that drives all character animations |
| `localProgress` | Per-character progress calculated from global progress and stagger offset |
| `staggerDelay` | Time offset between each character's animation start (0-1) |
| `withWarp` | Enables 3D perspective-based animation with rotateX/rotateZ |
| `laggy` | Quantizes animation into discrete steps for retro effect |
| `worklet` | Reanimated function that runs on UI thread for 60fps |

### Animation Modes

**Simple Mode** (`withWarp=false`):
```
Opacity:    0 ──────────────────► 1
TranslateY: 30px ───────────────► 0px
Scale:      0.3 ────────────────► 1.0
```

**Warp Mode** (`withWarp=true`, default):
```
Opacity:    0 ──────────────────► 1
TranslateY: 50px ──► -15px ─────► 0px (overshoots)
RotateX:    90° ────────────────► 0° (flips into view)
RotateZ:    -20° ───────────────► 0° (slight twist)
Perspective: 400px (constant 3D depth)
```

---

## Usage

### Basic Example

```tsx
import { KineticText } from "@/components/text-flyin/TextCanvas";

export default function Demo() {
  return (
    <KineticText
      text="Hello World"
      fontSize={48}
      color="#fff"
    />
  );
}
```

### With Ref Control

```tsx
import { useRef } from "react";
import { View, Pressable, Text } from "react-native";
import { KineticText, KineticTextHandle } from "@/components/text-flyin/TextCanvas";

export default function Demo() {
  const textRef = useRef<KineticTextHandle>(null);

  return (
    <View>
      <KineticText
        ref={textRef}
        text="Animate Me"
        fontSize={48}
        color="#fff"
        autoStart={false}
        onAnimationStart={() => {
          "worklet";
          console.log("Animation started");
        }}
        onAnimationComplete={() => {
          "worklet";
          console.log("Animation completed");
        }}
      />

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable onPress={() => textRef.current?.start()}>
          <Text>Start</Text>
        </Pressable>
        <Pressable onPress={() => textRef.current?.reset()}>
          <Text>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

### With Slider Control

```tsx
import { useState } from "react";
import { View } from "react-native";
import { useDerivedValue } from "react-native-reanimated";
import { Slider } from "@expo/ui/swift-ui";
import { KineticText } from "@/components/text-flyin/TextCanvas";

export default function Demo() {
  const [sliderValue, setSliderValue] = useState(0);

  const animatedProgress = useDerivedValue(() => sliderValue);

  return (
    <View>
      <KineticText
        text="Scrub Me"
        fontSize={48}
        color="#fff"
        progress={animatedProgress}
        withSliderControl={true}
        autoStart={false}
      />

      <Slider
        min={0}
        max={1}
        value={sliderValue}
        onValueChange={setSliderValue}
      />
    </View>
  );
}
```

### With Laggy Effect

```tsx
<KineticText
  text="Retro Vibes"
  fontSize={48}
  color="#fff"
  laggy={true}
  staggerDelay={0.08}
/>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | `"Reminders"` | The text string to animate |
| `fontSize` | `number` | `48` | Font size in pixels |
| `color` | `string` | `"#fff"` | Text color |
| `bgcolor` | `string` | `"#000"` | Background color of container |
| `staggerDelay` | `number` | `0.01` | Delay between characters (0-1, higher = more spread) |
| `autoStart` | `boolean` | `true` | Auto-start animation on mount |
| `progress` | `SharedValue<number>` | - | External progress for slider control |
| `withSliderControl` | `boolean` | `false` | Use external progress instead of internal animation |
| `laggy` | `boolean` | `false` | Enable quantized/choppy animation effect |
| `duration` | `number` | - | Currently unused (spring config controls timing) |
| `onAnimationStart` | `() => void` | - | Callback when animation starts (must be worklet) |
| `onAnimationComplete` | `() => void` | - | Callback when animation completes (must be worklet) |

---

## Ref Methods (KineticTextHandle)

| Method | Description |
|--------|-------------|
| `start()` | Starts the fly-in animation from current progress |
| `reset()` | Resets animation to initial state (progress = 0) |
| `isAnimating` | Returns `true` if animation is currently running |

---

## forwardRef Pattern Explained

### Why forwardRef?

`forwardRef` allows parent components to imperatively control the animation via ref methods (`start`, `reset`).

### How It Works

```
┌─────────────────┐       ┌──────────────┐       ┌─────────────────┐
│ Parent Component│──ref──│  forwardRef  │──────►│  KineticText    │
│                 │       │              │       │                 │
│ textRef.current │◄──────│ useImperative│◄──────│ start, reset    │
│   ?.start()     │       │    Handle    │       │ isAnimating     │
└─────────────────┘       └──────────────┘       └─────────────────┘
```

### Key Points

1. **`forwardRef`** - Passes ref from parent to child component
2. **`useImperativeHandle`** - Customizes what the ref exposes
3. **Type safety** - `KineticTextHandle` ensures correct method signatures
4. **UI thread** - All animation state uses `SharedValue` for 60fps performance

---

## Worklet Callbacks

Callbacks (`onAnimationStart`, `onAnimationComplete`) run on the UI thread and **must be worklets**:

```tsx
// Correct - declared as worklet
onAnimationComplete={() => {
  "worklet";
  // This runs on UI thread
}}

// Incorrect - will crash!
onAnimationComplete={() => {
  // Missing "worklet" directive
}}
```

---

## File Structure

```
src/components/text-flyin/
├── TextCanvas.tsx    # Main KineticText component
├── index.ts          # Exports
└── README.md         # This file
```

---

## Demo Route

The demo is available at `/text-flyin` and showcases:

- Start/Reset button controls
- Slider-based progress scrubbing
- Toggle for "laggy" quantized effect
- Toggle for slider vs. spring animation

See [src/app/text-flyin/index.tsx](../../app/text-flyin/index.tsx) for the full implementation.
