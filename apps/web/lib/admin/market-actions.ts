"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Admin market-average entry (S4 item 2). The ONLY write path is the
 * admin-gated SECURITY DEFINER RPC `admin_set_market_rate_average` (S4 draft
 * migration 20260610214000): is_admin re-checked in the RPC, audit-logged,
 * source_status defaults to needs_source — the figure is hand-entered from a
 * real source, never estimated by the platform. Degrades to needs_migration
 * while the draft is not applied.
 */

export type MarketRateActionState =
  | { ok: true }
  | { ok: false; code: string; message?: string };

const MISSING_FN_CODES = new Set(["42883", "PGRST202"]);

export async function setMarketRateAverage(
  _prev: MarketRateActionState | null,
  formData: FormData,
): Promise<MarketRateActionState> {
  const professionId = String(formData.get("profession_id") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  const rateRaw = String(formData.get("avg_rate_eur") ?? "").trim();
  const sourceNote = String(formData.get("source_note") ?? "").trim();
  const sourceStatus = String(formData.get("source_status") ?? "needs_source").trim();
  const locale = String(formData.get("locale") ?? "lt");

  const rate = Number(rateRaw.replace(",", "."));
  if (professionId === "" || country === "") {
    return { ok: false, code: "invalid_input" };
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, code: "invalid_rate" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_admin" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "admin_set_market_rate_average",
    {
      p_profession_id: professionId,
      p_country: country,
      p_avg_rate_eur: rate,
      p_source_note: sourceNote || null,
      p_source_status: sourceStatus,
    },
  );
  if (error) {
    if (MISSING_FN_CODES.has(error.code ?? "")) {
      return { ok: false, code: "needs_migration" };
    }
    return { ok: false, code: "error", message: error.message };
  }
  const outcome = String(data ?? "");
  if (outcome !== "ok") return { ok: false, code: outcome };

  revalidatePath(`/${locale}/dashboard/admin/market`);
  return { ok: true };
}
