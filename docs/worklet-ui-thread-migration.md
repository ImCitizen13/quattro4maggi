# Worklet Migration — moving the WebGPU render loop to the UI thread

How the gargantua scene's render loop was moved off the JS thread onto the
Reanimated UI runtime to lift a hard 60fps cap, while keeping the original
JS-thread loop as a live, switchable option.

All version facts below were verified against the **installed** packages (paths
cited), not against docs. Shipped across `d2aac8d`…`fd32c0d`.

- TypeGPU worklets: https://docs.swmansion.com/TypeGPU/integration/react-native/worklets/
- react-native-webgpu worklets: https://wcandillon.github.io/react-native-webgpu/docs/integrations/worklets

Related: the TypeGPU 0.12 API migration for the same scene is
`src/components/gargantua-type-gpu/TypeGpu_migration.md`; device perf
methodology is `docs/perf-testing-methodology.md`.

---

## 1. Requirement

**Problem.** The scene rendered at **60fps on a 120Hz device**. The FPS overlay
showed `ui` 120 / `gpu` 60 — two rows measuring two different clocks.

**Root cause — not scene cost.** React Native drives `requestAnimationFrame`
from its own `CADisplayLink`, created with no `preferredFrameRateRange`
(`node_modules/react-native/React/Base/RCTDisplayLink.m:32`), so iOS holds it at
60Hz. Reanimated runs a *separate* display link that does request the high
range — hence 120 on the `ui` row. RN's RAF is additionally not vsync-locked at
all: `JSTimers.requestAnimationFrame` is `createTimer(id, 1, …)`, a 1ms timer
(`node_modules/react-native/Libraries/Core/Timers/JSTimers.js:260`).

**Proof the scene could sustain 120.** During a screen recording — which forces
sustained high-rate composition — the `gpu` row rode along at 120, then fell
back to 60 when recording stopped. The bottleneck was the frame source, not the
GPU work.

**Requirements.**

1. Drive the loop from the UI runtime, where RAF *is* the 120Hz display link.
2. Keep the JS-thread RAF loop switchable at runtime for A/B comparison.
3. One shared scene code path — no forked renderers.

---

## 2. Methodology

**Audit the compiler output, don't trust assumptions.** The Worklets Babel
plugin in Bundle Mode extracts each worklet to
`node_modules/react-native-worklets/.worklets/<id>.js` as a factory whose
**parameters are exactly the captured-by-value set**. Reading those files after a
bundle is the authoritative answer to "what crosses the runtime boundary":

```
bunx expo export --platform ios --output-dir /tmp/x --clear
grep -l "sceneTs\|composeLayeredTs\|…" node_modules/react-native-worklets/.worklets/*.js
```

Two real bugs were caught this way before ever reaching a device (§5.1, §5.2).

**Convert in dependency order, verifying on the JS path at each step.** Every
change except the final switch is observable in `js-raf` mode, where behaviour
must stay identical. That narrows the suspects when `ui-worklet` misbehaves.

**Key insight that shrank the work.** Worklets serialize a closure **once**, at
transfer (confirmed by reading
`node_modules/@typegpu/react/react-native/use-frame.js`). So mutable closure
state is only a hazard when **written on one runtime and read on the other**.
State read and written solely inside `render` transfers once, then mutates on the
UI runtime and stays self-consistent:

| State | Written | Read | Verdict |
|---|---|---|---|
| Animation accumulators (`lastMs`, spring/tilt state) | render | render | safe as-is |
| Sprite `states[]` array | render | render | safe as-is |
| React refs | JS | render | **must convert** |
| `resW/resH`, `cw/ch`, `viewA/viewB` | **resize** | render | **must handle** |

**Second enabler.** A `'worklet'`-marked function is still an ordinary callable
JS function, so `js-raf` invokes the same renders directly. One code path serves
both modes.

---

## 3. Versions

| Package | Installed | Expo SDK 55 pin | Note |
|---|---|---|---|
| `react-native` | 0.83.6 | 0.83.6 | unchanged — **no SDK upgrade needed** |
| `react-native-worklets` | **0.10.1** | 0.7.4 | off-matrix, ABI-compatible |
| `react-native-reanimated` | **4.5.1** | 4.2.1 | wants worklets `0.10.x`, RN `0.83–0.86` |
| `typegpu` | 0.12.4 | — | |
| `@typegpu/react` | 0.12.0 | — | imported for its serializer registration only |
| `react-native-webgpu` | 0.8.5 | — | |
| `expo` | 55.0.17 | — | |

**Why 0.10.1 specifically.** Three constraints intersect:

- `@typegpu/react` gates worklet support on five exports —
  `registerCustomSerializable`, `isWorkletFunction`, `runOnUISync`,
  `createShareable`, `UIRuntimeId`
  (`node_modules/@typegpu/react/react-native/worklets-integration.js`). **0.7.4
  lacks the last two**, and the gate fails *silently* — `useFrame` just falls
  back to JS-thread RAF with no warning.
