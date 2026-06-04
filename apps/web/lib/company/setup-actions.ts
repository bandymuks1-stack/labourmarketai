"use server";

import { revalidatePath } from "next/cache";

import { saveCompanySetup } from "./company-setup";

/**
 * Company setup server action (tagged-return convention, mirrors
 * saveBuyerSetupAction). The form posts FormData; we never throw a raw
 * Error across the server-action boundary because Next.js strips messages
 * in prod (project memory: labourmarketai-server-action-digest).
 */
export type CompanySetupFormState =
  | { ok: true; companyId: string; submitted: boolean }
  | { ok: false; code: "needs_migration" | "invalid" | "error"; message?: string };

export async function saveCompanySetupAction(
  _prev: CompanySetupFormState | null,
  formData: FormData,
): Promise<CompanySetupFormState> {
  // The submit button sets intent=submit; the "save draft" button sets
  // intent=draft. Anything else is treated as a draft (never a request).
  const submitted = String(formData.get("intent") ?? "") === "submit";

  const r = await saveCompanySetup({
    legalName: String(formData.get("legal_name") ?? ""),
    country: formData.get("country")?.toString(),
    registrationCode: formData.get("registration_code")?.toString(),
    address: formData.get("address")?.toString(),
    website: formData.get("website")?.toString(),
    contactEmail: formData.get("contact_email")?.toString(),
    contactPhone: formData.get("contact_phone")?.toString(),
    requesterRole: formData.get("requester_role")?.toString(),
    submit: submitted,
  });

  if (r.kind === "needs-migration") {
    return { ok: false, code: "needs_migration" };
  }
  if (r.kind === "invalid") return { ok: false, code: "invalid", message: r.message };
  if (r.kind === "error") return { ok: false, code: "error", message: r.message };

  revalidatePath("/", "layout");
  return { ok: true, companyId: r.companyId, submitted };
}
