import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readActiveProfileRoles } from "@/lib/auth/profile-roles";
import {
  getActiveOrganizationContext,
  getWorkspaceContext,
  governedActiveOrganizationId,
} from "@/lib/company/active-organization";
import { workspaceOpensCompanySpace } from "@/lib/company/organization-authority";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import type { DiscoverViewer } from "./discover-registry";

/**
 * Who is looking at Discover: held roles (profile_roles, the same signal the
 * role gates use) plus the company role a membership in the ACTIVE
 * organisation implies (same rule as `requireRoleOrRedirect`), plus the one
 * organisation capability a card depends on. Display-only: every destination
 * page still enforces its own gate. A failed role read throws (fail closed,
 * never "you hold no roles") exactly like the role gate.
 */
export async function resolveDiscoverViewer(): Promise<
  (DiscoverViewer & { userId: string }) | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const rows = await readActiveProfileRoles(() =>
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("is_active", true),
  );
  const roles = new Set<string>(rows.map((r) => r.role as string));
  if (workspaceOpensCompanySpace(await getWorkspaceContext())) {
    roles.add("company");
  }

  const capabilities = new Set<string>();
  if (roles.has("company") || roles.has("agency")) {
    try {
      const orgId = governedActiveOrganizationId(await getActiveOrganizationContext());
      if (orgId) {
        for (const c of await readOrganizationCapabilities(orgId)) capabilities.add(c);
      }
    } catch {
      // capability unknown -> the capability-gated card is simply not offered.
    }
  }
  return { userId: user.id, roles, capabilities };
}
