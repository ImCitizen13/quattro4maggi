/**
 * useSharedDevice — one GPUDevice for the whole process.
 *
 * `useDevice()` from react-native-webgpu requests a NEW adapter + device per
 * call, and GPU resources cannot cross devices: a snapshot texture captured on
 * one device can't be bound by a scene on another. Every consumer that must
 * share resources (snapshot + scene, many VortexSnapshot wrappers) calls this
 * instead.
 *
 * FLOW:
 * 1. First call starts requestAdapter → requestDevice, cached as one promise
 * 2. Later calls (any component) await the same promise
 * 3. `device.lost` clears the cache, so the next mount requests a fresh device
 *
 * KEY FEATURES:
 * - Module-level cache: no provider needed in the tree
 * - Returns null until the device is ready (same shape as `useDevice().device`)
 */

import { useEffect, useState } from "react";

// ============================================================================
// Cache
// ============================================================================

let pending: Promise<GPUDevice> | null = null;

const requestSharedDevice = (): Promise<GPUDevice> => {
  pending ??= (async () => {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No appropriate GPUAdapter found.");
    const device = await adapter.requestDevice();
    device.lost.then(() => {
      pending = null;
    });
    return device;
  })().catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
};

// ============================================================================
// Hook
// ============================================================================

/** The process-wide GPUDevice, or null until it is ready. */
export const useSharedDevice = (): GPUDevice | null => {
  const [device, setDevice] = useState<GPUDevice | null>(null);
  useEffect(() => {
    let alive = true;
    requestSharedDevice().then((d) => {
      if (alive) setDevice(d);
    });
    return () => {
      alive = false;
    };
  }, []);
  return device;
};
