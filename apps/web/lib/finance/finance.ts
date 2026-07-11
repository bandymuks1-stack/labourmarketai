import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Operational-finance read service (control room PR I, capability gap map
 * §9).
 *
 * Reads ONLY the new `finance_records` table (migration proposed by the
 * SEPARATE, human-gated PR I2) with the caller's RLS-scoped client. RLS lets
 * a row be read by its creator, admins, and — when company_id is set — the
 * owner of that company (owns_company). No service role, ever.
 *
 * HONEST scope: manual records only. This layer computes REAL sums over the
 * caller's own bounded row set — it never estimates, never projects, never
 * touches a payment provider, and never sends anything anywhere.
 *
 * Honest degradation: while the owner-gated migration is not applied the
 * reads see 42P01/42703 and report { status: "needs-migration" } — the
 * finance page then shows the calm "not available yet" state and no record
 * or sum is faked.
 */

import {
  FINANCE_READ_LIMIT,
  ZERO_FINANCE_SUMMARY,
  deriveFinanceSummary,
  isMigrationMissingCode,
  isValidFinanceRecordStatus,
  isValidFinanceRecordType,
  type FinanceRecord,
  type FinanceSummary,
  type MyFinanceRecordsResult,
} from "@/lib/finance/finance-model";

export type {
  FinanceRecord,
  FinanceSummary,
  MyFinanceRecordsResult,
} from "@/lib/finance/finance-model";

const SELECT_COLUMNS =
  "id, record_type, title, counterparty_name, amount_cents, currency, status, due_date, paid_at, project_id, company_id, note, created_by, created_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

type Row = {
  id: string;
  record_type: string;
  title: string;
  counterparty_name: string;
  amount_cents: number | string;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  project_id: string | null;
  company_id: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
};

function toRecord(r: Row): FinanceRecord | null {
  if (!isValidFinanceRecordType(r.record_type)) return null;
  if (!isValidFinanceRecordStatus(r.status)) return null;
  // bigint may arrive as a string — integer parse only, never a float API.
  const amountCents =
    typeof r.amount_cents === "number"
      ? r.amount_cents
      : Number.parseInt(r.amount_cents, 10);
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) return null;
  return {
    id: r.id,
    recordType: r.record_type,
    title: r.title,
    counterpartyName: r.counterparty_name,
    amountCents,
    currency: r.currency,
    status: r.status,
    dueDate: r.due_date ?? null,
    paidAt: r.paid_at ?? null,
    projectId: r.project_id ?? null,
    companyId: r.company_id ?? null,
    note: r.note ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/**
 * The caller's finance records (RLS: creator / admin / company owner) —
 * bounded and deterministically ordered: nearest due date first (nulls
 * last), then newest created.
 */
export async function listMyFinanceRecords(): Promise<MyFinanceRecordsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const res = await asAny(supabase)
    .from("finance_records")
    .select(SELECT_COLUMNS)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(FINANCE_READ_LIMIT);

  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration" };
    }
    return { status: "ok", records: [], error: res.error.message };
  }
  const records = ((res.data ?? []) as Row[])
    .map(toRecord)
    .filter((r): r is FinanceRecord => r !== null);
  return { status: "ok", records, error: null };
}

/** Summary result — same discriminants as the list read. */
export type FinanceSummaryResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | { readonly status: "ok"; readonly summary: FinanceSummary };

/**
 * Real per-status / per-type / per-project totals derived (pure cents math)
 * from the caller's own bounded RLS rows. Zero-summary on any missing-data
 * state — nothing is fabricated, nothing throws into a layout.
 */
export async function getFinanceSummary(): Promise<FinanceSummaryResult> {
  const result = await listMyFinanceRecords();
  if (result.status !== "ok") return result;
  if (result.error) return { status: "ok", summary: ZERO_FINANCE_SUMMARY };
  return {
    status: "ok",
    summary: deriveFinanceSummary(result.records, new Date()),
  };
}
