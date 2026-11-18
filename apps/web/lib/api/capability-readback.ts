/**
 * CAPABILITY READBACK — the wire body of `GET /api/internal/capability-readback/v1` (pure; no I/O).
 *
 * Agentai OS re-verifies its LabourMarket.ai capability contract from these counts
 * (agentai: agent-control-center/src/capability/capability-readback.ts). Its parser refuses the WHOLE response on any key
 * outside this list or any value that is not a non-negative integer, so this side emits exactly these keys and fails
 * closed (null → 503) on anything else — a missing count is an outage, never a zero.
 */

import { countSyntheticIntakes, type IntakeCountRow } from "@/lib/staffing/intake-test-rows";

export const CAPABILITY_READBACK_SCHEMA = "lm-capability-readback/v1" as const;

export const CAPABILITY_READBACK_KEYS = [
  "workers", "workers_with_profession", "worker_skills", "profile_skill_claims", "matches", "match_actions",
  "public_vacancies", "public_vacancies_browsable", "public_vacancies_identified_employers", "vacancy_import_cursors",
  "journal_entries", "journal_entry_skills", "journal_entry_confirmations", "projects", "project_worker_assignments",
  "worker_absences", "booking_requests", "company_worker_engagements", "customer_requests",
  "company_need_public_intakes", "service_offerings", "workflow_instances", "onboarding_runs", "ai_runs",
] as const;

export interface CapabilityReadbackBody {
  readonly schema: typeof CAPABILITY_READBACK_SCHEMA;
  readonly builtAtIso: string;
  readonly counts: Readonly<Record<(typeof CAPABILITY_READBACK_KEYS)[number], number>>;
}

/** The body from the database function's jsonb, or null when any agreed count is missing or not a non-negative integer. */
export function buildCapabilityReadback(raw: unknown, builtAtIso: string): CapabilityReadbackBody | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const counts: Record<string, number> = {};
  for (const key of CAPABILITY_READBACK_KEYS) {
    const v = typeof source[key] === "string" ? Number(source[key]) : source[key];
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) return null;
    counts[key] = v;
  }
  return { schema: CAPABILITY_READBACK_SCHEMA, builtAtIso, counts: counts as CapabilityReadbackBody["counts"] };
}

/**
 * OUR TEST REQUESTS ARE NOT CAPABILITY (owner 2026-11-14). The `company_need_public_intakes` count Agentai OS sees is
 * the number of REAL requests — exactly what the commercial-requests feed passes: every intake row read, minus the
 * rows the feed's one predicate (`isSyntheticCommercialRequest`) drops. Both numbers come from the SAME read of the
 * rows, so the difference is never off by a row inserted between two reads, and never negative.
 *
 * `rows` null (a failed or oversized read) → null → 503, never the unfiltered database count and never a zero.
 */
export function withRealIntakeCount(
  body: CapabilityReadbackBody | null,
  rows: readonly IntakeCountRow[] | null,
): CapabilityReadbackBody | null {
  if (body === null || rows === null) return null;
  const real = rows.length - countSyntheticIntakes(rows);
  return { ...body, counts: { ...body.counts, company_need_public_intakes: real } };
}