- **0.12.1 breaks the iOS build.** It renamed the C++ `WorkletRuntime::executeSync`
  to `runSync`, and `expo-modules-core` still calls `executeSync`
  (`node_modules/expo-modules-core/ios/Worklets/WorkletJSCallInvoker.cpp:28`).
  Compile fails outright.
- **0.10.1 has both** — the five exports *and* `executeSync`. It is also exactly
  what Expo SDK 57 pins, so upgrading the SDK later returns this to on-matrix.

Verify the gate after any bump:

```
cd node_modules/react-native-worklets
for n in registerCustomSerializable isWorkletFunction runOnUISync createShareable UIRuntimeId; do
  grep -rlw "$n" lib src >/dev/null && echo "ok $n" || echo "MISSING $n"
done
grep -w executeSync Common/cpp/worklets/WorkletRuntime/WorkletRuntime.h
```

---

## 4. Steps

Ordered so a failure is attributable. **Verify in `js-raf` after each — behaviour
must be identical throughout.**

| # | Step | Files |
|---|---|---|
| 0 | Per-loop FPS sampling, so the two clocks are visible side by side | `components/common/frameSampler.ts`, `FpsOverlay.tsx` |
| 1 | Bump deps; confirm the gate opens *before* rebuilding | `package.json` |
| 2 | Babel: worklets plugin with `bundleMode` + `importForwarding` | `babel.config.js` |
| 3 | Metro: Bundle Mode resolver | `metro.config.js` |
| 4 | `useWebGPU` options object + `RenderMode` switch | `hooks/useWebGPU.tsx` |
| 5 | React refs → SharedValues | `index.tsx`, `scene.ts`, `movingBubbleScene.ts` |
| 6 | `'worklet'` on all five render functions | all four scene files |
| 7 | Resize-rebuild path for `ui-worklet` | `hooks/useWebGPU.tsx` |
| 8 | Gate perf marks + sampler to `js-raf`; add the toggle | `index.tsx` |
| 9 | **Only now** switch modes and debug | — |

**Architecture.** Setup stays async **on the JS thread in both modes** — it
awaits, and pipelines built there can still call
`navigator.gpu.getPreferredCanvasFormat()`, which is unavailable on worklet
runtimes. Only the frame driver branches: `js-raf` keeps the RAF loop;
`ui-worklet` uses `createShareable` + `runOnUISync` to run the loop on the UI
runtime, mirroring `@typegpu/react`'s own implementation. `mode` sits in the
effect deps, so switching tears down and rebuilds.

**Not used: `@typegpu/react`'s `useFrame`.** It is hook-level, but the render
function only exists after async setup completes inside an effect. Its transfer
pattern is reused directly instead.

---

## 5. Issues to look for

### 5.1 Namespace imports are captured by value, not forwarded

**Symptom.** A worklet factory takes `d` (or `std`, `tgpu`) as a parameter.
Fails at runtime — TypeGPU schemas do not survive serialization.

**Cause.** The plugin's `isImport` accepts `ImportSpecifier` and
`ImportDefaultSpecifier` but **not `ImportNamespaceSpecifier`**
(`node_modules/react-native-worklets/plugin/index.js:625`). So
`import * as d from "typegpu/data"` is never forwarded, regardless of
`importForwarding` config. Note `canForwardModuleImport` *does* prefix-match
(`typegpu/data` matches `moduleNames: ['typegpu']`) — the namespace form is the
only blocker.

### 5.2 Plain functions captured through object graphs

**Symptom.** Serialization error naming a function, or
`"Cannot transfer 'X': its 'y' is a plain function."`

**Cause.** Capturing an object that merely *contains* non-worklet functions.
`composeLayered` captured `initialized` (carrying `cleanup`/`resize`) and
`layers` (carrying scene factories), though the render loop only needed
`render` and a boolean.

### 5.3 The Worklets gate fails silently

**Symptom.** Everything builds, `ui-worklet` runs, but the frame rate is still
60. No error.

**Cause.** `getWorkletsModule()` returns `null` if any of the five exports is
missing, and the loop quietly falls back to JS-thread RAF.

### 5.4 TypeGPU serializers are never registered

**Symptom.** `[Worklets] Cannot copy value of type 'TgpuBufferImpl'` at transfer,
followed by `GPU Device Lost (Destroyed)` (that second one is just cleanup after
the failed init, not a separate fault).

**Cause.** TypeGPU resources cross runtimes via a custom serializer registered as
a **module side effect** of `@typegpu/react`'s React Native entry
(`registerTypegpuReactSerializables`). Driving the loop directly from
`useWebGPU` means nothing imports that package, so it never ran.

### 5.5 Resize-written state goes stale after transfer

**Symptom.** Correct on first render; garbage or a crash after a layout change
or rotation. Drawing into destroyed textures.

**Cause.** The closure was serialized once. Anything resize reassigns on the JS
side — the composer's ping-pong `texA/texB/viewA/viewB`, the scenes' cached
dimensions — is invisible to the already-transferred copy.

### 5.6 Forwarded module objects are duplicated, not shared

**Symptom.** `Missing bind groups for layouts: '<name>'` every frame, even though
a bind group is clearly being passed. **See the footnote — this is open.**

