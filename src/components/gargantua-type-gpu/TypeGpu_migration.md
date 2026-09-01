# TypeGPU Migration Notes — moving-bubble scene

Working reference for migrating `movingBubbleScene.ts` from the old
`root["~unstable"]` builder + `beginRenderPass(callback)` style to the flat
`root.createRenderPipeline` API. All facts below were verified against the
**installed `typegpu@0.12.4`** typedefs (paths cited) and the official docs.

- Docs: https://docs.swmansion.com/TypeGPU/fundamentals/pipelines/
- Migration guide: https://docs.swmansion.com/TypeGPU/migrations/0-12/

---

## 1. Schema vs value types

Two different things, easy to confuse:

| Use | Type |
| --- | --- |
| Schema / constructor (layouts, IO decls, `d.vec2f(x, y)`) | `d.vec2f`, `d.vec4f` |
| Value / instance (what a vec *is* inside a shader body) | `d.v2f`, `d.v4f` |

Both exported from `typegpu/data` (`data/wgslTypes.d.ts:146`).

Builtins are **schema values**, not types. The *type* aliases are
`BuiltinVertexIndex` / `BuiltinPosition` (`builtin.d.ts:2`), but their inferred
JS value types are simply:

- `vertexIndex` builtin → `number`
- `position` builtin → `d.v4f`

`AutoVertexIn` / `AutoFragmentIn` exist but are **internal only** (not
re-exported from any public entry) — do **not** import them for annotations.

---

## 2. Pipeline creation — old vs new (both valid in 0.12.4)

`root.createRenderPipeline` IS available in 0.12.4 — it lives on `WithBinding`,
which `TgpuRoot` extends (`core/root/rootTypes.d.ts:134`, `:287`). No `~unstable`.

### Old builder (current code)

```ts
const pipeline = root["~unstable"]
  .withVertex(bubbleVertexFn, {})
  .withFragment(bubbleFragmentFn, {
    format: presentationFormat,
    blend: {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
    },
  })
  .withPrimitive({ topology: "triangle-list" })
  .createPipeline();
```

### New flat API

`format` + `blend` move into **`targets`**. Because the fragment returns a bare
`d.vec4f` (single target), `targets` is a single `TgpuColorTargetState`
(`core/pipeline/renderPipeline.d.ts:52`) = `Omit<GPUColorTargetState,'format'> & { format? }`.

