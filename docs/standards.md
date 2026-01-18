# Component Documentation Standard

This document defines the standard format for documenting React Native components in the quattro4maggi project.

---

## Documentation Template

All component READMEs should follow this structure:

### 1. Title & Brief Description

```markdown
# ComponentName

A concise one-line description of what the component does.
```

**Example:**
```markdown
# AnimatedPortalCard

A React Native card component that expands into a fullscreen portal with a 3D flip animation.
```

---

### 2. Required Libraries Section

List all external dependencies and setup instructions.

```markdown
## Required Libraries

\`\`\`bash
npm install dependency-1 dependency-2
# or
npx expo install dependency-1 dependency-2
\`\`\`

**Setup instructions** if any configuration is needed:

\`\`\`tsx
// Configuration code example
\`\`\`
```

**Example:**
```markdown
## Required Libraries

\`\`\`bash
npm install react-native-reanimated @gorhom/portal
# or
npx expo install react-native-reanimated @gorhom/portal
\`\`\`

**Setup `@gorhom/portal`** in your root layout:

\`\`\`tsx
import { PortalProvider } from "@gorhom/portal";

export default function RootLayout() {
  return (
    <PortalProvider>
      {/* Your app */}
    </PortalProvider>
  );
}
\`\`\`
```

---

### 3. How It Works Section

Explain the component's behavior and key concepts.

#### 3.1 Animation/Interaction Flow

Provide a numbered list showing the sequence of events:

```markdown
### Animation Flow

1. **Event 1** → What happens
2. **Event 2** → What happens
3. **Event 3** → What happens
```

**Example:**
```markdown
### Animation Flow

1. **User presses trigger** → `measureInWindow()` captures card position
2. **Portal mounts** → Card appears at trigger position
3. **Expand animation** → Card animates to screen center
4. **Flip animation** → Front rotates away, back rotates in (180° Y-axis)
5. **User taps backdrop** → Reverse animations
6. **Portal unmounts** → Trigger fades back in
```

#### 3.2 Key Concepts Table

Define important variables, concepts, or technical terms:

```markdown
### Key Concepts

| Concept | Description |
|---------|-------------|
| `conceptName1` | What it represents |
| `conceptName2` | What it represents |
```

**Example:**
```markdown
### Key Concepts

| Concept | Description |
|---------|-------------|
| `animationProgress` | 0 = collapsed, 1 = expanded |
| `flipProgress` | 0 = front visible, 1 = back visible |
| `Portal` | Renders content above all other views |
| `measureInWindow` | Gets trigger's screen coordinates |
```

---

### 4. Usage Section

Provide multiple examples showing different usage patterns.

```markdown
## Usage

### Basic Example

\`\`\`tsx
// Simplest usage
\`\`\`

### Advanced Example

\`\`\`tsx
// With additional features
\`\`\`

### With Ref Control

\`\`\`tsx
// Using forwardRef pattern
\`\`\`
```

**Guidelines:**
- Start with the simplest example
- Progress to more complex patterns
- Show real-world use cases
- Include comments explaining key parts

---

### 5. Props/API Reference

Document all props in a table format:

```markdown
## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `propName` | `PropType` | `defaultValue` | What it does |
```

**Example:**
```markdown
## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `triggerContent` | `ReactNode \| (props) => ReactNode` | required | Card shown in list |
| `frontContent` | `ReactNode` | required | Front face when expanded |
| `backContent` | `ReactNode` | required | Back face after flip |
| `expandedWidthRatio` | `number` | `0.7` | Expanded width (% of screen) |
| `flipOnOpen` | `boolean` | `true` | Auto-flip when opening |
```

**Prop Type Formatting:**
- Use TypeScript syntax: `string`, `number`, `boolean`, `ReactNode`
- For unions: `Type1 \| Type2`
- For functions: `(arg: Type) => ReturnType`
- Use `required` for required props
- Escape pipe symbols in tables: `\|`

---

### 6. Advanced Patterns (Optional)

If the component uses advanced React patterns (forwardRef, render props, compound components), explain them:

