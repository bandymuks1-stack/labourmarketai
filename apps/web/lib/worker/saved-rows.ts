/**
 * WHAT A PERSON JUST SAVED IS ON SCREEN WHILE THE PAGE CATCHES UP (2026-11-04).
 *
 * A profile section shows what the server rendered, and the profile page renders
 * as one piece, so a save's row appeared only when every read on the page had
 * finished: 6 to 30 s under load, with the form already closed and nothing else
 * on screen (P-9, run 41922748967). A person could only conclude it had failed.
 *
 * Only a save the server CONFIRMED enters here, as the row it returned, so a
 * failed save can never leave a row showing. The server's row wins as soon as it
 * says the same thing. PURE.
 */
export type LocalRows<T> = {
  readonly saved: readonly T[];
  readonly removed: readonly string[];
};

function saysTheSame<T extends { readonly id: string }>(server: T, saved: T): boolean {
  return (Object.keys(saved) as (keyof T)[]).every((k) => server[k] === saved[k]);
}

/** Newly saved rows first, an edit in its own place, a removed row gone. */
export function mergeSavedRows<T extends { readonly id: string }>(
  server: readonly T[],
  local: LocalRows<T>,
): T[] {
  const serverIds = new Set(server.map((r) => r.id));
  const editedById = new Map(local.saved.map((r) => [r.id, r]));
  return [
    ...local.saved.filter((r) => !serverIds.has(r.id)),
    ...server.map((r) => editedById.get(r.id) ?? r),
  ].filter((r) => !local.removed.includes(r.id));
}

/** Drops what the server has caught up with, so a later change made elsewhere
 *  is never hidden by an old local copy. Same object when nothing changed. */
export function pruneSavedRows<T extends { readonly id: string }>(
  server: readonly T[],
  local: LocalRows<T>,
): LocalRows<T> {
  const byId = new Map(server.map((r) => [r.id, r]));
  const saved = local.saved.filter((r) => {
    const s = byId.get(r.id);
    return !s || !saysTheSame(s, r);
  });
  const removed = local.removed.filter((id) => byId.has(id));
  return saved.length === local.saved.length && removed.length === local.removed.length
    ? local
    : { saved, removed };
}
