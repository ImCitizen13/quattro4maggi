/**
 * particleBuffers
 *
 * Allocation + a per-runtime registry for the pipeline's two Float32Arrays.
 *
 * WHY A REGISTRY (not a SharedValue)
 *   Buffers allocated on the JS thread and handed to the UI runtime through a
 *   SharedValue arrive as serialized copies: the driver's writes never reached
 *   the renderer (seen in the app: sprites stayed at their init values).
 *   So buffers are allocated *inside* the runtime that uses them and stored on
 *   that runtime's `globalThis`. Every worklet on the runtime looks them up by
 *   key and gets the same object. Nothing crosses a runtime boundary.
 *
 * FLOW
 *   driver (frame 1) → ensureParticleBuffers(key, …) → allocate + source.init
 *   driver (frame n) → ensureParticleBuffers → existing buffers → source.step
 *   renderer         → getParticleBuffers(key) → read `out`
 *
 * One slot per key, sized for `capacity` particles and initialized once, so
 * changing the active count never reseeds existing particles. Only a new
 * canvas size reallocates (replacing the old slot, so memory stays bounded).
 */

import { OUT_STRIDE } from "./constants";
import type { Bounds, ParticleBuffers, PhysicsSource } from "./types";

// ============================================================================
// Types
// ============================================================================

type BufferRegistry = Record<string, ParticleBuffers & Bounds>;

type RegistryGlobal = typeof globalThis & {
  __particleBuffers?: BufferRegistry;
};

// ============================================================================
// Allocation
// ============================================================================

/** Allocates both buffers once and lets the source seed them. */
export function createParticleBuffers(
  source: PhysicsSource,
  capacity: number,
  bounds: Bounds
): ParticleBuffers {
  "worklet";
  const state = new Float32Array(capacity * source.stateStride);
  const out = new Float32Array(capacity * OUT_STRIDE);
  source.init(state, out, capacity, bounds);
  return { capacity, state, out };
}

// ============================================================================
// Registry (per runtime)
// ============================================================================

/** Buffers for `key` on the calling runtime, allocating if missing or stale. */
export function ensureParticleBuffers(
  key: string,
  source: PhysicsSource,
  capacity: number,
  width: number,
  height: number
): ParticleBuffers {
  "worklet";
  const g = globalThis as RegistryGlobal;
  const registry = (g.__particleBuffers ??= {});
  const existing = registry[key];
  if (
    existing &&
    existing.capacity === capacity &&
    existing.width === width &&
    existing.height === height
  ) {
    return existing;
  }
  const buffers = createParticleBuffers(source, capacity, { width, height });
  registry[key] = { ...buffers, width, height };
  return registry[key];
}

/** Buffers for `key` on the calling runtime, or undefined before allocation. */
export function getParticleBuffers(key: string): ParticleBuffers | undefined {
  "worklet";
  return (globalThis as RegistryGlobal).__particleBuffers?.[key];
}
