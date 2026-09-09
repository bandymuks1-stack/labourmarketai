import { deriveReviewResult, type ConfirmationRow } from "@/lib/journal/review-status";

/**
 * A person's OWN fresh confirmations — pure derivation (owner contract §14:
 * WORK → EVIDENCE → EMPLOYER CONFIRMATION → VERIFIED CAPABILITY → LIVING
 * IDENTITY, read back on the PERSON's side).
 *
 * "Fresh" is a trailing window over the canonical evidence rows
 * (`journal_entry_confirmations`) — the SAME rows the journal list and the
 * professional card already derive from. There is no parallel "seen" or
 * notification table: the line is a fact about the person's own rows for as
 * long as the window says so, and disappears when it no longer holds.
 */

/** Trailing window — the same horizon the weekly intelligence uses. */
export const OWN_RECENT_CONFIRMATIONS_DAYS = 7;
/** Bounded read: the newest rows inside the window, never a person's history. */
export const OWN_RECENT_CONFIRMATIONS_LIMIT = 20;

export interface OwnConfirmationRow extends ConfirmationRow {
  readonly entry_id: string | null;
}

export interface OwnRecentConfirmations {
  /** Distinct own entries whose latest fresh evidence row is an approval. */
  readonly approvedEntries: number;
  /** Distinct skills the fresh approvals name (`confirmation_scope.skills_confirmed`). */
  readonly skillsConfirmed: number;
  /** ISO timestamp of the newest fresh row, or null when there is none. */
  readonly latestAt: string | null;
}

export function windowStartIso(now: Date, days: number = OWN_RECENT_CONFIRMATIONS_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function skillIdsOf(scope: unknown): string[] {
  const s = scope as { skills_confirmed?: unknown } | null;
  if (!s || !Array.isArray(s.skills_confirmed)) return [];
  return s.skills_confirmed.filter((v): v is string => typeof v === "string" && v.length > 0);
}

export function deriveOwnRecentConfirmations(
  rows: readonly OwnConfirmationRow[] | null | undefined,
): OwnRecentConfirmations {
  if (!rows || rows.length === 0) return { approvedEntries: 0, skillsConfirmed: 0, latestAt: null };
  const byEntry = new Map<string, OwnConfirmationRow[]>();
  for (const r of rows) {
    if (!r.entry_id) continue;
    const list = byEntry.get(r.entry_id) ?? [];
    list.push(r);
    byEntry.set(r.entry_id, list);
  }
  let approvedEntries = 0;
  const skills = new Set<string>();
  for (const list of byEntry.values()) {
    // Latest-wins, exactly as the journal list derives a review result — a
    // rejection after an approval is not "confirmed work".
    if (deriveReviewResult(list) !== "approved") continue;
    approvedEntries += 1;
    for (const r of list) {
      if (deriveReviewResult([r]) !== "approved") continue;
      for (const id of skillIdsOf(r.confirmation_scope)) skills.add(id);
    }
  }
  let latestAt: string | null = null;
  for (const r of rows) {
    if (!r.created_at) continue;
    if (latestAt === null || Date.parse(r.created_at) > Date.parse(latestAt)) latestAt = r.created_at;
  }
  return { approvedEntries, skillsConfirmed: skills.size, latestAt };
}
