/**
 * WHICH CONFIRMATION COUNTS — the one rule for reading an entry's append-only
 * confirmation ledger into "Confirmed Work Proof".
 *
 * `journal_entry_confirmations` is never updated or deleted: a manager who
 * later rejects an entry, or asks for changes, appends a NEWER row. The
 * entry's standing is therefore the newest row per entry, whatever it says.
 *
 * THE DEFECT THIS REPLACES (found 2026-09-19). The verified CV walked the rows
 * newest-first and did `if (!isConfirm || seen) continue` — a newer rejection
 * was skipped as "not a confirm", the OLDER confirmation was then taken, and
 * the CV printed "Confirmed Work Proof" for work the manager had since
 * withdrawn. Retraction is the whole point of an append-only ledger; a reader
 * that cannot see it turns the ledger into a one-way ratchet.
 */

export type ConfirmationLedgerRow = {
  readonly entry_id: string;
  readonly created_at: string;
  readonly confirmation_scope: unknown;
};

export function isConfirmingScope(scope: unknown): boolean {
  const s = scope as { action?: unknown; decision?: unknown } | null;
  return (
    s?.action === "confirm" ||
    s?.action === "auto_confirm" ||
    s?.decision === "approved"
  );
}

/**
 * Newest row per entry; returned only when that newest row confirms.
 * Input order does not matter — rows are sorted here so a caller that forgot
 * `.order()` cannot resurrect a retracted confirmation.
 */
export function selectStandingConfirmations<T extends ConfirmationLedgerRow>(
  rows: readonly T[],
): T[] {
  const sorted = [...rows].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of sorted) {
    if (seen.has(row.entry_id)) continue;
    seen.add(row.entry_id);
    if (isConfirmingScope(row.confirmation_scope)) out.push(row);
  }
  return out;
}
