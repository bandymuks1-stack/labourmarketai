import "server-only";

import { redirect } from "next/navigation";

import { readActiveRoleRows } from "@/lib/auth/profile-roles";
import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { workspaceOpensCompanySpace } from "@/lib/company/organization-authority";
import { createClient } from "@/lib/supabase/server";

import { untypedClient } from "./evidence-store";

/**
 * Does the signed-in person hold a LIVE history read grant
 * (20261124053000_history_read_grant_v1)? Read through their own session
 * (`my_history_read_grants_v1`, which only ever lists the caller's own,
 * unrevoked, unexpired grants). Any error, or the function not deployed,
 * is "no": the gate fails closed.
 */
export async function hasLiveHistoryReadGrant(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await untypedClient(supabase).rpc("my_history_read_grants_v1");
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * The gate of the two history pages (`isHistoryGrantPath`).
 *
 *   "full"  - the person may use the company space exactly as today (the held
 *             `company` role, or a workspace that opens the company space).
 *   "grant" - no company space, but a live read grant: the page renders its
 *             READ-ONLY content only (no import, correction, duplicate review,
 *             photo import, performing-company or document controls).
 *
 * Without either, `requireRoleOrRedirect` runs exactly as before and
 * redirects, so a person without a grant sees today's behaviour unchanged.
 */
export async function requireCompanyOrHistoryGrant(locale: string): Promise<"full" | "grant"> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const roles = new Set((await readActiveRoleRows(supabase, user.id)).map((r) => r.role as string));
  if (roles.has("company") || workspaceOpensCompanySpace(await getWorkspaceContext())) return "full";
  if (await hasLiveHistoryReadGrant()) return "grant";
  await requireRoleOrRedirect(locale, "company");
  return "full";
}
