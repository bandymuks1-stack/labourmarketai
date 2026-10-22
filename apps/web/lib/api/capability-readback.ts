/**
 * CAPABILITY READBACK — the wire body of `GET /api/internal/capability-readback/v1` (pure; no I/O).
 *
 * Agentai OS re-verifies its LabourMarket.ai capability contract from these counts
 * (agentai: agent-control-center/src/capability/capability-readback.ts). Its parser refuses the WHOLE response on any key
 * outside this list or any value that is not a non-negative integer, so this side emits exactly these keys and fails
 * closed (null → 503) on anything else — a missing count is an outage, never a zero.
 */

export const CAPABILITY_READBACK_SCHEMA = "lm-capability-readback/v1" as const;

export const CAPABILITY_READBACK_KEYS = [
  "workers", "workers_with_profession", "worker_skills", "profile_skill_claims", "matches", "match_actions",
  "public_vacancies", "public_vacancies_browsable", "public_vacancies_identified_employers", "vacancy_import_cursors",
  "journal_entries", "journal_entry_skills", "journal_entry_confirmations", "projects", "project_worker_assignments",
  "worker_absences", "booking_requests", "company_worker_engagements", "customer_requests",
  "company_need_public_intakes", "service_offerings", "workflow_instances", "onboarding_runs", "ai_runs",
] as const;

/** The keys that are a plain exact count of the whole table of the same name (the route head-counts them). */
export const CAPABILITY_READBACK_TABLE_COUNTS = [
  "workers", "worker_skills", "profile_skill_claims", "matches", "match_actions", "vacancy_import_cursors",
  "journal_entries", "journal_entry_skills", "journal_entry_confirmations", "projects", "project_worker_assignments",
  "worker_absences", "booking_requests", "company_worker_engagements", "customer_requests",
  "company_need_public_intakes", "service_offerings", "workflow_instances", "onboarding_runs", "ai_runs",
] as const satisfies readonly (typeof CAPABILITY_READBACK_KEYS)[number][];

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
