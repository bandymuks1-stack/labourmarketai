"use server";

/**
 * Organization description write path (W4 Slice 3; workspace-scoped by the
 * M-P0-4 consumer slice, §11).
 *
 * `organizations.description` is the public business page's main content
 * block. The write travels through the ACTIVE WORKSPACE's company row
 * (`companies_update` RLS still enforces the creator; the SECURITY DEFINER
 * mirror trigger propagates `description` into `organizations`).
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

export type SaveOrgDescriptionResult =
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "not-authenticated" }
  | { kind: "no-company" }
  | { kind: "error" };

export async function saveOrganizationDescriptionAction(
  description: string,
  locale: string,
): Promise<SaveOrgDescriptionResult> {
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
  // RLS (`companies_update`: profile_id = auth.uid()) still re-validates the
  // writer server-side — a wrong id can only fail, never cross a tenant.
  const { error } = await supabase
    .from("companies")
    .update({ description: value === "" ? null : value })
    .eq("id", company.companyId);
  if (error) return { kind: "error" };

  const safeLocale = /^[a-z]{2}$/.test(locale) ? locale : "lt";
  revalidatePath(`/${safeLocale}/dashboard/company`);
  return { kind: "ok" };
}
