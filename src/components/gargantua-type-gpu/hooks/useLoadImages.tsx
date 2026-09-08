import { SkData, Skia } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { Image } from "react-native";

import { perf } from "../perf/perfMarks";
import { imageArray } from "../../../../assets/Bubbles/128/images.generated";

/**
 * Module-level cache of in-flight and completed loads, keyed by asset id.
 *
 * `Skia.Data.fromURI` reads through `Image.resolveAssetSource`, which returns
 * a Metro HTTP URL in development and a local file path in release. Either way
 * the bytes are immutable for the life of the bundle, so there is no reason to
 * fetch them more than once per app session — without this, every navigation
 * back onto the screen re-paid the full batch (~740ms on an iOS device, ~3.1s
 * on the Android emulator, both dominated by dev-server round-trips).
 *
 * Promises are cached, not just results, so two mounts racing the same asset
 * share one fetch instead of issuing two.
 */
const skDataCache = new Map<number, Promise<SkData | null>>();

/**
 * Resolve a React Native asset (number returned by `require(...)`) into Skia
 * `SkData` containing the raw, still-encoded image bytes (PNG/JPEG).
 *
 * Returns `null` instead of throwing so a single broken asset doesn't tear
 * down the whole batch load. A failed load is evicted from the cache so a
 * later mount can retry it.
 *
 * @param asset - Numeric asset id from React Native's asset registry.
 * @returns Encoded image bytes wrapped in `SkData`, or `null` on failure.
 */
function loadSkData(asset: number): Promise<SkData | null> {
  const cached = skDataCache.get(asset);
  if (cached) return cached;

  const pending = (async () => {
    try {
      /** Asset-registry record carrying the resolved URI, dimensions, scale. */
      const resolved = Image.resolveAssetSource(asset);
      return await perf.measureAsync("load-skdata", () =>
        Skia.Data.fromURI(resolved.uri),
      );
    } catch {
      skDataCache.delete(asset);
      return null;
    }
  })();

  skDataCache.set(asset, pending);
  return pending;
}

/**
 * React hook that loads every asset in `imageArray` once and exposes the
 * resulting array of Skia `SkData` (encoded bytes — not yet decoded).
 *
 * GPU upload is intentionally NOT done here. Doing it here would tie the
 * resulting `GPUTexture`s to whichever `GPUDevice` was current when the hook
 * ran; binding them later against a different device instance fails with
 * "is associated with [Device], and cannot be used with [Device]". Instead,
 * the consumer hands these `SkData` values to the scene factory, which
 * decodes + uploads using the same device it draws with.
 *
 * Loads run in parallel via `Promise.all`. A `cancelled` flag guards against
 * setting state after unmount.
 *
 * @returns `{ datas, loading }` — `datas` is `null` until the batch
 *   completes, then a non-null array of successfully loaded `SkData`.
 */
export function useLoadImages() {
  /** Encoded image bytes (null while pending). */
  const [datas, setDatas] = useState<SkData[] | null>(null);
  /** True while the batch load is in flight. */
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /** Set on unmount so async work doesn't update stale state. */
    let cancelled = false;

    (async () => {
      // `perf` is a module-level singleton with no automatic reset, so without
      // this every counter accumulates across navigations and `n` reads as
      // (visits × assets) rather than a startup number. Reset per mount so the
      // dump below describes this visit only.
      perf.reset();
      const results = await Promise.all(imageArray.map((asset) => loadSkData(asset)));
      if (cancelled) return;
      const filtered = results.filter((d): d is SkData => d !== null);
      setDatas(filtered);
      setLoading(false);
      perf.log();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { datas, loading };
}
