"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type RevertResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "auth" | "invalid" | "not_found" | "not_a_merge" | "already_reverted" | "error" };

/**
 * Undo one recorded consolidation merge through the database's own
 * revert_historical_consolidation_v1 (authority re-checked there; the row
 * returns to active, the ledger keeps the decision and stamps it reverted,
 * audit_logs records before/after). Records are never touched.
 */
export async function revertConsolidationAction(_previous: RevertResult | null, form: FormData): Promise<RevertResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };
  const decision = String(form.get("decision") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(decision) || reason.length < 3 || reason.length > 500) return { ok: false, code: "invalid" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase as any).rpc("revert_historical_consolidation_v1", { p_decision_id: decision, p_reason: reason });
  if (res.error) return { ok: false, code: "error" };
  const outcome = (res.data as { outcome?: string } | null)?.outcome;
  revalidatePath("/[locale]/dashboard/company/history/quality", "page");
  revalidatePath("/[locale]/dashboard/projects", "page");
  if (outcome === "reverted") return { ok: true };
  if (outcome === "not_a_merge" || outcome === "already_reverted" || outcome === "not_found") return { ok: false, code: outcome };
  return { ok: false, code: "error" };
}
