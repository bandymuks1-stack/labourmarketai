import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";

/**
 * Operator launch-readiness overview (launch repair Scope E).
 *
 * REAL aggregate counts only, read with the service-role client and gated by
 * an explicit `isSuperadmin()` check (same contract as
 * lib/admin/company-need-intakes.ts — the client bypasses RLS, so the
 * authorization check happens here, not only in the page tree).
 *
 * Every metric is a count over EXISTING production columns:
 *   - workers + how many have a profession / location / availability /
 *     salary expectation / journal evidence / operator-verified ready docs;
 *   - consented profiles (profiles.consent_data_processing = true) vs the
 *     owner's pre-marketing target of 15–25 consented real profiles;
 *   - real companies, public company-need intakes by operator status,
 *     submitted authenticated customer requests;
 *   - teams (organizations rows with organization_type = 'team').
 *
 * Any unavailable read yields null and renders as "—" (unknown) — NEVER a
 * fabricated number, no invented percentages, no "ready" flags the data
 * cannot prove (§18: no fake analytics). What the data model CANNOT prove
 * (consent provenance, availability freshness, brigade composition, profile
 * source) is documented in docs/launch/real-supply-readiness-gap-v1.md and
 * deliberately NOT rendered as a number here.
 */

/** Owner's pre-marketing supply target: consented, real worker profiles. */
export const CONSENTED_PROFILE_TARGET = { min: 15, max: 25 } as const;

export interface LaunchReadiness {
  readonly workersTotal: number | null;
  readonly workersWithProfession: number | null;
  readonly workersWithLocation: number | null;
  readonly workersAvailable: number | null;
  readonly workersWithSalary: number | null;
  readonly workersWithJournalEvidence: number | null;
  readonly workersWithReadyDocs: number | null;
  readonly profilesConsented: number | null;
  readonly companiesTotal: number | null;
  readonly intakesNew: number | null;
  readonly intakesContacted: number | null;
  readonly intakesQualified: number | null;
  readonly intakesRejected: number | null;
  readonly customerRequestsSubmitted: number | null;
  readonly teamsTotal: number | null;
}

export type LaunchReadinessResult =
  | { kind: "ok"; readiness: LaunchReadiness }
  | { kind: "not-admin" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient): any => c;

/** Null-safe head-count; `select` may carry an !inner embed so the count is
 *  the number of DISTINCT parent rows that have at least one related row. */
async function count(
  sb: SupabaseClient,
  table: string,
  select: string,
  filter?: (q: unknown) => unknown,
): Promise<number | null> {
  try {
    let q = asAny(sb).from(table).select(select, { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count: n, error } = await q;
    if (error) return null;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

export async function getLaunchReadiness(): Promise<LaunchReadinessResult> {
  if (!(await isSuperadmin())) return { kind: "not-admin" };
  const sb = createAdminClient();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [
    workersTotal,
    workersWithProfession,
    workersWithLocation,
    workersAvailable,
    workersWithSalary,
    workersWithJournalEvidence,
    workersWithReadyDocs,
    profilesConsented,
    companiesTotal,
    intakesNew,
    intakesContacted,
    intakesQualified,
    intakesRejected,
    customerRequestsSubmitted,
    teamsTotal,
  ] = await Promise.all([
    count(sb, "workers", "id"),
    count(sb, "workers", "id, worker_professions!inner(worker_id)"),
    count(sb, "workers", "id", (q) =>
      (q as any).not("current_location_country", "is", null),
    ),
    count(sb, "workers", "id", (q) =>
      (q as any).eq("availability_status", "available"),
    ),
    count(sb, "workers", "id", (q) =>
      (q as any).or("salary_min_eur.not.is.null,salary_max_eur.not.is.null"),
    ),
    count(sb, "workers", "id, journal_entries!inner(id)"),
    count(sb, "workers", "id, worker_documents!inner(id)", (q) =>
      (q as any).eq("worker_documents.status", "ready"),
    ),
    count(sb, "profiles", "id", (q) =>
      (q as any).eq("consent_data_processing", true),
    ),
    count(sb, "companies", "id"),
    count(sb, "company_need_public_intakes", "id", (q) =>
      (q as any).eq("status", "new"),
    ),
    count(sb, "company_need_public_intakes", "id", (q) =>
      (q as any).eq("status", "contacted"),
    ),
    count(sb, "company_need_public_intakes", "id", (q) =>
      (q as any).eq("status", "qualified"),
    ),
    count(sb, "company_need_public_intakes", "id", (q) =>
      (q as any).eq("status", "rejected"),
    ),
    count(sb, "customer_requests", "id", (q) =>
      (q as any).eq("status", "submitted"),
    ),
    count(sb, "organizations", "id", (q) =>
      (q as any).eq("organization_type", "team"),
    ),
  ]);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    kind: "ok",
    readiness: {
      workersTotal,
      workersWithProfession,
      workersWithLocation,
      workersAvailable,
      workersWithSalary,
      workersWithJournalEvidence,
      workersWithReadyDocs,
      profilesConsented,
      companiesTotal,
      intakesNew,
      intakesContacted,
      intakesQualified,
      intakesRejected,
      customerRequestsSubmitted,
      teamsTotal,
    },
  };
}
