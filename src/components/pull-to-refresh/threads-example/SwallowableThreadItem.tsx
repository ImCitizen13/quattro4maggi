/**
 * SwallowableThreadItem — a Threads post row that can be deleted into the GPU
 * black hole (`VortexSnapshot`).
 *
 * FLOW:
 *   tap the post's overflow dots ─► handle.swallow() (hole opens at the tap)
 *     ─► every tile swallowed ─► onRemoved(id): the list drops the row and the
 *        rows below spring up (the FlatList's itemLayoutAnimation)
 *   a second tap while swallowing ─► same pending promise (no double run)
 *
 * KEY FEATURES:
 * - Lazy wrapper (no `prewarm`): idle rows hold no GPU memory; the texture +
 *   scene exist only while a row is being swallowed
 * - Transparent background: the row's own fill is captured, the canvas clears
 *   to transparent around the tiles
 * - Swallow cancelled (relayout, unmount) ─► the row simply stays
 */
import { useRef } from "react";
import {
  VortexSnapshot,
  type VortexSnapshotHandle,
} from "@/components/black-hole-gpu/VortexSnapshot";
import ThreadItemView, { type ThreadPost } from "./ThreadItemView";

// ============================================================================
// Types
// ============================================================================

export type SwallowableThreadItemProps = {
  /** Stable row id handed back to `onRemoved`. */
  id: number;
  post: ThreadPost;
  /** The swallow finished: remove the row from the list data. */
  onRemoved: (id: number) => void;
};

// ============================================================================
// Component
// ============================================================================

export default function SwallowableThreadItem({
  id,
  post,
  onRemoved,
}: SwallowableThreadItemProps) {
  const vortex = useRef<VortexSnapshotHandle>(null);

  const onDelete = () => {
    vortex.current
      ?.swallow()
      .then(() => onRemoved(id))
      // Cancelled (relayout / unmount) or could not start: keep the row.
      .catch(() => {});
  };

  return (
    <VortexSnapshot ref={vortex}>
      <ThreadItemView post={post} onDelete={onDelete} />
    </VortexSnapshot>
  );
}
