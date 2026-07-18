"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { BUDGET_CATEGORIES } from "@/lib/economics/economics-model";

/**
 * Project budget write actions (Wagon 8). Writes go only through the gated
 * SECURITY DEFINER RPCs (migration 20260718160000): each re-checks
 * can_manage_project. Amounts are EUR cents. Honest degradation: a missing RPC
 * (42883) returns needs_migration.
 */

const RPC_NOT_FOUND = "42883";
const UNDEFINED_COLUMN = "42703";
const RELATION_NOT_FOUND = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type BudgetActionResult =
  | { ok: true }
  | {
      ok: false;
      code: "needs_migration" | "invalid" | "auth" | "not_authorized" | "error";
      message?: string;
    };

function mapError(error: { code?: string; message?: string }): BudgetActionResult {
  if (
    error.code === RPC_NOT_FOUND ||
    error.code === UNDEFINED_COLUMN ||
    error.code === RELATION_NOT_FOUND
  ) {
    return { ok: false, code: "needs_migration" };
  }
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42501" || msg.includes("not authorized")) {
    return { ok: false, code: "not_authorized" };
  }
  if (msg.includes("invalid")) return { ok: false, code: "invalid" };
  console.error("[economics] write failed:", error.message);
  return { ok: false, code: "error", message: error.message };
}

export async function setBudgetLineAction(input: {
  projectId: string;
  category: string;
  plannedAmountCents: number;
  note?: string;
}): Promise<BudgetActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const cents = Math.round(input.plannedAmountCents);
  if (
    !input.projectId ||
    !(BUDGET_CATEGORIES as readonly string[]).includes(input.category) ||
    !Number.isFinite(cents) ||
    cents < 0 ||
    cents > 100_000_000_000
  ) {
    return { ok: false, code: "invalid" };
  }

  const { error } = await asAny(supabase).rpc("set_project_budget_v1", {
    p_project_id: input.projectId,
    p_category: input.category,
    p_planned_amount_cents: cents,
    p_note: (input.note ?? "").trim().slice(0, 500) || null,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setBudgetStatusAction(input: {
  budgetId: string;
  status: "draft" | "approved";
}): Promise<BudgetActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!input.budgetId || (input.status !== "draft" && input.status !== "approved")) {
    return { ok: false, code: "invalid" };
  }

  const { error } = await asAny(supabase).rpc("set_project_budget_status_v1", {
    p_budget_id: input.budgetId,
    p_status: input.status,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteBudgetLineAction(input: {
  budgetId: string;
}): Promise<BudgetActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  if (!input.budgetId) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("delete_project_budget_v1", {
    p_budget_id: input.budgetId,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
