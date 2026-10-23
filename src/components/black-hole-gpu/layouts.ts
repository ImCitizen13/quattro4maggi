import tgpu from "typegpu";
import * as d from "typegpu/data";
import { LensTune, Params, Particle } from "./gpuTypes";

// ============================================================================
// Bind group layouts
// ============================================================================
//
// Two layouts because a vertex stage may not bind read_write storage: compute
// writes the particles, render only reads them. Both sit at group 0.

/** Compute (`init`, `step`): uniform + read_write particles. */
export const computeLayout = tgpu
  .bindGroupLayout({
    u: { uniform: Params },
    ps: { storage: (n: number) => d.arrayOf(Particle, n), access: "mutable" },
  })
  .$name("computeLayout");

/** Render (tiles): uniform + read-only particles + the view snapshot. */
export const renderLayout = tgpu
  .bindGroupLayout({
    u: { uniform: Params },
    ps: { storage: (n: number) => d.arrayOf(Particle, n), access: "readonly" },
    snap: { texture: d.texture2d(d.f32) },
  })
  .$name("renderLayout");

/** Lens: Params uniform + LensTune uniform + the composer's backdrop + a linear sampler. */
export const lensLayout = tgpu
  .bindGroupLayout({
    u: { uniform: Params },
    t: { uniform: LensTune },
    backdrop: { texture: d.texture2d(d.f32) },
    samp: { sampler: "filtering" },
  })
  .$name("lensLayout");
