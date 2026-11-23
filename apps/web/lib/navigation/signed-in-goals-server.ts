import "server-only";

import { readActiveRoleRows } from "@/lib/auth/profile-roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { workspaceOpensCompanySpace } from "@/lib/company/organization-authority";
import type { GoalAdmission } from "@/lib/navigation/signed-in-goals";
import { EDUCATION_ROLE } from "@/lib/organizations/capabilities";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { createClient } from "@/lib/supabase/server";

/**
 * The facts the signed-in goals are admitted on (CAROUSEL_NAVIGATION_SPEC N4),
 * read through the SAME request-cached readers the dashboard layout's gate
 * already ran for this request (`readActiveRoleRows`, `getWorkspaceContext`),
 * so it can never disagree with the gate. The education capability is the
 * organization doors' own rule (`training_provider`); an unreadable list
 * answers "no education area" — the area is then reached through its door.
 *
 * A signed-out caller holds nothing. A roles read that never answered throws
 * (the reader's own rule) — an unknown role state is never drawn as a
 * confident set of cards.
 */
export async function loadGoalAdmission(): Promise<GoalAdmission> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { heldRoles: [], opensCompanySpace: false, education: false };
  const [roleRows, workspace] = await Promise.all([
    readActiveRoleRows(supabase, user.id),
    getWorkspaceContext(),
  ]);
  const opensCompanySpace = workspaceOpensCompanySpace(workspace);
  const active = workspace.workspaces.find(
    (w) => w.kind === "organization" && w.id === workspace.activeWorkspaceId,
  );
  let education = false;
  if (opensCompanySpace && active) {
    try {
      education = (await readOrganizationCapabilities(active.id)).includes(EDUCATION_ROLE);
    } catch {
      education = false;
    }
  }
  return { heldRoles: roleRows.map((r) => r.role), opensCompanySpace, education };
}
