"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingRpcCode,
  isMissingTableCode,
  validateTalentSourceInput,
} from "./provenance-model";

/**
 * Record action for the signed-in person's OWN provenance ledger. The ONLY
 * write path is the SECURITY DEFINER RPC record_talent_source_v1 from DRAFT
 * migration 20260713210000_multi_source_talent_v1 (human-gated, NOT applied
 * yet). The RPC re-validates everything server-side and enforces that the
 * caller IS the subject (or admin) — v1 has NO path for a company or agency
 * to write provenance about another person (agency/partner source recording
 * is a documented admin/service v2 follow-up).
 *
 * Consent lifecycle rule (also encoded in provenance-model.canTransitionConsent):
 * 'revoked' is terminal for a record. This action only INSERTS new records —
 * it can never flip a revoked record back to granted.
 */

export type RecordTalentSourceResult =
  | { ok: true }
  | {
      ok: false;
      code: "needs_migration" | "unauthenticated" | "invalid" | "error";
    };

// The RPC is not in the generated Database type until the draft is applied
// and `pnpm db:types` runs — cast at the boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Record ONE provenance fact about the caller's own data. */
export async function recordOwnTalentSourceAction(
  _prev: RecordTalentSourceResult | null,
  formData: FormData,
): Promise<RecordTalentSourceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const validated = validateTalentSourceInput({
    sourceType: String(formData.get("sourceType") ?? ""),
    sourceName: String(formData.get("sourceName") ?? ""),
    sourceReference: String(formData.get("sourceReference") ?? ""),
    importMethod: String(formData.get("importMethod") ?? ""),
    consentStatus: String(formData.get("consentStatus") ?? "not_required"),
  });
  if (!validated.ok) return { ok: false, code: "invalid" };

  const { error } = await asAny(supabase).rpc("record_talent_source_v1", {
    p_source_type: validated.value.sourceType,
    p_source_name: validated.value.sourceName,
    p_source_reference: validated.value.sourceReference,
    p_import_method: validated.value.importMethod,
    p_provenance: null,
    p_consent_status: validated.value.consentStatus,
    // Always the caller's own profile — never another person's.
    p_subject_profile_id: null,
  });

  if (error) {
    if (isMissingRpcCode(error.code) || isMissingTableCode(error.code)) {
      return { ok: false, code: "needs_migration" };
    }
    if (error.code === "22023") return { ok: false, code: "invalid" };
    console.error("[talent-provenance] record failed:", error.code, error.message);
    return { ok: false, code: "error" };
  }

  return { ok: true };
}