> **Blend is per-scene.** `bubbleScene` / `movingBubbleScene` composite
> transparent PNGs over the prior pass, so they keep the straight-alpha `blend`
> block. `centerBubbleScene` reconstructs its whole output from the sampled
> backdrop and **clears/overwrites** its target (see README "Center glass
> bubble"), so it has **no blend** — `targets: { format: presentationFormat }`
> only. Don't copy a blend block into a layer that clears.

```ts
const pipeline = root.createRenderPipeline({
  primitive: { topology: "triangle-list" },
  vertex: bubbleVertexFn,      // shell fn OR inline auto-IO fn
  fragment: bubbleFragmentFn,  // shell fn OR inline auto-IO fn
  targets: {
    format: presentationFormat,
    blend: {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
    },
  },
});
```

---

## 3. Entry functions — two supported forms

### A. Shell form (unchanged from current code)

Builtins declared in `in`/`out`; the impl uses **plain** names and needs **no**
annotations (the shell infers `number` / `d.v2f` etc.).

```ts
const bubbleVertexFn = tgpu["~unstable"].vertexFn({
  in:  { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f },
})(({ vertexIndex }) => { /* ...return { outPos, uv } */ });
```

### B. Inline auto-IO form (only with `createRenderPipeline`)

Builtins are identified by a **`$` prefix** on the key; varyings are plain keys
matched by name between stages. Define **inline** in the descriptor so contextual
typing supplies the parameter type (nothing to import/annotate).

```ts
vertex: ({ $vertexIndex }) => {         // $vertexIndex: number
  "use gpu";
  // ...
  return { $position: d.vec4f(...), uv: d.vec2f(...) };  // $position = builtin, uv = varying
},
fragment: ({ uv }) => {                 // uv: d.v2f
  "use gpu";
  // ...
  return d.vec4f(...);                  // bare vec4f = single color target
},
```

**Do NOT mix:** a standalone `"use gpu"` fn with plain builtin names (`vertexIndex`,
`outPos`) and no shell silently mislinks the stage. Either shell + plain names,
or inline + `$`-prefixed names.

---

## 4. Running the pipeline — the draw loop

The scene draws N sprites, each with its own **pre-built** bind group (created
once in `items[]`). Per frame we only `.write()` new bytes into each sprite's
`rect` / `params` uniform buffers; the bind groups already point at those
buffers, so no bind group is rebuilt. Then one draw call (6 verts = quad) per
sprite, all layered over the starfield (`loadOp: "load"`).

`pipeline.with(bindGroup)` **selects** an existing bind group (old
`pass.setBindGroup`). Single-arg form — no layout needed. The two-arg
`with(layout, bindGroup)` overload is `@deprecated`.

### Old (single pass, callback)

```ts
root["~unstable"].beginRenderPass(
  { colorAttachments: [{ view, loadOp, storeOp: "store", ...clear }] },
  (pass) => {
    pass.setPipeline(pipeline);
    for (const { bindGroup } of items) {
      pass.setBindGroup(movingBubbleBindGroupLayout, bindGroup);
      pass.draw(6);
    }
  },
);
```

### New — raw WebGPU, NO `~unstable` (chosen approach)

`pipeline.with()` accepts raw `GPURenderPassEncoder` / `GPUCommandEncoder` /
`GPURenderBundleEncoder` (`renderPipeline.d.ts:80-91`), and `root.device` is
public (`rootTypes.d.ts:296`). So drive it off `root.device`:

```ts
const encoder = root.device.createCommandEncoder();
const pass = encoder.beginRenderPass({
  colorAttachments: [                      // raw descriptor → ARRAY
    {
      view: attachment.view,
      loadOp: attachment.loadOp,
      storeOp: "store",
      ...(attachment.loadOp === "clear" ? { clearValue: [0, 0, 0, 0] as const } : {}),
    },
  ],
});

for (const { bindGroup } of items) {
  pipeline.with(pass).with(bindGroup).draw(6);
}

pass.end();
root.device.queue.submit([encoder.finish()]);   // raw submit, not encoder.submit()
```

Differences vs `~unstable`: `colorAttachments` is an **array** (raw
`GPURenderPassDescriptor`), and submit is `root.device.queue.submit([encoder.finish()])`.

---

## 5. TODO / keep-in-mind for later — render bundle optimization

The set of `items` is **fixed after setup** (resize doesn't add/remove sprites),
and per frame only buffer *contents* change. So the draw sequence can be
**recorded once** into a `GPURenderBundleEncoder` and replayed every frame,
cutting per-frame CPU encoding cost for N sprites.

```ts
// once, in the factory (NOT per frame):
const bundleEncoder = root.device.createRenderBundleEncoder({
  colorFormats: [presentationFormat],   // must match pipeline target
});
for (const { bindGroup } of items) {
  pipeline.with(bundleEncoder).with(bindGroup).draw(6);
}
const bundle = bundleEncoder.finish();
```

```ts
// per frame, after the uniform writes:
const encoder = root.device.createCommandEncoder();
const pass = encoder.beginRenderPass({
  colorAttachments: [{ view: attachment.view, loadOp: attachment.loadOp, storeOp: "store",
    ...(attachment.loadOp === "clear" ? { clearValue: [0, 0, 0, 0] as const } : {}) }],
});
pass.executeBundles([bundle]);
pass.end();
root.device.queue.submit([encoder.finish()]);
```

Caveat: re-record the bundle if the set of `items` ever changes. Bind groups
read their buffers at execute time, so per-frame `.write()`s still take effect
without re-recording.

---

## 6. Decision log

- **Pipeline:** move to flat `root.createRenderPipeline({ ..., targets })`.
- **Encoders:** use raw `root.device.*` — avoid `~unstable` entirely.
- **Draw:** single shared pass (faithful to old behavior), not per-draw
  `withColorAttachment` (that would be N passes + per-draw `loadOp` gotchas).
- **Sampler:** `root.createSampler(...)` — no `~unstable`.
- **Entry fns:** migrated to standalone `"use gpu"` auto-IO functions with
  hand-annotated params (`{ $vertexIndex: number }`, `{ uv: d.v2f }`) — the
  auto-IO input type isn't publicly exported, so annotate rather than import.
- **Later:** switch the shared pass to a record-once render bundle for CPU
  savings (only for scenes whose bind groups are stable per frame — i.e.
  `bubbleScene`; **not** `centerBubbleScene`, whose bind group ping-pongs the
  backdrop each frame).

## 7. Migration status

| File | Pipeline | Shaders | Sampler | Draw | Blend |
| --- | --- | --- | --- | --- | --- |
| `bubbleScene.ts` | ✅ flat | ✅ auto-IO | ✅ | ✅ raw pass | straight-alpha |
| `movingBubbleScene.ts` | ✅ flat | ✅ auto-IO | ✅ | ✅ raw pass | straight-alpha |
| `centerBubbleScene.ts` | ✅ flat | ✅ auto-IO | ✅ | ✅ raw pass | **none** (clears) |

All three typecheck clean under `strict`. Remaining repo tsc errors are in
unrelated demos and are pre-existing.
