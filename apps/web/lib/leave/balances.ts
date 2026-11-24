import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  ABSENCE_TYPES,
  type AbsenceType,
  type WorkerAbsence,
} from "@/lib/leave/absences-model";
import {
  absenceDaysWithinPeriod,
  calendarYearPeriod,
  deriveLeaveBalance,
  requestedAbsenceDays,
  type LeaveBalance,
  type LeaveBalancePolicy,
} from "@/lib/leave/balances-model";

/**
 * Leave balance read-models (v1). NO stored balances: everything here is
 * derived at read time from `leave_balance_policies` (org-configured
 * numbers, RLS: org members) and `worker_absences` rows the caller can
 * already read under the existing absence RLS. ADVISORY ONLY — nothing here
 * blocks or decides a request; managers decide.
 *
 * Honest degradation: while the human-gated policies migration is not
 * applied, reads see 42P01 and report the calm "not configured here yet"
 * state — no fake numbers, no assumed statutory defaults.
 */

const MIGRATION_MISSING = new Set(["42P01", "42703"]);
const READ_LIMIT = 200;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type PolicyRow = {
  id: string;
  organization_id: string;
  absence_type: string;
  annual_entitlement_days: number | string;
  period_basis: string;
  carryover_days: number | string;
  is_active: boolean;
};

function toPolicy(r: PolicyRow): LeaveBalancePolicy | null {
  if (!(ABSENCE_TYPES as readonly string[]).includes(r.absence_type)) {
    return null;
  }
  if (r.period_basis !== "calendar_year") return null;
  const entitlement = Number(r.annual_entitlement_days);
  const carryover = Number(r.carryover_days);
  if (!Number.isFinite(entitlement) || !Number.isFinite(carryover)) {
    return null;
  }
  return {
    id: r.id,
    organizationId: r.organization_id,
    absenceType: r.absence_type as AbsenceType,
    annualEntitlementDays: entitlement,
    periodBasis: "calendar_year",
    carryoverDays: carryover,
    isActive: r.is_active === true,
  };
}

export type MyLeaveBalancesResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly year: number;
      /** One derived balance per (org, type) that has an ACTIVE policy —
       *  honest empty list when no org configured anything. */
      readonly balances: readonly (LeaveBalance & {
        readonly organizationName: string | null;
      })[];
    };

/**
 * The signed-in worker's own derived balances, for every organization they
 * belong to (either membership truth) that configured an active policy.
 */
