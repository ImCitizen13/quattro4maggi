# Portal Card Animation Implementation Journey

## 🎯 Goal
Create an animated card that expands from its position to center screen with a flip animation, rendered above all other content.

---

## Implementation Steps

### Step 1: Basic Reanimated Animation
- Added `useSharedValue` for animation progress
- Created `useAnimatedStyle` to interpolate width/height
- Card scaled in place but stayed within parent bounds

**Problem**: Card couldn't appear above other dashboard sections due to z-index stacking context limitations.

---

### Step 2: Added Portal (`@gorhom/portal`)
- Wrapped app with `PortalProvider` in root layout
- Rendered expanded card inside `<Portal>` to escape parent container
- Card now renders at root level, above everything

**Problem**: Card appeared at wrong position (started at 0,0 instead of original card position).

---

### Step 3: Measure & Animate Position
- Added `useRef` to measure original card's screen position via `measureInWindow`
- Stored `originX`, `originY`, `originWidth`, `originHeight` in shared values
- Animated from measured position → screen center

**Problem**: Card content (image/text) didn't scale with the card.

---

### Step 4: Animated Content Scaling
- Added `animatedImageStyle` to scale image size (80 → 120)
- Added `animatedTextStyle` to scale font size (14 → 24)
- Content now grows smoothly with card

---

### Step 5: Added Flip Animation
- Added `flipProgress` shared value (0 = front, 1 = back)
- Created front/back animated styles with `rotateY` transform
- Used `backfaceVisibility: "hidden"` + `pointerEvents` for proper flipping

**Problem**: Card clipped during rotation (saloon door effect).

---

### Step 6: Fixed Flip Structure
Separated position/size animation from rotation animation by creating a 3-layer structure:

1. **Outer Layer**: Animated position + size
2. **Middle Layer**: Flip rotation (front/back faces)
3. **Inner Layer**: Content

---

### Step 7: Modularized Components

#### Created `AnimatedPortalCard` (Reusable)
- Handles all animation logic
- Accepts `triggerContent`, `frontContent`, `backContent`
- Exposes `open()`, `close()`, `flip()` via `forwardRef`

#### Created Content Components
- `ActionCardFrontContent` - Icon + title
- `ActionCardBackContent` - Renders `WriteUp` form
- `WriteUp` - Write-up form extracted from screen

#### Simplified `ActionCard`
- Just composes `AnimatedPortalCard` with content components
- ~400 lines → ~120 lines

---

### Step 8: Fixed Provider Order

**Bug**: `WriteUp` threw "SupabaseProvider not found" error

**Cause**: Portal content rendered outside Supabase context

**Fix**: Moved `SupabaseProvider` to wrap `PortalProvider`:

// BEFORE (Wrong)
<PortalProvider>
  <SupabaseProvider>
    <App />
  </SupabaseProvider>
</PortalProvider>

// AFTER (Correct)
<SupabaseProvider>
  <PortalProvider>
    <App />
  </PortalProvider>
</SupabaseProvider>
