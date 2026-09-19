"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * ENDING A ROSTER LINK — R-9 (2026-09-19 completion audit).
 *
 * Two people may end the relationship a worker accepted: the WORKER (consent
 * withdrawn — "I no longer work here") and the OWNER of the company/agency
 * (the roster removal the people page never had). Both call the ONE gated
 * write, `end_roster_link_v1` (owner-gated migration 20260919150000), which
 * re-derives the caller's capacity itself; the form grants nothing. Until it
 * is applied the action returns `needs_migration` honestly.
 *
 * Nothing is deleted: the row moves to `status = 'removed'`, the membership
 * the acceptance provisioned ends with it, and both are audited.
 */

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIGRATION_MISSING = new Set(["42P01", "42703", "42883", "PGRST202"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type EndRosterLinkResult =
  | { readonly ok: true; readonly outcome: "removed" | "already_removed"; readonly engagementEnded: boolean }
  | {
      readonly ok: false;
      readonly code: "auth" | "invalid" | "not_found" | "needs_migration" | "error";
    };

export async function endRosterLinkAction(
  _previous: EndRosterLinkResult | null,
  form: FormData,
): Promise<EndRosterLinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const kind = String(form.get("kind") ?? "");
  const orgLegacyId = String(form.get("org_legacy_id") ?? "").trim();
  const workerId = String(form.get("worker_id") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (
    (kind !== "company" && kind !== "agency") ||
    !UUID_RX.test(orgLegacyId) ||
    !UUID_RX.test(workerId)
  ) {
    return { ok: false, code: "invalid" };
  }

  const { data, error } = await asAny(supabase).rpc("end_roster_link_v1", {
    p_kind: kind,
    p_org_legacy_id: orgLegacyId,
    p_worker_id: workerId,
    p_reason: reason === "" ? null : reason,
  });
  if (error) {
    if (MIGRATION_MISSING.has(error.code ?? "")) return { ok: false, code: "needs_migration" };
    return { ok: false, code: "error" };
  }
  const outcome = String((data as { outcome?: string } | null)?.outcome ?? "");
  if (outcome === "removed" || outcome === "already_removed") {
    revalidatePath("/[locale]/dashboard/profile", "page");
    revalidatePath("/[locale]/dashboard/company/people", "page");
    return {
      ok: true,
      outcome,
      engagementEnded: (data as { engagement_ended?: boolean } | null)?.engagement_ended === true,
    };
  }
  if (outcome === "not_found") return { ok: false, code: "not_found" };
  if (outcome === "invalid") return { ok: false, code: "invalid" };
  return { ok: false, code: "error" };
}
