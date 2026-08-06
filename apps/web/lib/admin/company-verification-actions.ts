"use server";

import { revalidatePath } from "next/cache";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import {
  setCompanyVerification,
  ADMIN_VERIFICATION_STATUSES,
  type AdminVerificationStatus,
} from "./company-verification";

/**
 * Admin company-verification server action (tagged-return convention).
 *
 * Double-gated: requireSuperadmin() here (app layer) AND public.is_admin()
 * inside the SECURITY DEFINER RPC (DB layer). A non-admin is redirected by
 * requireSuperadmin before the RPC is ever reached.
 */
export type CompanyVerificationActionState =
  | { ok: true; status: AdminVerificationStatus }
  | {
      ok: false;
      code: "not_admin" | "invalid" | "not_found" | "needs_migration" | "error";
      message?: string;
    };

function readStatus(values: readonly FormDataEntryValue[]): AdminVerificationStatus | null {
  // DUAL-CHANNEL delivery (P0 2026-08-06): the chosen status arrives EITHER
  // via the hidden input (set on click — the React 19 function-action
  // channel, where a submit button's name/value is dropped) OR via the
  // submit button's own name/value (the NATIVE form-post channel — a
  // pre-hydration click submits the raw HTML form, where the hidden input
  // is still empty). Take the LAST non-empty entry: DOM order puts the
  // hidden input first, so a populated button value always wins, and a
  // hydrated click (hidden input set, button value absent from FormData)
  // still resolves.
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const s = (values[i] ?? "").toString();
    if (s && (ADMIN_VERIFICATION_STATUSES as readonly string[]).includes(s)) {
      return s as AdminVerificationStatus;
    }
  }
  return null;
}

export async function setCompanyVerificationAction(
  _prev: CompanyVerificationActionState | null,
  formData: FormData,
): Promise<CompanyVerificationActionState> {
  // App-layer admin gate (dual signal). Non-admins never reach the RPC.
  // The locale only matters for the redirect target on the negative path.
  await requireSuperadmin("lt");

  const companyId = String(formData.get("company_id") ?? "").trim();
  const status = readStatus(formData.getAll("status"));
  const note = formData.get("note")?.toString() ?? null;

  if (!companyId || !status) {
    return { ok: false, code: "invalid" };
  }

  const r = await setCompanyVerification(companyId, status, note);
  switch (r.kind) {
    case "ok":
      revalidatePath("/", "layout");
      return { ok: true, status };
    case "not-admin":
      return { ok: false, code: "not_admin" };
    case "invalid":
      return { ok: false, code: "invalid" };
    case "not-found":
      return { ok: false, code: "not_found" };
    case "needs-migration":
      return { ok: false, code: "needs_migration" };
    default:
      return { ok: false, code: "error", message: r.message };
  }
}