```markdown
## [Pattern Name] Explained

### Why [Pattern]?

Brief explanation of the benefit.

### How It Works

Visual diagram (ASCII or Mermaid) + code example.

### Implementation

\`\`\`tsx
// Step-by-step implementation
\`\`\`

### Key Points

1. **Point 1** - Explanation
2. **Point 2** - Explanation
```

**Example:**
```markdown
## forwardRef Pattern Explained

### Why forwardRef?

`forwardRef` allows parent components to access internal methods (`open`, `close`, `flip`) via a ref.

### How It Works

\`\`\`mermaid
flowchart LR
    A[Parent Component] -->|ref| B[forwardRef]
    B -->|props, ref| C[AnimatedPortalCard]
    C -->|useImperativeHandle| D[Exposed Methods]
    D -->|open, close, flip| A
\`\`\`

### Key Points

1. **`forwardRef`** - Passes ref from parent to child
2. **`useImperativeHandle`** - Customizes what ref exposes
3. **Type safety** - `AnimatedPortalCardHandle` ensures correct signatures
```

---

### 7. File Structure (Optional)

Show the component's file organization:

```markdown
## File Structure

\`\`\`
src/components/component-name/
├── MainComponent.tsx    # Description
├── SubComponent.tsx     # Description
├── index.ts             # Exports
└── README.md            # This file
\`\`\`
```

---

## Documentation Checklist

Before finalizing component documentation, ensure:

- [ ] Title and brief description are clear
- [ ] All required dependencies are listed with installation commands
- [ ] Setup instructions are provided if needed
- [ ] Animation/interaction flow is documented step-by-step
- [ ] Key concepts are defined in a table
- [ ] At least 2-3 usage examples are provided
- [ ] All props are documented with types and defaults
- [ ] Complex patterns (forwardRef, render props) are explained
- [ ] Code examples are tested and accurate
- [ ] File structure is documented if multiple files exist

---

## Writing Style Guidelines

### Tone
- **Clear and concise** - Avoid unnecessary jargon
- **Educational** - Assume the reader is learning
- **Practical** - Focus on real-world usage

### Code Examples
- **Syntax highlighting** - Always specify language (`tsx`, `bash`)
- **Complete examples** - Include imports when relevant
- **Comments** - Explain non-obvious parts
- **Real content** - Use realistic placeholder names (not `foo`, `bar`)

### Formatting
- **Headers** - Use `##` for main sections, `###` for subsections
- **Emphasis** - Use **bold** for important terms
- **Code spans** - Use backticks for code: `` `variableName` ``
- **Dividers** - Use `---` between major sections

### Tables
- **Alignment** - Left-align text columns
- **Required props** - Use `required` instead of showing complex types as defaults
- **Escape pipes** - Use `\|` for union types in tables

---

## Examples

### Good Documentation

✅ Clear flow: "User taps button → Animation starts → Portal opens"
✅ Concept table: Defines `animationProgress` as "0 = collapsed, 1 = expanded"
✅ Multiple examples: Basic, with render prop, with ref
✅ Pattern explanation: Includes ASCII diagram + code + key points

### Poor Documentation

❌ Vague: "This component does animations"
❌ Missing types: Props listed without TypeScript types
❌ Single example: Only shows one usage pattern
❌ No context: Doesn't explain why patterns are used

---

## Template File

Use this as a starting point for new component READMEs:

```markdown
# ComponentName

Brief description of what this component does.

---

## Required Libraries

\`\`\`bash
npm install dependency-1
# or
npx expo install dependency-1
\`\`\`

---

## How It Works

### Animation Flow

1. **Event 1** → What happens
2. **Event 2** → What happens

### Key Concepts

| Concept | Description |
|---------|-------------|
| `concept1` | Description |

---

## Usage

### Basic Example

\`\`\`tsx
<Component prop="value" />
\`\`\`

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `prop1` | `string` | required | What it does |

---

## File Structure

\`\`\`
src/components/component-name/
├── Component.tsx
├── index.ts
└── README.md
\`\`\`
```

---

## References

- Model documentation: [src/components/scale-flip-card/README.md](../src/components/scale-flip-card/README.md)
- Project guidelines: [CLAUDE.md](../.claude/CLAUDE.md)