**Cause.** Import forwarding *re-imports* a module on the UI runtime, creating a
**new instance** of everything it exports. A pipeline transferred from the JS
thread references the *original* layout; a bind group built on the UI thread from
the *re-imported* layout is a different identity, so the pipeline rejects it.

### 5.7 Host-only singletons in the render path

**Symptom.** Missing or nonsense instrumentation; possible throw.

**Cause.** `perf` and `frameSampler` are JS-runtime singletons holding closures
and a `Set`. Neither can be ticked from a worklet.

### 5.8 Stale Metro cache after worklet regeneration

**Symptom.** `Unable to resolve module react-native-worklets/.worklets/<id>.js`,
or *"file is not watched / may have been deleted"*.

**Cause.** Generated worklet filenames are content hashes. Editing a worklet
changes them, and Metro's cache still points at the old ones.

---

## 6. Solutions

| Issue | Solution |
|---|---|
| **5.1** Namespace capture | Import the specific symbols by name alongside the namespace (`import { vec2f } from "typegpu/data"`) and use the bare binding *inside worklets only*. `d.*` stays fine everywhere else — shader definitions, type positions, setup. |
| **5.2** Plain functions | Flatten to exactly what the loop needs *before* building the closure: a `renders: LayerRender[]` array and a `readsBackdropFlags: boolean[]` array, rather than capturing the object graphs. |
| **5.3** Silent gate | Grep `node_modules` for all five exports after any bump (command in §3). Do not rely on runtime behaviour to tell you. |
| **5.4** Missing serializers | Add a side-effect import: `import "@typegpu/react"`. None of its hooks are needed; the `react-native` export condition resolves to the entry that registers. Idempotent, and no-ops without worklets. |
| **5.5** Stale resize state | In `ui-worklet` mode, resize **rebuilds** the scene rather than mutating in place, re-serializing the closure with fresh resources. Resize is rare (nav bar settling, rotation), and `skDataCache` means assets are re-uploaded but not re-fetched. `js-raf` keeps in-place resize. |
| **5.6** Duplicated layouts | **Open — see footnote.** |
| **5.7** Host singletons | Gate both to `js-raf`. In `ui-worklet` the overlay's `ui` row already measures this loop, so the `gpu` row is dropped as redundant rather than reported wrong. |
| **5.8** Metro cache | Re-run the bundle; the second pass always succeeds. Use `--clear` after touching `babel.config.js` or `metro.config.js`. |

**Diagnostic tip.** Once §5.4 is fixed, TypeGPU's serializer throws *descriptive*
errors (`register-serializables.js`) — it names the unsupported resource type, or
the exact field that is a plain function. Errors after that point are far easier
to read than `Cannot copy value of type …`.

---

## Footnote — open issue: duplicated bind group layouts (§5.6)

**Status: unresolved at time of writing.** Everything else works; the scene runs
on the UI thread and draws. Only the centre-bubble layer fails, once per frame:

> `Missing bind groups for layouts: 'centerBubbleBindGroupLayout'. Please provide it using pipeline.with(bindGroup)`

**Why only this layer.** Two different mechanisms move things across:
*transfer* (carried over, shared identity) and *import forwarding* (re-imported,
**new** identity). `centerBubbleBindGroupLayout` is imported from `./layouts`,
inside the `importForwarding` path, so the UI runtime builds its own copy. The
pipeline was built on the JS thread against the original and then transferred —
so the two no longer match.

The capture audit makes the pattern exact:

| Layer | Captured | Bind group built where |
|---|---|---|
| starfield | `…, pipeline, bindGroup` | setup — transferred together ✅ |
| bubbles | `…, items, pipeline` | setup, inside `items` ✅ |
| composer blit | `…, blitLayout, blitPipeline` | per-frame, but `blitLayout` is declared **in the same file** — a local const, not an import, so it is captured ✅ |
| **centre bubble** | `root, paramsBuffer, sampler, pipeline` — no bind group | **per-frame, from an imported layout** ❌ |

Centre bubble is the only layer combining *per-frame construction* with an
*imported* layout. Its per-frame construction is legitimate: the backdrop
alternates between the two ping-pong textures each frame.

**Three solutions, best to quickest:**

1. **Pre-build two bind groups at setup**, one per ping-pong view, and select
   between them each frame. The backdrop only ever has two possible values, so
   this matches reality, removes a per-frame allocation, and puts the layer on
   the same footing as every other one. Better code on either thread.
2. **Move `layouts.ts` outside the forwarded folder.** Layouts do not need
   forwarding — only shader definitions do — so it would transfer like
   everything else. Wider blast radius, since other scenes import from it.
3. **Alias the layout to a local const** before the render closure, so it is
   captured rather than forwarded — the same accident that makes `blitLayout`
   work. One line, but it depends on a subtlety rather than stating intent, and
   is easy to undo by accident later.

Recommended: **1**.

**Generalize before flipping this on for good:** this class of bug appears
anywhere a TypeGPU object is constructed *per-frame* from a *forwarded import*.
Audit for other per-frame `createBindGroup` / `createBuffer` calls that reference
imported layouts or schemas.
