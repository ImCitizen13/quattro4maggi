# Dev Tuning Controls (Dials)

Tune animation and shader values live from a **DialKit panel inside React Native
DevTools**, with no in-app slider UI. Values reach the app over Rozenite's bridge
and drive Reanimated `SharedValue`s directly, with no React re-render per drag tick.

Blueprint: `~/Projects/tools/react-native-dialkit/PLAN.md`.
First user: `src/components/black-hole-gpu/lensDials.ts`.

```
React Native DevTools ─ "Dials" tab (iframe, React DOM)        App (Hermes)
┌──────────────────────────────────────────┐              ┌───────────────────────────────┐
│ plugins/rozenite-plugin-dialkit          │   register   │ src/lib/dials                 │
│  panel.tsx                               │ ◄─────────── │  useDials / useDialsShared /  │
│   DialBridge per id                      │              │  useDialsListener             │
│    useDialKitController(name, config,    │    values    │   └─ dialStore (singleton)    │
│      { id, persist: true })              │ ───────────► │       └─ SharedValue.set(...) │
│   <DialRoot mode="inline" />             │ action/ready │                               │
└──────────────────────────────────────────┘ ◄──────────► └───────────────────────────────┘
```

---

## When to use it

| Need | Use |
|---|---|
| Finding good values for springs, shader uniforms, offsets, colors | **Dials**: the full DialKit editor (spring/Bézier curves, XY pads, versions, Copy) with nothing extra on screen |
| A control that ships to users, or a demo for someone without DevTools | An in-app panel (`TuningSlider`, e.g. `SoapFilmTuningPanel`) |
| Both | Keep the in-app panel and add dials that write the same SharedValues (black-hole-gpu does this) |

---

## Running it

```bash
bun run dials:build   # once, and after any change under plugins/rozenite-plugin-dialkit
bun run start:dials   # = WITH_ROZENITE=true expo start
```

Then open React Native DevTools (press `j` in Metro) and open the **Dials** tab.
The panel shows "Connecting…" until the app connects, then one DialKit panel per
mounted `useDials*` call.

- Plain `bun run start` and EAS builds don't load Rozenite (`metro.config.js`
  gates it on `WITH_ROZENITE=true`). Hooks then return config defaults.
- `dials:build` deletes and reinstalls `node_modules/rozenite-plugin-dialkit`
  because bun installs `file:` deps as a **copy**, not a symlink. If you rebuild
  without reinstalling, Metro serves the old panel.
- The JS bundle doesn't need a native rebuild. Any dev client on RN ≥ 0.76 works.

---

## Adding dials to a demo

### 1. Write the config

The format is the same as DialKit's (see the interface-craft skill, `dialkit.md`). Keys become
labels, and nested objects become folders.

```ts
const CARD_DIALS = {
  scale: [1, 0.5, 2, 0.01],                    // [default, min, max, step]
  offset: { type: "pad", x: [0, -100, 100, 1], y: [0, -100, 100, 1] },
  tint: "#7c5cff",
  enter: { type: "spring", visualDuration: 0.35, bounce: 0.2 },
  shadow: { _collapsed: true, radius: [16, 0, 48, 1] },
  replay: { type: "action", label: "Replay" },
} as const;
```

Define the config at module scope. It is re-registered only when its JSON changes,
but building it per render is wasted work.

### 2. Pick a hook

| Hook | Returns | Re-renders | Use for |
|---|---|---|---|
| `useDials(name, config, opts?)` | values | yes, each change | layout, colors, simple screens |
| `useDialsShared(name, config, opts?)` | `SharedValue<values>` | no | worklets / `useAnimatedStyle` / shader uniforms |
| `useDialsListener(name, config, onChange, opts?)` | – | no | binding into SharedValues the demo **already owns** |

