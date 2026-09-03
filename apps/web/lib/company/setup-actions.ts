"use server";

import { revalidatePath } from "next/cache";

import { saveCompanySetup } from "./company-setup";
import { getActiveOrganizationContext } from "./active-organization";
import { declareOrganizationCapabilities } from "@/lib/organizations/capability-actions";

/**
 * Company setup server action (tagged-return convention, mirrors
 * saveBuyerSetupAction). The form posts FormData; we never throw a raw
 * Error across the server-action boundary because Next.js strips messages
 * in prod (project memory: labourmarketai-server-action-digest).
 */
export type CompanySetupFormState =
  | { ok: true; companyId: string; submitted: boolean }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "invalid"
        | "invalid_country"
        | "duplicate_company"
        | "not_owner"
        | "multiple_companies"
        | "error";
      message?: string;
    };

export async function saveCompanySetupAction(
  _prev: CompanySetupFormState | null,
  formData: FormData,
): Promise<CompanySetupFormState> {
  // The submit button sets intent=submit; the "save draft" button sets
  // intent=draft. Anything else is treated as a draft (never a request).
  const submitted = String(formData.get("intent") ?? "") === "submit";

  // M-P0-2 explicit target: "" (or absent) = legacy singleton; "new" = create
  // a NEW company (insert-only); a uuid = edit exactly that company. The RPC
  // re-verifies ownership server-side — a forged id fails with not-owner.
  const rawCompanyId = String(formData.get("company_id") ?? "").trim();
  const companyId: string | null | undefined =
    rawCompanyId === "" ? undefined : rawCompanyId === "new" ? null : rawCompanyId;

  const r = await saveCompanySetup({
    companyId,
    legalName: String(formData.get("legal_name") ?? ""),
    companyType: formData.get("company_type")?.toString(),
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
  if (r.kind === "invalid-country") return { ok: false, code: "invalid_country" };
  if (r.kind === "duplicate-company") return { ok: false, code: "duplicate_company" };
  if (r.kind === "not-owner") return { ok: false, code: "not_owner" };
  if (r.kind === "multiple-companies") return { ok: false, code: "multiple_companies" };
  // Generic failure: the localized form copy carries the user-facing text;
  // no raw technical message crosses the boundary.
  if (r.kind === "error") return { ok: false, code: "error" };

  // First-run router: an education institution declares its capability the
  // moment its organisation exists, so the institution home (invite learners)
  // is reachable without a second screen. Closed vocabulary; the declaration
  // path is the same self-declarable one the company page's capability card
  // uses. Best-effort: the card still offers it if the organisation cannot
  // be resolved yet — never a fake "declared".
  const capability = String(formData.get("capability") ?? "").trim();
  if (capability === "training_provider") {
    try {
      const ctx = await getActiveOrganizationContext();
      const orgId =
        ctx.organizations.find((o) => o.legacyCompanyId === r.companyId)?.id ??
        null;
      if (orgId) await declareOrganizationCapabilities(orgId, [capability]);
    } catch (e) {
      console.error("[saveCompanySetupAction] capability preset failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, companyId: r.companyId, submitted };
}
