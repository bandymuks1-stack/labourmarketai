/**
 * SKL-9 — which practice entries an assessor can CITE (pure half).
 *
 * The recognition RPC (`record_competency_recognition_v1`) accepts only journal
 * entries that (a) belong to the subject and (b) carry a confirmation by
 * someone other than the subject. Until now the assessor form asked for those
 * entries as typed UUIDs, which nobody can know: RLS lets an institution read
 * only the entries of ITS OWN student engagement contexts, and no screen listed
 * them. The form therefore could not be used by a real assessor.
 *
 * This module turns three rows the institution already reads under its own
 * RLS (its student contexts, the entries in them, their confirmations) into a
 * per-learner list of citable entries. It applies exactly the RPC's two
 * conditions so the form never offers an entry the RPC would refuse, and it
 * reads nothing outside the institution's own contexts.
 *
 * It decides nothing about the recognition: an entry being listed is not a
 * recognition, a score or a qualification (SEP-3, SEP-6).
 */

import {
  deriveIndependentReviewResult,
  withoutCounterpartyRows,
} from "@/lib/journal/review-status";

export interface StudentContextRow {
  readonly id: string;
  readonly profile_id: string;
}

export interface EvidenceEntryRow {
  readonly id: string;
  readonly engagement_context_id: string;
  readonly entry_type_slug: string | null;
  readonly created_at: string;
  readonly original_text: string | null;
}

export interface EvidenceConfirmationRow {
  readonly entry_id: string;
  readonly confirmer_id: string;
  readonly created_at: string;
  /** jsonb `{ decision | action, authority? }` — the review verdict. */
  readonly confirmation_scope: unknown;
}

export interface EvidenceOption {
  readonly entryId: string;
  /** YYYY-MM-DD the entry was recorded. */
  readonly recordedOn: string;
  /** YYYY-MM-DD of the earliest confirmation by someone other than the learner. */
  readonly confirmedOn: string;
  readonly entryType: string;
  /** First words of what the learner wrote — enough to recognise the entry. */
  readonly excerpt: string;
}

/** Subject profile id → citable entries, newest first. */
export type EvidenceBySubject = Readonly<Record<string, readonly EvidenceOption[]>>;

/** The RPC refuses more than 50 cited entries. */
export const MAX_CITED_ENTRIES = 50;
const EXCERPT_LENGTH = 100;

export function excerptOf(text: string | null | undefined): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= EXCERPT_LENGTH) return flat;
  return `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

export function buildEvidenceBySubject(
  contexts: readonly StudentContextRow[],
  entries: readonly EvidenceEntryRow[],
  confirmations: readonly EvidenceConfirmationRow[],
): EvidenceBySubject {
  const subjectByContext = new Map<string, string>();
  for (const c of contexts) subjectByContext.set(c.id, c.profile_id);

  // An entry is citable only when its CURRENT review result, counting only
  // decisions by someone other than the subject (employer path), is `approved`.
  // A later rejection or change request withdraws it; a row that merely exists
  // is not a sign-off.
  const subjectByEntry = new Map<string, string>();
  for (const e of entries) {
    const subject = subjectByContext.get(e.engagement_context_id);
    if (subject) subjectByEntry.set(e.id, subject);
  }
  const rowsByEntry = new Map<string, EvidenceConfirmationRow[]>();
  for (const c of confirmations) {
    if (!subjectByEntry.has(c.entry_id)) continue;
    const list = rowsByEntry.get(c.entry_id) ?? [];
    list.push(c);
    rowsByEntry.set(c.entry_id, list);
  }
  const confirmedOnByEntry = new Map<string, string>();
  for (const [entryId, rows] of rowsByEntry) {
    const subject = subjectByEntry.get(entryId) as string;
    const employerRows = withoutCounterpartyRows(rows);
    if (deriveIndependentReviewResult(employerRows, subject) !== "approved") continue;
    const independent = employerRows.filter((r) => r.confirmer_id !== subject);
    const latest = independent.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
    confirmedOnByEntry.set(entryId, latest.created_at);
  }

  const out: Record<string, EvidenceOption[]> = {};
  const seen = new Set<string>();
  const sorted = [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  for (const e of sorted) {
    if (seen.has(e.id)) continue;
    const subject = subjectByEntry.get(e.id);
    const confirmed = confirmedOnByEntry.get(e.id);
    if (!subject || confirmed === undefined) continue;
    const list = (out[subject] ??= []);
    if (list.length >= MAX_CITED_ENTRIES) continue;
    seen.add(e.id);
    list.push({
      entryId: e.id,
      recordedOn: day(e.created_at),
      confirmedOn: day(confirmed),
      entryType: e.entry_type_slug ?? "",
      excerpt: excerptOf(e.original_text),
    });
  }
  return out;
}