All three come from `@/lib/dials`. Their values are typed `DialValues<typeof config>`
(DialKit's `ResolvedValues`).

```tsx
const dials = useDialsShared("Card", CARD_DIALS, {
  onAction: (path) => path === "replay" && replay(),
});

const style = useAnimatedStyle(() => ({
  transform: [
    { translateX: dials.value.offset.x },
    { translateY: -dials.value.offset.y },   // pad Y points up
    { scale: dials.value.scale },
  ],
}));
```

Existing SharedValues (the black-hole-gpu pattern):

```ts
useDialsListener("Black Hole Lens", LENS_DIALS, (v) => {
  speed.set(v.sim.speed);
  lens.einstein.set(v.gravity.einstein);
}, { id: "black-hole-gpu:lens" });
```

Use `.set()`, not `.value =`. The React Compiler lint (`react-hooks/immutability`)
flags `.value` writes on hook arguments.

### 3. Springs and easing → Reanimated

A spring dial can be switched to **Easing** mode in the editor, so its value is a
`TransitionConfig` union. Convert it at the animation call:

```ts
import { withDialCurve, toSpringConfig, toTimingConfig } from "@/lib/dials";

scale.value = withDialCurve(dials.value.enter, 1);   // worklet-safe
```

| DialKit | Reanimated |
|---|---|
| time spring `{ visualDuration, bounce }` (s) | `withSpring` `{ duration: visualDuration·1000, dampingRatio: 1 − bounce }` |
| physics `{ stiffness, damping, mass }` | `withSpring` with the same values |
| `{ type: "easing", duration, ease }` (s) | `withTiming` `{ duration: ·1000, easing: Easing.bezier(...ease) }` |

All of them set `ReduceMotion.System`. Never pass a DialKit easing config to `withSpring`.

### 4. Options

- `id`: the stable key, which defaults to `name`. Persistence (`localStorage
  dialkit:<id>` in the panel) and the app cache both key on it. Namespace it
  per demo, e.g. `"black-hole-gpu:lens"`.
- `onAction(path)`: action controls report their full dot path (`"presets.both"`).
- `setDialValues(id, partial)` pushes app-side edits (an in-app preset, for example)
  into the panel, so the panel and app don't drift.

### 5. Bake the tuned values in

1. In the panel, use **+** to save versions while you explore, then pick the winner.
2. Click **Copy**, which exports the current values.
3. Paste them into the demo's defaults (e.g. `LENS_DEFAULTS`) and keep ranges and
   steps in the config. Copy never edits source files.

---

## How it works

### Protocol (`plugins/rozenite-plugin-dialkit/src/protocol.ts`)

| Event | Direction | When |
|---|---|---|
| `register { id, name, config, revision }` | app → panel | hook mounts, config JSON changes, or panel sends `ready` |
| `unregister { id }` | app → panel | last hook using `id` unmounts |
| `values { id, values }` | panel → app | any control change, coalesced to one per animation frame |
| `action { id, path }` | panel → app | action control pressed |
| `setValues { id, values }` | app → panel | `setDialValues` |
| `ready { at }` | panel → app | panel mounts (DevTools opened or panel reloaded) |

`revision` increases on every `register`. The panel answers each new revision
with its current values, so an **app reload resumes at the tuned state**, not
at the code defaults.

### Lifecycles

- **DevTools closed:** the bridge client promise resolves only after DevTools opens.
  Until then the hooks return defaults, and they connect automatically later.
- **Panel reload:** DialKit restores values from `localStorage`, the panel sends
  `ready`, the app re-registers, and the panel pushes the restored values.
- **Screen unmount and remount:** `dialStore` keeps the last values per id, so the
  remount starts tuned before any message arrives.
- **Production:** every store entry point returns early when `!__DEV__`. The bridge is
  `require`d behind `const loadBridge = __DEV__ ? () => require(...) : null`, which Metro
  constant-folds out of release bundles. This is verified: a production `expo export`
  `.hbc` contains no `rozenite` strings.

### Files

```
plugins/rozenite-plugin-dialkit/   own package + own bun install (dist/, node_modules/ gitignored)
  rozenite.config.ts               panel "Dials" → src/panel.tsx
  src/panel.tsx                    DialRoot (inline, dark, productionEnabled) + DialBridge per id
  src/protocol.ts                  event map; app imports it type-only via "rozenite-plugin-dialkit/protocol"
src/lib/dials/
  dialStore.ts                     singleton bridge + registry (dev only)
  useDials.ts                      the three hooks
  dialDefaults.ts                  config → default values (mirrors DialKit resolution)
  transitions.ts                   toSpringConfig / toTimingConfig / withDialCurve
metro.config.js                    withRozenite(..., { enabled: WITH_ROZENITE, include: [plugin] })
```

Root `tsconfig.json` excludes `plugins/`, because the panel is DOM code with its own tsconfig.
Typecheck it with `cd plugins/rozenite-plugin-dialkit && bunx tsc --noEmit`.

---

## Gotchas

- **Only `__DEV__ ? a : b` strips a dev-only require.** A `require` after
  `if (!__DEV__) return;` stays in the release bundle (this happened here first). To
  check, run `bunx expo export --platform ios --output-dir /tmp/x` and then
  `strings /tmp/x/_expo/static/js/ios/*.hbc | grep -c rozenite`, which should print 0.
- **`productionEnabled` on `DialRoot` is required.** `rozenite build` builds the panel
  in production mode, and a framework `DialRoot` hides itself there.
- **The plugin id must equal the package name** (`rozenite-plugin-dialkit`). It is
  defined in `protocol.ts` and duplicated in `dialStore.ts`, because the app can't import
  runtime values from the plugin package.
- **Pad Y points up.** Negate it for screen-space translateY.
- **Durations are seconds in DialKit and milliseconds in Reanimated.** Use the helpers.
- **Values must be JSON.** The bridge serializes payloads, so don't put functions or
  class instances in configs.
- **One-way by default.** In-app slider edits don't show in the panel unless you call
  `setDialValues` (black-hole-gpu syncs presets only).
- **Web:** the bridge throws on web. The store catches it and stays at defaults.
- **Other worktrees:** run `bun run dials:build` there too, since `dist/` isn't committed.

## Checklist for a new dial set

- [ ] Config at module scope, `as const`, ranges taken from the demo's existing constants
- [ ] `id` namespaced `"<demo>:<group>"`
- [ ] `useDialsShared` / `useDialsListener` for anything read per frame
- [ ] `.set()` for SharedValue writes, and clamp in the worklet as before
- [ ] Spring dials animated through `withDialCurve`
- [ ] Bake the final values into the defaults via Copy
