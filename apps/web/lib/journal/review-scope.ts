/**
 * WHICH ORGANIZATION'S REVIEW QUEUE A SURFACE SHOWS (decision 0024: one organization's
 * context never shows in another). Pure.
 *
 * `reviewable_journal_entry_ids()` returns every entry the caller may review in EVERY
 * organization where they review, with no organization filter (confirmed on production
 * 2026-11-08). That is not an access leak, since the reader may review both. It is a
 * context defect: an organization's screen counted and listed another organization's
 * hours under its own name.
 *
 * The rule, in one place:
 *  - an organization is active (the server-resolved workspace) → only its entries count
 *    and show. An entry whose organization cannot be read is not counted for it, because
 *    nothing is claimed for an organization that the row does not state;
 *  - no organization is active → every reviewable entry, each labelled by its
 *    organization, never one unlabelled pile.
 * Nothing is dropped: whatever a scope leaves out is counted as waiting elsewhere.
 */

export type ReviewScope = { readonly kind: "organization"; readonly organizationId: string } | { readonly kind: "all" };

export function reviewScopeOf(activeOrganizationId: string | null | undefined): ReviewScope {
  return activeOrganizationId ? { kind: "organization", organizationId: activeOrganizationId } : { kind: "all" };
}

/** The scope's count, from each reviewable entry's organization (null: unreadable). */
export function countInScope(organizationByEntry: ReadonlyMap<string, string | null>, scope: ReviewScope): number {
  if (scope.kind === "all") return organizationByEntry.size;
  let n = 0;
  for (const organizationId of organizationByEntry.values()) if (organizationId === scope.organizationId) n += 1;
  return n;
}

/** The rows a scope shows, and how many it leaves to other organizations. */
export function rowsInScope<R extends { readonly organizationId: string | null }>(
  rows: readonly R[],
  scope: ReviewScope,
): { readonly rows: readonly R[]; readonly elsewhere: number } {
  if (scope.kind === "all") return { rows, elsewhere: 0 };
  const own = rows.filter((row) => row.organizationId === scope.organizationId);
  return { rows: own, elsewhere: rows.length - own.length };
}

export type ReviewOrganizationGroup<R> = {
  /** Null: the rows' organization could not be read. */
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly rows: readonly R[];
};

/**
 * Every row, grouped by organization, in queue order (oldest first) within a group.
 * Groups come in the order their first row appears; the unreadable group comes last.
 */
export function groupByOrganization<
  R extends { readonly organizationId: string | null; readonly organizationName: string | null },
>(rows: readonly R[]): readonly ReviewOrganizationGroup<R>[] {
  const groups = new Map<string | null, R[]>();
  for (const row of rows) groups.set(row.organizationId, [...(groups.get(row.organizationId) ?? []), row]);
  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : 0) - (b === null ? 1 : 0))
    .map(([organizationId, own]) => ({
      organizationId,
      organizationName: own.find((row) => row.organizationName)?.organizationName ?? null,
      rows: own,
    }));
}
