/**
 * ONE PIN STATE ON THE HOME (pin to home, owner P0 No. 1, 2026-11-12).
 *
 * The home shows a person's shortcuts in two places: the pinned row above the
 * conversation, and the pin toggle in the corner of a function card (the slot
 * of the shared `CardRail`). They are separate client islands, so they share
 * state through this module — never through a second store, and never
 * through a second writer.
 *
 * THE ROW IS THE ONE WRITER. It owns the list, calls the three pin actions
 * (`lib/workspace/pins-actions.ts`, rows in `workspace_pins`) and publishes
 * what is pinned here. A card only ASKS the row to toggle a reference and
 * draws what the row published. With no row on the screen (the pin store
 * cannot be read) nothing is published, so no card offers a toggle.
 *
 * Browser-only state of one open page; nothing here is stored or sent.
 */

export type PinSyncState = {
  /** False until the row has mounted with a readable pin store. */
  readonly available: boolean;
  readonly refs: readonly string[];
};

export type PinToggleRequest = { readonly ref: string; readonly label: string };
/** `message` is what to tell the person when the change did not happen. */
export type PinToggleResult = { readonly ok: boolean; readonly message?: string };
export type PinToggleHandler = (request: PinToggleRequest) => Promise<PinToggleResult>;

const UNAVAILABLE: PinSyncState = { available: false, refs: [] };

let state: PinSyncState = UNAVAILABLE;
let handler: PinToggleHandler | null = null;
const listeners = new Set<() => void>();

const sameRefs = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((ref, i) => ref === b[i]);

/** The row publishes what is pinned (or `null` when it cannot be edited). */
export function publishPinned(refs: readonly string[] | null): void {
  const next: PinSyncState = refs ? { available: true, refs: [...refs] } : UNAVAILABLE;
  if (next.available === state.available && sameRefs(next.refs, state.refs)) return;
  state = next;
  for (const listener of listeners) listener();
}

export function subscribePinned(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const readPinned = (): PinSyncState => state;
/** The server draws no toggle: the pins are the row's to announce. */
export const readPinnedOnServer = (): PinSyncState => UNAVAILABLE;

/** The row registers itself as the writer; returns its own removal. */
export function setPinToggleHandler(next: PinToggleHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** A card asks the row to pin or unpin. Refused when there is no row. */
export function requestPinToggle(request: PinToggleRequest): Promise<PinToggleResult> {
  return handler ? handler(request) : Promise.resolve({ ok: false });
}
