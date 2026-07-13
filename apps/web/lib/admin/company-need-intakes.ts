import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";
import {
  COMPANY_NEED_INTAKE_STATUSES,
  COMPANY_NEED_INTAKE_OPERATOR_STATUSES,
  type CompanyNeedIntakeStatus,
} from "./company-need-intake-shared";

// Re-export the shared closed status set so existing importers of this module
// (the server action, the page) keep a single import site.
export {
  COMPANY_NEED_INTAKE_STATUSES,
  COMPANY_NEED_INTAKE_OPERATOR_STATUSES,
  type CompanyNeedIntakeStatus,
} from "./company-need-intake-shared";

/**
 * Public Intake Owner Queue v1 — data-access service.
 *
 * The anonymous public `/company-need` route persists a structured demand into
 * the write-only `public.company_need_public_intakes` table via the
 * SECURITY DEFINER RPC `submit_company_need_public_v1` (migration
 * 20260707120000 / PR #678). That migration deliberately adds NO anon or
 * authenticated RLS policy: the table is read-only via the service role and
 * write-only via the RPC. Until now those rows were trapped — there was no
 * operator surface to review or action them.
 *
 * This service closes that gap WITHOUT weakening the public security model:
 *   - it reads and updates ONLY through the service-role client
 *     (`createAdminClient`, which bypasses RLS) — no new table grant, no new
 *     RLS policy, no migration, `customer_requests` untouched;
 *   - because the service-role client bypasses RLS, EVERY entry point here
 *     performs an explicit `isSuperadmin()` authorization check FIRST (the
 *     contract stated in lib/supabase/admin.ts) so a non-admin can never see
 *     or mutate a row even if this module were reached outside the gated
 *     admin subtree;
 *   - status is constrained to the closed operator set
 *     new / contacted / qualified / rejected;
 *   - it degrades honestly when the intake migration is not applied to the
 *     current environment (42P01 → `needs-migration`), never a false success.
 *
 * INTERNAL ONLY — BY CONSTRUCTION: updating a status writes a single column
 * and sends NOTHING anywhere (no email, SMS, push, Telegram, webhook).
 */

const RELATION_ABSENT = "42P01";

// The generated `Database` type does not carry company_need_public_intakes
// (the table postdates the last `db:types` run) — same service-role
// type-escape as lib/admin/billing-actions.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function intakes(sb: SupabaseClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sb as any).from("company_need_public_intakes");
}

export interface CompanyNeedIntakeRow {
  readonly id: string;
  readonly createdAt: string;
  readonly locale: string | null;
  readonly companyName: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly country: string | null;
  readonly cityOrRegion: string | null;
  readonly sector: string | null;
  readonly headcount: number | null;
  readonly startWindow: string | null;
  readonly expectedDuration: string | null;
  readonly urgency: string | null;
  readonly accommodation: string | null;
  readonly transportNeeded: boolean | null;
  readonly languages: string | null;
  readonly engagementType: string | null;
  readonly description: string | null;
  readonly sourcePath: string | null;
  readonly status: CompanyNeedIntakeStatus;
}

export type CompanyNeedIntakeListResult =
  | { kind: "ok"; rows: readonly CompanyNeedIntakeRow[] }
  | { kind: "not-admin" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type SetIntakeStatusResult =
  | { kind: "ok" }
  | { kind: "not-admin" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

const SELECT_COLUMNS =
  "id, created_at, locale, company_name, contact_name, contact_email, contact_phone, country, city_or_region, sector, headcount, start_window, expected_duration, urgency, accommodation, transport_needed, languages, engagement_type, description, source_path, status";

/** Queue ordering: unactioned (new) first, then most recent first. */
const STATUS_ORDER: Record<CompanyNeedIntakeStatus, number> = {
  new: 0,
  contacted: 1,
  qualified: 2,
  converted: 3,
  rejected: 4,
};

function normaliseStatus(v: unknown): CompanyNeedIntakeStatus {
  return (COMPANY_NEED_INTAKE_STATUSES as readonly string[]).includes(
    v as string,
  )
    ? (v as CompanyNeedIntakeStatus)
    : "new";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): CompanyNeedIntakeRow {
  return {
    id: r.id as string,
    createdAt: r.created_at as string,
    locale: (r.locale as string | null) ?? null,
    companyName: (r.company_name as string | null) ?? null,
    contactName: (r.contact_name as string | null) ?? null,
    contactEmail: (r.contact_email as string | null) ?? null,
    contactPhone: (r.contact_phone as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    cityOrRegion: (r.city_or_region as string | null) ?? null,
    sector: (r.sector as string | null) ?? null,
    headcount:
      typeof r.headcount === "number" ? (r.headcount as number) : null,
    startWindow: (r.start_window as string | null) ?? null,
    expectedDuration: (r.expected_duration as string | null) ?? null,
    urgency: (r.urgency as string | null) ?? null,
    accommodation: (r.accommodation as string | null) ?? null,
    transportNeeded:
      typeof r.transport_needed === "boolean"
        ? (r.transport_needed as boolean)
        : null,
    languages: (r.languages as string | null) ?? null,
    engagementType: (r.engagement_type as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    sourcePath: (r.source_path as string | null) ?? null,
    status: normaliseStatus(r.status),
  };
}

/**
 * List every submitted public company-need intake for operator review.
 * Admin-gated (service-role read); honest `needs-migration` when the table
 * is absent in this environment.
 */
export async function listCompanyNeedIntakes(): Promise<CompanyNeedIntakeListResult> {
  // Service-role bypasses RLS → an explicit admin check is MANDATORY before
  // any row is returned (lib/supabase/admin.ts contract).
  if (!(await isSuperadmin())) return { kind: "not-admin" };

  const sb = createAdminClient();
  const { data, error } = await intakes(sb)
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code === RELATION_ABSENT) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).map(mapRow);
  rows.sort((a, b) => {
    const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (so !== 0) return so;
    return b.createdAt.localeCompare(a.createdAt);
  });
  return { kind: "ok", rows };
}

/**
 * Update a single intake's operator status. Admin-gated (service-role write);
 * status is validated against the closed set. Never touches any other column,
 * never sends anything outbound.
 */
export async function setCompanyNeedIntakeStatus(
  id: string,
  status: CompanyNeedIntakeStatus,
): Promise<SetIntakeStatusResult> {
  if (!(await isSuperadmin())) return { kind: "not-admin" };
  // OPERATOR statuses only — `converted` is written exclusively by the
  // company's own claim action (lib/company/claim-public-intake.ts), so the
  // queue can never assert a conversion that did not happen.
  if (
    !id ||
    !(COMPANY_NEED_INTAKE_OPERATOR_STATUSES as readonly string[]).includes(
      status,
    )
  ) {
    return { kind: "invalid" };
  }

  const sb = createAdminClient();
  const { data, error } = await intakes(sb)
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === RELATION_ABSENT) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!data || (data as any[]).length === 0) return { kind: "not-found" };
  return { kind: "ok" };
}
