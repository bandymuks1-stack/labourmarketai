import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { listMyFinanceRecords } from "@/lib/finance/finance";
import {
  BUDGET_CATEGORIES,
  BUDGET_STATUSES,
  deriveEconomics,
  isBudgetCategory,
  type BudgetStatus,
  type ProjectBudgetLine,
  type ProjectEconomicsData,
} from "@/lib/economics/economics-model";

/**
 * Project economics read model (Wagon 8). Budget lines come from the new
 * `project_budgets` (manager-only RLS); actual cost is derived from the
 * canonical finance layer's sole reader (`listMyFinanceRecords`) — costs are
 * `expense` + `invoice_received`, non-cancelled, EUR — so there is NO second
 * cost ledger and this module never touches the ledger table directly. Honest
 * degradation: a missing project_budgets relation returns { applied: false };
 * an unreadable ledger yields a null actual.
 */

export {
  BUDGET_CATEGORIES,
  BUDGET_STATUSES,
  deriveEconomics,
  isBudgetCategory,
  type ProjectBudgetLine,
  type ProjectEconomicsData,
} from "@/lib/economics/economics-model";

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function getProjectEconomics(
  projectId: string,
): Promise<ProjectEconomicsData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const budgetRes = await asAny(supabase)
    .from("project_budgets")
    .select("id, category, planned_amount_cents, status, note")
    .eq("project_id", projectId)
    .order("category", { ascending: true })
    .limit(50);

  if (budgetRes.error) {
    if (budgetRes.error.code === RELATION_NOT_FOUND || budgetRes.error.code === UNDEFINED_COLUMN) {
      return { applied: false };
    }
    return {
      applied: true,
      lines: [],
      baselineCents: 0,
      hasBaseline: false,
      actualCents: null,
      varianceCents: null,
      state: "no_baseline",
      currency: "EUR",
    };
  }

  type BRow = {
    id: string;
    category: string;
    planned_amount_cents: number | string;
    status: string;
    note: string | null;
  };
  const lines: ProjectBudgetLine[] = ((budgetRes.data ?? []) as BRow[])
    .filter((r) => isBudgetCategory(r.category))
    .map((r) => ({
      id: r.id,
      category: r.category as ProjectBudgetLine["category"],
      plannedAmountCents: Number(r.planned_amount_cents) || 0,
      status: ((BUDGET_STATUSES as readonly string[]).includes(r.status)
        ? r.status
        : "draft") as BudgetStatus,
      note: r.note,
    }));

  // Actual cost from the canonical finance layer's SOLE reader — costs only
  // (expense + received invoices, not invoices we issued). This module never
  // reads the ledger table directly (single-owner contract).
  let actualCents: number | null = 0;
  const finance = await listMyFinanceRecords();
  if (finance.status === "ok") {
    actualCents = finance.records
      .filter(
        (r) =>
          r.projectId === projectId &&
          (r.recordType === "expense" || r.recordType === "invoice_received") &&
          r.status !== "cancelled",
      )
      .reduce((s, r) => s + r.amountCents, 0);
  } else {
    actualCents = null; // needs-migration / not-authed → actual unknown, never invented
  }

  const derived = deriveEconomics(lines, actualCents);
  return {
    applied: true,
    lines,
    baselineCents: derived.baselineCents,
    hasBaseline: derived.hasBaseline,
    actualCents,
    varianceCents: derived.varianceCents,
    state: derived.state,
    currency: "EUR",
  };
}
