# Path Mask Shader

A glass/refraction shader that works with arbitrary SVG paths using alpha-based edge detection.

---

## How It Works

The SVG path is rendered as a white mask on transparent background. The shader samples the mask alpha to detect edges and apply effects like prismatic colors, chromatic aberration, and refraction.

### Flow

```
SVG Path String → Parse & Scale → Render as White Mask → Shader Samples Alpha → Edge Detection → Apply Effects
```

1. **Parse SVG**: `Skia.Path.MakeFromSVGString()` converts the path string
2. **Scale & Center**: Path is scaled to fit canvas with proper bounds
3. **Render Mask**: Path rendered as white on transparent (`<Path color="white" />`)
4. **Shader Processing**: RuntimeShader samples mask via `image.eval()`
5. **Edge Detection**: Sobel-like gradient detects edges from alpha changes
6. **Effects**: Prismatic colors, chromatic aberration, specular highlights

---

## Clip vs Mask Texture Approach

| Aspect | Clip Approach | Mask Texture Approach |
|--------|--------------|----------------------|
| **Code** | `<Group clip={path}>` | `<Group layer={<RuntimeShader>}>` |
| **Simplicity** | One line | Shader samples in 16 directions |
| **Performance** | Single clip operation | Extra GPU sampling per pixel |
| **Edge awareness** | No | Yes - knows distance from edge |
| **Use cases** | Fill patterns, textures | Glass, glow, refraction |

### When to Use Clip

```tsx
// Fill shape with pattern - no edge effects needed
<Group clip={path}>
  <Fill>
    <Shader source={liquidMetalShader} />
  </Fill>
</Group>
```

Best for:
- Liquid metal, gradients, textures
- Effects that fill uniformly
- No edge-dependent behavior

### When to Use Mask Texture

```tsx
// Edge-aware effects via shader sampling
<Group layer={<Paint><RuntimeShader source={glasShader} /></Paint>}>
  <Path path={path} color="white" />
</Group>
```

Best for:
- Glass/refraction effects
- Prismatic edge coloring
- Rim lighting, edge glow
- Chromatic aberration at boundaries
- Transparency gradients (opaque edges, transparent center)

---

## Edge Detection Algorithm

The shader computes edge information by sampling neighboring pixels:

```glsl
// Sobel-like gradient for edge detection
float maskL = image.eval(fragCoord + float2(-1, 0)).a;
float maskR = image.eval(fragCoord + float2(1, 0)).a;
float maskU = image.eval(fragCoord + float2(0, -1)).a;
float maskD = image.eval(fragCoord + float2(0, 1)).a;

float gradX = maskR - maskL;
float gradY = maskD - maskU;
float edge = sqrt(gradX * gradX + gradY * gradY);
```

Distance from edge is approximated by sampling in 16 directions until the alpha crosses 0.5.

---

## Usage

```tsx
import { PathMaskShader } from "@/components/path-mask-shader/PathMaskShaderDemo";

const LOGO_PATH = "M10,0 L20,20 L0,20 Z";

<PathMaskShader
  svgPath={LOGO_PATH}
  viewBoxWidth={20}
  viewBoxHeight={20}
  width={300}
  height={300}
  dispersion={0.08}
  specular={1.0}
  bgColor={[0.05, 0.05, 0.08]}
  prismColors={[
    [1, 0.3, 0.3],   // Red
    [1, 0.8, 0.2],   // Yellow
    [0.3, 1, 0.4],   // Green
    [0.3, 0.9, 1],   // Cyan
    [0.4, 0.4, 1],   // Blue
    [1, 0.4, 0.8],   // Magenta
  ]}
/>
```

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `svgPath` | `string` | - | SVG path d attribute |
| `viewBoxWidth` | `number` | `20` | Original SVG viewBox width |
| `viewBoxHeight` | `number` | `20` | Original SVG viewBox height |
| `width` | `number` | `300` | Canvas width |
| `height` | `number` | `300` | Canvas height |
| `dispersion` | `number` | `0.05` | Chromatic aberration strength |
| `refraction` | `number` | `0.15` | Barrel distortion strength |
| `specular` | `number` | `0.8` | Specular highlight intensity |
| `bgColor` | `RGB` | `[0.1, 0.1, 0.1]` | Background color |
| `prismColors` | `RGB[6]` | Rainbow | Six prismatic color stops |

---

## Future Considerations

### Generic Path Shader Component

A unified component that accepts any shader and applies it to any SVG path:

```tsx
// Hypothetical future API
<PathShader
  svgPath={logoPath}
  shader={liquidMetalShader}  // or glassShader, etc.
  mode="clip" | "mask"        // approach selection
  uniforms={{ ... }}
/>
```

**Challenges:**
- Different shaders expect different uniforms
- Mask approach requires shader to use `uniform shader image`
- Edge detection logic would need to be injected or standardized

### Shader Composition

Compose multiple effects on paths:

```tsx
<PathShader svgPath={path}>
  <LiquidMetalEffect />
  <GlassOverlay />
  <EdgeGlow color="cyan" />
</PathShader>
```

### Performance Optimization

- **SDF Texture Caching**: Pre-compute signed distance field for static paths
- **Jump Flood Algorithm**: GPU-based true SDF computation
- **LOD**: Reduce sampling directions for smaller shapes

---

## File Structure

```
src/
├── components/path-mask-shader/
│   ├── PathMaskShaderDemo.tsx   # Component and demo
│   └── README.md                # This file
│
└── lib/shaders/
    └── PathMaskShader.ts        # SkSL shader source
```
