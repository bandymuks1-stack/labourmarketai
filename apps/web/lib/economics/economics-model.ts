/**
 * Project economics — client-safe model (Wagon 8 slice). Budget vs actual over
 * the canonical `finance_records` ledger. EUR only (matches the ledger); no
 * currency mixing, no tax/gross-net conversion.
 */

export const BUDGET_CATEGORIES = [
  "labour",
  "materials",
  "equipment",
  "transport",
  "accommodation",
  "subcontractors",
  "overhead",
  "contingency",
  "other",
  "total",
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_STATUSES = ["draft", "approved"] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export interface ProjectBudgetLine {
  readonly id: string;
  readonly category: BudgetCategory;
  readonly plannedAmountCents: number;
  readonly status: BudgetStatus;
  readonly note: string | null;
}

export type VarianceState = "over_budget" | "under_budget" | "on_budget" | "no_baseline";

export type ProjectEconomicsData =
  | { applied: false }
  | {
      applied: true;
      lines: ProjectBudgetLine[];
      /** Baseline used for variance: an explicit 'total' line if set, else the
       *  sum of the category lines. Avoids double counting. */
      baselineCents: number;
      hasBaseline: boolean;
      /** Actual project cost from finance_records (expense + invoice_received,
       *  non-cancelled), EUR. null = the ledger could not be read. */
      actualCents: number | null;
      /** baseline − actual (positive = under budget). null when either side is null. */
      varianceCents: number | null;
      state: VarianceState;
      currency: "EUR";
    };

export function isBudgetCategory(v: unknown): v is BudgetCategory {
  return typeof v === "string" && (BUDGET_CATEGORIES as readonly string[]).includes(v);
}

/** Pure derivation of baseline / variance / state from budget lines + actual. */
export function deriveEconomics(
  lines: ProjectBudgetLine[],
  actualCents: number | null,
): {
  baselineCents: number;
  hasBaseline: boolean;
  varianceCents: number | null;
  state: VarianceState;
} {
  const totalLine = lines.find((l) => l.category === "total");
  const categorySum = lines
    .filter((l) => l.category !== "total")
    .reduce((s, l) => s + l.plannedAmountCents, 0);
  const baselineCents = totalLine ? totalLine.plannedAmountCents : categorySum;
  const hasBaseline = lines.length > 0;

  if (!hasBaseline || actualCents === null) {
    return {
      baselineCents,
      hasBaseline,
      varianceCents: null,
      state: hasBaseline ? "no_baseline" : "no_baseline",
    };
  }
  const varianceCents = baselineCents - actualCents;
  const state: VarianceState =
    varianceCents < 0 ? "over_budget" : varianceCents > 0 ? "under_budget" : "on_budget";
  return { baselineCents, hasBaseline, varianceCents, state };
}
