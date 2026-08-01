"use server";

/**
 * Organization description write path (W4 Slice 3).
 *
 * `organizations.description` is the public business page's main content
 * block — it RENDERED publicly (business/[slug]) but had no write path
 * anywhere in the product. Organizations rows are admin-RLS + RPC-only, so
 * the honest non-admin write path is the one that already exists for every
 * other company fact: the owner's own legacy `companies` row
 * (`companies_update` RLS: profile_id = auth.uid()), whose SECURITY DEFINER
 * mirror trigger propagates `description` into `organizations`.
 *
 * Owner-only by construction (a non-owner manager has no companies row to
 * update — v1 scope, same as company setup itself). Bounded to 2000 chars.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const ORG_DESCRIPTION_MAX = 2000;

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authenticated" };

  // The caller's OWN company row — RLS enforces ownership; the mirror
  // trigger carries description into organizations.
  const { data: company, error: readError } = await supabase
    .from("companies")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (readError) return { kind: "error" };
  if (!company) return { kind: "no-company" };

  const { error } = await supabase
    .from("companies")
    .update({ description: value === "" ? null : value })
    .eq("id", company.id);
  if (error) return { kind: "error" };

  const safeLocale = /^[a-z]{2}$/.test(locale) ? locale : "lt";
  revalidatePath(`/${safeLocale}/dashboard/company`);
  return { kind: "ok" };
}
