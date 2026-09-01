import { SkData, Skia } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { Image } from "react-native";

import { perf } from "../perf/perfMarks";
import { imageArray } from "../../../../assets/Bubbles/128/images.generated";

/**
 * Resolve a React Native asset (number returned by `require(...)`) into Skia
 * `SkData` containing the raw, still-encoded image bytes (PNG/JPEG).
 *
 * Returns `null` instead of throwing so a single broken asset doesn't tear
 * down the whole batch load.
 *
 * @param asset - Numeric asset id from React Native's asset registry.
 * @returns Encoded image bytes wrapped in `SkData`, or `null` on failure.
 */
async function loadSkData(asset: number): Promise<SkData | null> {
  try {
    /** Asset-registry record carrying the resolved URI, dimensions, scale. */
    const resolved = Image.resolveAssetSource(asset);
    return perf.measureAsync("load-skdata", () => Skia.Data.fromURI(resolved.uri));
  } catch {
    return null;
  }
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
