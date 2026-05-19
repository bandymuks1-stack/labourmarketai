/**
 * Typed layout-block model — the foundation for re-orderable UI.
 *
 * A screen owns an ordered array of typed block descriptors. Rendering is
 * driven by that array, so blocks/cards/text/buttons/widgets can be reordered
 * later by changing the array (or calling the pure helpers below) without
 * rewriting components. Full drag-and-drop is intentionally NOT implemented
 * here — only the model and pure ordering helpers.
 */

export type LayoutBlockKind =
  | "hero"
  | "stat"
  | "card"
  | "list"
  | "panel"
  | "cta"
  | "note";

export type LayoutBlockSpan = "full" | "half" | "third";

export interface LayoutBlock {
  /** Stable id — used for reordering and React keys. */
  id: string;
  kind: LayoutBlockKind;
  /** Optional human title shown on the block frame. */
  title?: string;
  /** Lower renders first. */
  order: number;
  /** Grid footprint. */
  span?: LayoutBlockSpan;
  /**
   * Name of the canonical source this block reads (documentation only — the
   * block never copies or owns that data; see the constitution §4/§5).
   */
  source?: string;
}

export type LayoutRegion = LayoutBlock[];

/** Pure: stable sort by `order`, then `id`. Never mutates the input. */
export function orderBlocks(region: LayoutRegion): LayoutRegion {
  return [...region].sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id),
  );
}

/**
 * Pure: move `id` to the slot occupied by `beforeId` and renumber `order`
 * by tens. Returns a new region; the input is untouched. A future
 * drag-and-drop layer only needs to call this — no component changes.
 */
export function reorderBlocks(
  region: LayoutRegion,
  id: string,
  beforeId: string,
): LayoutRegion {
  if (id === beforeId) return orderBlocks(region);
  const ordered = orderBlocks(region);
  const moving = ordered.find((b) => b.id === id);
  if (!moving) return ordered;

  const without = ordered.filter((b) => b.id !== id);
  const targetIndex = without.findIndex((b) => b.id === beforeId);
  const insertAt = targetIndex === -1 ? without.length : targetIndex;

  const next = [
    ...without.slice(0, insertAt),
    moving,
    ...without.slice(insertAt),
  ];
  return next.map((b, i) => ({ ...b, order: (i + 1) * 10 }));
}
