"use server";

import { revalidatePath } from "next/cache";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import {
  setCompanyNeedIntakeStatus,
  COMPANY_NEED_INTAKE_STATUSES,
  type CompanyNeedIntakeStatus,
} from "./company-need-intakes";

/**
 * Public Intake Owner Queue v1 — status server action (tagged-return).
 *
 * Double-gated: requireSuperadmin() here (app layer, redirects non-admins
 * before any work) AND isSuperadmin() inside setCompanyNeedIntakeStatus
 * (service-role authorization contract). The locale passed to
 * requireSuperadmin only affects the redirect target on the negative path.
 */
export type CompanyNeedIntakeActionState =
  | { ok: true; status: CompanyNeedIntakeStatus }
  | {
      ok: false;
      code: "not_admin" | "invalid" | "not_found" | "needs_migration" | "error";
      message?: string;
    };

function readStatus(
  v: FormDataEntryValue | null,
): CompanyNeedIntakeStatus | null {
  const s = (v ?? "").toString();
  return (COMPANY_NEED_INTAKE_STATUSES as readonly string[]).includes(s)
    ? (s as CompanyNeedIntakeStatus)
    : null;
}

export async function setCompanyNeedIntakeStatusAction(
  _prev: CompanyNeedIntakeActionState | null,
  formData: FormData,
): Promise<CompanyNeedIntakeActionState> {
  await requireSuperadmin("lt");

  const id = String(formData.get("intake_id") ?? "").trim();
  const status = readStatus(formData.get("status"));
  if (!id || !status) {
    return { ok: false, code: "invalid" };
  }

  const r = await setCompanyNeedIntakeStatus(id, status);
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
