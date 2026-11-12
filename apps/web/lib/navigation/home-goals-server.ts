import "server-only";

import { readActiveRoleRows } from "@/lib/auth/profile-roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { workspaceOpensCompanySpace } from "@/lib/company/organization-authority";
import { resolveNeedsAudience } from "@/lib/company/agency-capability";
import type { GoalAdmission } from "@/lib/navigation/home-goals";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { createClient } from "@/lib/supabase/server";

/**
 * The two facts the home's goals (and pins) are admitted on — read through the
 * SAME request-cached readers the dashboard layout's gate already ran for this
 * request (`readActiveRoleRows`, `getWorkspaceContext`), so this costs no new
 * query and can never disagree with the gate.
 *
 * A signed-out caller holds nothing. A roles read that never answered throws
 * (the reader's own rule) and reaches the route error boundary — an unknown
 * role state is never drawn as a confident set of goals.
 */
export async function loadGoalAdmission(): Promise<GoalAdmission> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { heldRoles: [], opensCompanySpace: false };
  const [roleRows, workspace] = await Promise.all([
    readActiveRoleRows(supabase, user.id),
    getWorkspaceContext(),
  ]);
  return {
    heldRoles: roleRows.map((r) => r.role),
    opensCompanySpace: workspaceOpensCompanySpace(workspace),
  };
}

/**
 * WHICH goal home the active organization gets: the employer's (find workers
 * first) or the staffing agency's (offer your people first).
 *
 * It is the Needs door's OWN audience rule (`resolveNeedsAudience`, the ONE
 * agency rule of ORG-2: company type OR declared role, and an organization
 * that is both keeps the default it always had) — so the home's first goal
 * and the door it opens can never name two different directions (SEP-4).
 * An organization typed `agency` with no company type counts as a staffing
 * agency, as it does for the acting role.
 *
 * One small RLS read (the declared roles); an unreadable list answers "none",
 * which is the employer home — the default every organization had before.
 */
export async function loadOrganizationGoalRole(): Promise<"company" | "agency"> {
  const workspace = await getWorkspaceContext();
  const active = workspace.workspaces.find(
    (w) => w.kind === "organization" && w.id === workspace.activeWorkspaceId,
  );
  if (!active) return "company";
  let capabilities: readonly string[] = [];
  try {
    capabilities = await readOrganizationCapabilities(active.id);
  } catch {
    capabilities = [];
  }
  const companyType =
    active.companyType ?? (active.organizationType === "agency" ? "staffing_agency" : null);
  return resolveNeedsAudience({ companyType, capabilities }).audience === "offer" ? "agency" : "company";
}
