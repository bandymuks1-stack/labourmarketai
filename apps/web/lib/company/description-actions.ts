"use server";

/**
 * Organization description write path (W4 Slice 3; workspace-scoped by the
 * M-P0-4 consumer slice, §11).
 *
 * `organizations.description` is the public business page's main content
 * block. The write travels through the ACTIVE WORKSPACE's company row via
 * `set_company_description_v1` (SECURITY DEFINER, `owns_company` = creator or
 * active owner/admin; description only, ≤ 2000); the SECURITY DEFINER mirror
 * trigger propagates `description` into `organizations`. Production grants
 * `authenticated` no UPDATE on `companies`, so the former direct UPDATE never
 * saved — it remains only as the fallback while the function is absent.
 *
 * BEFORE §11 this was the last workspace-BLIND company write: it looked the
 * company up by the caller's profile as a singleton — a read that ERRORS once
 * a profile owns two companies and ignores which workspace the person
 * explicitly selected. Now the company comes from
 * `requireEmployerCompany()` (validated durable workspace → membership truth)
 * and the write is gated on the `manage-company-profile` capability
 * (owner/admin only — a manager runs operations, not company identity).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ORG_DESCRIPTION_MAX } from "@/lib/company/org-display";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import { refuseStaleWorkspace } from "@/lib/company/stale-workspace";

const UNDEFINED_FUNCTION_CODES = new Set(["42883", "PGRST202"]);

export type SaveOrgDescriptionResult =
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "not-authenticated" }
  | { kind: "no-company" }
  | { kind: "error" };

export async function saveOrganizationDescriptionAction(
  description: string,
  locale: string,
  expectedWorkspaceId?: string,
): Promise<SaveOrgDescriptionResult> {
  await refuseStaleWorkspace(expectedWorkspaceId);
  const value = description.trim().slice(0, ORG_DESCRIPTION_MAX + 1);
  if (value.length > ORG_DESCRIPTION_MAX) return { kind: "invalid" };

  const company = await requireEmployerCompany();
  if (!company.ok) {
    return company.reason === "unauthenticated"
      ? { kind: "not-authenticated" }
      : { kind: "no-company" };
  }
  if (!hasOrganizationCapability(company.role, "manage-company-profile")) {
    return { kind: "no-company" };
  }

  const supabase = await createClient();
  const nextDescription = value === "" ? null : value;
  // The one write path: `set_company_description_v1` (SECURITY DEFINER) admits
  // exactly `owns_company` — the creator or an active owner/admin member, the
  // set this capability names — writes the description only, and the existing
  // mirror trigger carries it to the organization's public page. While that
  // migration is unapplied the function is absent (42883 / PGRST202) and the
  // previous direct UPDATE runs instead, so this code deploys before the apply.
  // Not in the generated types until the migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viaRpc = await (supabase as any).rpc("set_company_description_v1", {
    p_company_id: company.companyId,
    p_description: nextDescription,
  });
  let error = viaRpc.error;
  if (error && UNDEFINED_FUNCTION_CODES.has(error.code ?? "")) {
    // RLS (`companies_update`: profile_id = auth.uid()) still re-validates the
    // writer server-side — a wrong id can only fail, never cross a tenant.
    ({ error } = await supabase
      .from("companies")
      .update({ description: nextDescription })
      .eq("id", company.companyId));
  }
  if (error) return { kind: "error" };

  const safeLocale = /^[a-z]{2}$/.test(locale) ? locale : "lt";
  revalidatePath(`/${safeLocale}/dashboard/company`);
  return { kind: "ok" };
}