export async function getMyLeaveBalances(): Promise<MyLeaveBalancesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  // Active policies the caller can read — RLS already scopes these to the
  // orgs the caller belongs to (both membership truths) — with the org name
  // embedded through the same relationship the network page uses.
  const polRes = await asAny(supabase)
    .from("leave_balance_policies")
    .select(
      "id, organization_id, absence_type, annual_entitlement_days, period_basis, carryover_days, is_active, organizations(display_name, legal_name)",
    )
    .eq("is_active", true)
    .limit(READ_LIMIT);
  if (polRes.error) {
    if (MIGRATION_MISSING.has(polRes.error.code)) {
      return { status: "needs-migration" };
    }
    return { status: "ok", year: new Date().getUTCFullYear(), balances: [] };
  }

  const rows = (polRes.data ?? []) as (PolicyRow & {
    organizations?: { display_name?: string | null; legal_name?: string | null } | null;
  })[];
  const policies = rows
    .map((r) => {
      const p = toPolicy(r);
      if (!p) return null;
      return {
        policy: p,
        organizationName:
          r.organizations?.display_name ?? r.organizations?.legal_name ?? null,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const year = new Date().getUTCFullYear();
  if (policies.length === 0) {
    return { status: "ok", year, balances: [] };
  }

  // The caller's own worker row + approved absences (existing RLS).
  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  let absences: WorkerAbsence[] = [];
  if (worker?.id) {
    const absRes = await asAny(supabase)
      .from("worker_absences")
      .select(
        "id, worker_id, absence_type, start_date, end_date, half_day, note, status",
      )
      .eq("worker_id", worker.id)
      .eq("status", "approved")
      .limit(READ_LIMIT);
    if (!absRes.error) {
      absences = ((absRes.data ?? []) as {
        id: string;
        worker_id: string;
        absence_type: string;
        start_date: string;
        end_date: string;
        half_day: boolean;
        note: string | null;
        status: string;
      }[])
        .filter((r) =>
          (ABSENCE_TYPES as readonly string[]).includes(r.absence_type),
        )
        .map((r) => ({
          id: r.id,
          workerId: r.worker_id,
          workerName: null,
          absenceType: r.absence_type as AbsenceType,
          startDate: r.start_date,
          endDate: r.end_date,
          halfDay: !!r.half_day,
          note: r.note,
          status: "approved" as const,
        }));
    }
  }

  const balances = policies.map(({ policy, organizationName }) => ({
    ...deriveLeaveBalance(policy, absences, year),
    organizationName,
  }));
  return { status: "ok", year, balances };
}

export type PendingAbsenceAdvisory = {
  /** Days the request asks for (half-day aware). Always computable. */
  readonly requestedDays: number;
  /** Remaining balance for the worker under the ONE applicable visible
   *  policy — null when no policy exists or the manager's orgs hold more
   *  than one policy for the type (ambiguous; shown honestly as nothing). */
  readonly remainingDays: number | null;
  /** requestedDays > remainingDays — the ADVISORY warning flag. Never a
   *  block; managers decide. */
  readonly exceeds: boolean;
};

/**
 * Advisory context for a manager's pending-absence review list. For each
 * pending request: the requested day count and — when the manager's
 * readable policies name exactly ONE active policy for that absence type —
 * the worker's derived remaining balance. More than one visible policy for
 * a type is ambiguous (which org employs this worker is not derivable
 * here); the advisory then shows only the requested days — honest nothing
 * over a guessed number.
 */
export async function getPendingAbsenceAdvisories(
  pending: readonly WorkerAbsence[],
): Promise<ReadonlyMap<string, PendingAbsenceAdvisory>> {
  const out = new Map<string, PendingAbsenceAdvisory>();
  if (pending.length === 0) return out;

  for (const a of pending) {
    out.set(a.id, {
      requestedDays: requestedAbsenceDays(a),
      remainingDays: null,
      exceeds: false,
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return out;

  const polRes = await asAny(supabase)
    .from("leave_balance_policies")
    .select(
      "id, organization_id, absence_type, annual_entitlement_days, period_basis, carryover_days, is_active",
    )
    .eq("is_active", true)
    .limit(READ_LIMIT);
  if (polRes.error) return out; // policies unapplied/unreadable → requested days only

  const policies = ((polRes.data ?? []) as PolicyRow[])
    .map(toPolicy)
    .filter((p): p is LeaveBalancePolicy => p !== null);
  const byType = new Map<AbsenceType, LeaveBalancePolicy[]>();
  for (const p of policies) {
    const list = byType.get(p.absenceType) ?? [];
    list.push(p);
    byType.set(p.absenceType, list);
  }

  const workerIds = [
    ...new Set(
      pending
        .filter((a) => (byType.get(a.absenceType) ?? []).length === 1)
        .map((a) => a.workerId),
    ),
  ];
  if (workerIds.length === 0) return out;

  const absRes = await asAny(supabase)
    .from("worker_absences")
    .select("id, worker_id, absence_type, start_date, end_date, half_day, status")
    .in("worker_id", workerIds)
    .eq("status", "approved")
    .limit(READ_LIMIT * 2);
  if (absRes.error) return out;
  const approved = ((absRes.data ?? []) as {
    id: string;
    worker_id: string;
    absence_type: string;
    start_date: string;
    end_date: string;
    half_day: boolean;
  }[]).filter((r) =>
    (ABSENCE_TYPES as readonly string[]).includes(r.absence_type),
  );

  const year = new Date().getUTCFullYear();
  const { start, end } = calendarYearPeriod(year);

  for (const a of pending) {
    const candidates = byType.get(a.absenceType) ?? [];
    if (candidates.length !== 1) continue;
    const policy = candidates[0];
    const usedDays = approved
      .filter(
        (r) => r.worker_id === a.workerId && r.absence_type === a.absenceType,
      )
      .reduce(
        (sum, r) =>
          sum +
          absenceDaysWithinPeriod(
            { startDate: r.start_date, endDate: r.end_date, halfDay: !!r.half_day },
            start,
            end,
          ),
        0,
      );
    const remainingDays =
      policy.annualEntitlementDays + policy.carryoverDays - usedDays;
    const requestedDays = requestedAbsenceDays(a);
    out.set(a.id, {
      requestedDays,
      remainingDays,
      exceeds: requestedDays > remainingDays,
    });
  }
  return out;
}

/**
 * Policies of ONE organization (any current state, active or not) — the
 * configuration list for the org admin surface. RLS re-checks readability.
 */
export type OrgLeavePoliciesResult =
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly policies: readonly LeaveBalancePolicy[];
    };

export async function listOrgLeavePolicies(
  organizationId: string,
): Promise<OrgLeavePoliciesResult> {
  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("leave_balance_policies")
    .select(
      "id, organization_id, absence_type, annual_entitlement_days, period_basis, carryover_days, is_active",
    )
    .eq("organization_id", organizationId)
    .limit(READ_LIMIT);
  if (res.error) {
    if (MIGRATION_MISSING.has(res.error.code)) {
      return { status: "needs-migration" };
    }
    return { status: "ok", policies: [] };
  }
  const policies = ((res.data ?? []) as PolicyRow[])
    .map(toPolicy)
    .filter((p): p is LeaveBalancePolicy => p !== null);
  return { status: "ok", policies };
}
