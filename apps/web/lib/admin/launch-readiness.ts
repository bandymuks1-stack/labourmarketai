import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
 *   - consented profiles = CURRENT granted profile_discoverability consent
 *     from the append-only privacy_consent_events ledger (via the
 *     admin_privacy_readiness_counts RPC — consent-and-disclosure v1), with
 *     the honest breakdown private/awaiting/withdrawn/stale. The legacy
 *     profiles.consent_data_processing boolean is DEPRECATED here: it never
 *     had a write path and is not a real consent record. NO backfill —
 *     every count stays 0 until real users choose;
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
  readonly privacyAwaitingChoice: number | null;
  readonly privacyWithdrawn: number | null;
  readonly privacyStaleVersion: number | null;
  readonly privacyActiveDisclosurePermissions: number | null;
  readonly privacyCompletedDisclosures: number | null;
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

interface PrivacyCounts {
  consented: number | null;
  awaiting: number | null;
  withdrawn: number | null;
  stale: number | null;
  activePermissions: number | null;
  completedDisclosures: number | null;
}

/** Consent counts come from the append-only ledger via the is_admin()-gated
 *  SECURITY DEFINER RPC, called with the CALLER's RLS client (auth context —
 *  the service-role client has no auth.uid() and would be refused). Honest
 *  degradation: RPC absent (pre-migration) or any error → all null. */
async function readPrivacyCounts(): Promise<PrivacyCounts> {
  const empty: PrivacyCounts = {
    consented: null,
    awaiting: null,
    withdrawn: null,
    stale: null,
    activePermissions: null,
    completedDisclosures: null,
  };
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc(
      "admin_privacy_readiness_counts",
    );
    if (error || !data?.ok) return empty;
    const n = (v: unknown) => (typeof v === "number" ? v : null);
    return {
      consented: n(data.discoverable),
      awaiting: n(data.awaitingChoice),
      withdrawn: n(data.withdrawn),
      stale: n(data.staleVersion),
      activePermissions: n(data.activeDisclosurePermissions),
      completedDisclosures: n(data.completedDisclosures),
    };
  } catch {
    return empty;
  }
}

export async function getLaunchReadiness(): Promise<LaunchReadinessResult> {
  if (!(await isSuperadmin())) return { kind: "not-admin" };
  const sb = createAdminClient();

  const privacy = await readPrivacyCounts();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [
    workersTotal,
    workersWithProfession,
    workersWithLocation,
    workersAvailable,
    workersWithSalary,
    workersWithJournalEvidence,
    workersWithReadyDocs,
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
      profilesConsented: privacy.consented,
      privacyAwaitingChoice: privacy.awaiting,
      privacyWithdrawn: privacy.withdrawn,
      privacyStaleVersion: privacy.stale,
      privacyActiveDisclosurePermissions: privacy.activePermissions,
      privacyCompletedDisclosures: privacy.completedDisclosures,
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
