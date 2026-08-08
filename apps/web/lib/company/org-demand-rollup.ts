import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmployerContextReason } from "@/lib/company/employer-company-context";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { parseStructuredNeed } from "@/lib/market/fit";
import {
  INTEREST_STATUSES,
  type InterestStatus,
} from "@/lib/opportunities/interest-snapshot";
import { createClient } from "@/lib/supabase/server";

/**
 * Org demand rollup v1 — W8 / W14-6, built on the applied org demand spine
 * (migration `20260806200000`: `organization_id` on `customer_requests`,
 * `demand_shortlist`, `booking_requests`; RLS leg `has_org_demand_access`).
 *
 * ONE org-scoped aggregate over demand data the caller's organization can
 * already read. The scope is `requireEmployerCompany()` — the ONE canonical
 * fail-closed resolver; no id is ever accepted from the caller. Rows with a
 * NULL `organization_id` are personal demand and deliberately stay out of a
 * COMPANY surface.
 *
 * HONESTY contract (A-12): a fact that cannot be measured is returned as an
 * explicit unmeasured state, never a zero. Time-to-fill is the standing
 * example — production has 0 `booking_requests` rows, so until real accepted
 * bookings exist the section says "not measurable yet" rather than "0 days".
 * `no-company-context` is its OWN state, never folded into "empty".
 *
 * This reader lives in `lib/company/` — NOT in `lib/scouting/scouting.ts` or
 * `lib/booking/booking-actions.ts`, whose sources are pinned org-column-free
 * by `lib/guards/org-demand-spine-v2.test.ts`.
 *
 * INTERNAL ONLY: read-only, no admin client, no outbound call.
 */

const DEMAND_READ_LIMIT = 500;

/**
 * Bounded status vocabulary for the rollup: the open-lifecycle set (the same
 * four statuses as `OPEN_DEMAND_STATUSES` in `lib/reports/reports-hub.ts` —
 * not imported to keep this module cycle-free of its consumer) + `closed`.
 */
export const ROLLUP_OPEN_DEMAND_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "needs_followup",
] as const;
export const ROLLUP_DEMAND_STATUSES = [
  ...ROLLUP_OPEN_DEMAND_STATUSES,
  "closed",
] as const;
export type RollupDemandStatus = (typeof ROLLUP_DEMAND_STATUSES)[number];

export type OrgDemandRollup =
  | { readonly kind: "no-company-context"; readonly reason: EmployerContextReason }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "ok";
      readonly total: number;
      readonly open: number;
      readonly byStatus: Readonly<Record<RollupDemandStatus, number>>;
      /** Demands whose payload parses as a structured need. */
      readonly structured: number;
      /** `demand_shortlist` rows attributed to the organization. */
      readonly shortlisted: number;
      /** Worker interest signals on the org's demands, by status. */
      readonly interest:
        | {
            readonly state: "ok";
            readonly byStatus: Readonly<Record<InterestStatus, number>>;
            readonly total: number;
          }
        | { readonly state: "unavailable" };
      /**
       * Median days from booking request creation to acceptance, over the
       * org's ACCEPTED bookings. `unmeasured` until such rows exist — the
       * marketplace loop has not closed in production yet, and a fabricated
       * zero here would be the exact A-12 violation.
       */
      readonly timeToFill:
        | { readonly state: "measured"; readonly medianDays: number; readonly acceptedCount: number }
        | { readonly state: "unmeasured" };
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** The org-column-missing Postgres code — the honest needs-migration signal. */
const UNDEFINED_COLUMN = "42703";

export async function getOrgDemandRollup(): Promise<OrgDemandRollup> {
  const employer = await requireEmployerCompany();
  if (!employer.ok) {
    return { kind: "no-company-context", reason: employer.reason };
  }
  const orgId = employer.organizationId;
  const supabase = await createClient();

  const demandRes = await asAny(supabase)
    .from("customer_requests")
    .select("id, status, payload")
    .eq("organization_id", orgId)
    .limit(DEMAND_READ_LIMIT);
  if (demandRes.error) {
    return demandRes.error.code === UNDEFINED_COLUMN
      ? { kind: "needs-migration" }
      : { kind: "unavailable" };
  }
  const rows = (demandRes.data ?? []) as {
    id: string;
    status: string;
    payload: unknown;
  }[];

  const byStatus = Object.fromEntries(
    ROLLUP_DEMAND_STATUSES.map((s) => [s, 0]),
  ) as Record<RollupDemandStatus, number>;
  let structured = 0;
  for (const row of rows) {
    if ((ROLLUP_DEMAND_STATUSES as readonly string[]).includes(row.status)) {
      byStatus[row.status as RollupDemandStatus] += 1;
    }
    if (parseStructuredNeed(row.payload) !== null) structured += 1;
  }
  const open = ROLLUP_OPEN_DEMAND_STATUSES.reduce(
    (n, s) => n + byStatus[s],
    0,
  );

  // Shortlist + interest + bookings are enrichments: their failure degrades
  // the section, never the whole rollup.
  const requestIds = rows.map((r) => r.id);
  const [shortlistRes, interestRes, bookingRes] = await Promise.all([
    asAny(supabase)
      .from("demand_shortlist")
      .select("id")
      .eq("organization_id", orgId)
      .limit(DEMAND_READ_LIMIT),
    requestIds.length > 0
      ? asAny(supabase)
          .from("demand_interest_signals")
          .select("request_id, status")
          .in("request_id", requestIds.slice(0, DEMAND_READ_LIMIT))
      : Promise.resolve({ data: [], error: null }),
    asAny(supabase)
      .from("booking_requests")
      .select("status, created_at, updated_at")
      .eq("organization_id", orgId)
      .eq("status", "accepted")
      .limit(DEMAND_READ_LIMIT),
  ]);

  const shortlisted = shortlistRes.error
    ? 0
    : ((shortlistRes.data ?? []) as unknown[]).length;

  let interest: Extract<OrgDemandRollup, { kind: "ok" }>["interest"];
  if (interestRes.error) {
    interest = { state: "unavailable" };
  } else {
    const interestByStatus = Object.fromEntries(
      INTEREST_STATUSES.map((s) => [s, 0]),
    ) as Record<InterestStatus, number>;
    let interestTotal = 0;
    for (const r of (interestRes.data ?? []) as { status: string }[]) {
      if ((INTEREST_STATUSES as readonly string[]).includes(r.status)) {
        interestByStatus[r.status as InterestStatus] += 1;
        interestTotal += 1;
      }
    }
    interest = { state: "ok", byStatus: interestByStatus, total: interestTotal };
  }

  let timeToFill: Extract<OrgDemandRollup, { kind: "ok" }>["timeToFill"] = {
    state: "unmeasured",
  };
  if (!bookingRes.error) {
    const accepted = ((bookingRes.data ?? []) as {
      created_at: string;
      updated_at: string;
    }[]).filter((b) => b.created_at && b.updated_at);
    if (accepted.length > 0) {
      const days = accepted
        .map(
          (b) =>
            (new Date(b.updated_at).getTime() - new Date(b.created_at).getTime()) /
            86_400_000,
        )
        .filter((d) => d >= 0)
        .sort((a, b) => a - b);
      if (days.length > 0) {
        const mid = Math.floor(days.length / 2);
        const median =
          days.length % 2 === 1 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
        timeToFill = {
          state: "measured",
          medianDays: Math.round(median * 10) / 10,
          acceptedCount: days.length,
        };
      }
    }
  }

  return {
    kind: "ok",
    total: rows.length,
    open,
    byStatus,
    structured,
    shortlisted,
    interest,
    timeToFill,
  };
}
