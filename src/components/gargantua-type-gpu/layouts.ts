import tgpu from "typegpu";
import * as d from "typegpu/data";
import { UniformsStruct } from "./gpuTypes";

export const starfieldBindGroupLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: UniformsStruct },
});

/**
 * Bind group layout for the textured-quad sprite pipeline.
 *
 * - `rect` — `vec4f` uniform `(x, y, w, h)` describing the sprite's NDC rect.
 * - `samp` — filtering sampler shared across all sprites.
 * - `tex`  — 2D float-sampled texture holding the sprite image.
 */
export const bubbleBindGroupLayout = tgpu.bindGroupLayout({
  rect: { uniform: d.vec4f },
  samp: { sampler: "filtering" },
  tex: { texture: d.texture2d(d.f32) },
});

/**
 * Bind group layout for the center-bubble (BShader port) pipeline. The
 * bubble is always centered on screen; style + prism colors are baked into
 * the shader. Only the per-frame variables that change with resize live in
 * the uniform.
 *
 * - `params`   — `vec4f` `(canvasW_px, canvasH_px, radiusPx, halfSizePx)`.
 *                `halfSizePx` includes the shadow halo so the quad covers it.
 * - `samp`     — linear sampler for the backdrop.
 * - `backdrop` — view of the cumulative prior layers (passed by composer).
 */
export const centerBubbleBindGroupLayout = tgpu.bindGroupLayout({
  params: { uniform: d.vec4f },
  samp: { sampler: "filtering" },
  backdrop: { texture: d.texture2d(d.f32) },
});

/**
 * Bind group layout for the moving-bubble pipeline. Adds a `params` uniform
 * carrying per-frame, per-sprite scalars the fragment stage needs.
 *
 * - `rect`   — `vec4f` `(x, y, w, h)` NDC rect (same shape as static layout).
 * - `params` — `vec4f` packed extras: `.x = alpha`, `.yzw` reserved.
 * - `samp`   — filtering sampler shared across all sprites.
 * - `tex`    — 2D float-sampled sprite texture.
 */
export const movingBubbleBindGroupLayout = tgpu.bindGroupLayout({
  rect: { uniform: d.vec4f },
  params: { uniform: d.vec4f },
  samp: { sampler: "filtering" },
  tex: { texture: d.texture2d(d.f32) },
});
