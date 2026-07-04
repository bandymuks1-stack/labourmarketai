/**
 * Worker express-interest — PURE pieces (Worker Express Interest slice,
 * 2026-07-04). No DB, no network, no side effects. The server flows live in
 * ./interest.ts; keeping the testable logic here mirrors the
 * scouting/scout-safe-view split.
 */

import type { MatchResultV1 } from "@/lib/market/match-v1";

/** Interest lifecycle. The WORKER may set interested/withdrawn on their own
 *  row; reviewed/contacted are company-side acknowledgements (future slice —
 *  the check constraint already allows them, the worker action layer never
 *  writes them). */
export const INTEREST_STATUSES = [
  "interested",
  "withdrawn",
  "reviewed",
  "contacted",
] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

export const WORKER_WRITABLE_INTEREST_STATUSES: readonly InterestStatus[] = [
  "interested",
  "withdrawn",
];

export function isWorkerWritableInterestStatus(s: string): s is InterestStatus {
  return (WORKER_WRITABLE_INTEREST_STATUSES as readonly string[]).includes(s);
}

/** Company acknowledgement set (PR7) — enforced again inside the gated RPC.
 *  The company can NEVER set 'interested' (the worker's own act) or
 *  'withdrawn' (the worker's withdrawal is immutable to the company). */
export const COMPANY_ACK_STATUSES: readonly InterestStatus[] = [
  "reviewed",
  "contacted",
];

export function isCompanyAckStatus(s: string): s is InterestStatus {
  return (COMPANY_ACK_STATUSES as readonly string[]).includes(s);
}

/** Max worker note length (mirrors the DB CHECK). Internal-only text. */
export const INTEREST_NOTE_MAX = 500;

export function cleanInterestNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, INTEREST_NOTE_MAX);
}

/**
 * The §19-shaped canonical match basis stored on the interest row: what the
 * worker saw at click time. SLUGS ONLY — never display names; the reader
 * localizes. Never a bare score: the band always travels with its basis.
 */
export interface InterestMatchSnapshot {
  readonly status_band: MatchResultV1["status"];
  readonly matched_skills: readonly string[];
  readonly missing_skills: readonly string[];
  readonly evidence_basis: {
    readonly matched_total: number;
    readonly need_total: number;
    readonly manager_confirmed: number;
    readonly journal_supported: number;
    readonly self_declared: number;
  };
  readonly need_source: string | null;
}

export function buildMatchSnapshot(
  match: MatchResultV1,
  needSource: string | null,
): InterestMatchSnapshot {
  return {
    status_band: match.status,
    matched_skills: match.skillFit ? [...match.skillFit.matchedUris] : [],
    missing_skills: match.skillFit ? [...match.skillFit.missingUris] : [],
    evidence_basis: {
      matched_total: match.skillFit?.matchedTotal ?? 0,
      need_total: match.skillFit?.needTotal ?? 0,
      manager_confirmed: match.evidence.matchedManagerConfirmed,
      journal_supported: match.evidence.matchedJournalSupported,
      self_declared: match.evidence.matchedSelfDeclared,
    },
    need_source: needSource,
  };
}
