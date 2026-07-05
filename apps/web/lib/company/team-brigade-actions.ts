"use server";

import "server-only";

import { createTeamBrigade, type CreateTeamOutcome } from "./team-brigades";

/**
 * Server action for the company-room team/brigade panel (§8.3 minimum).
 *
 * Creation is the ONLY new write this wagon adds app-side — and it goes
 * through the gated create_team_v1 RPC. Adding a member to a team reuses the
 * EXISTING canonical addOrgMember action (lib/operations/org-membership.ts)
 * directly from the panel: a team IS an organization, so team membership IS
 * org membership on engagement_contexts. No duplicate membership path.
 */
export async function createTeamAction(
  name: string,
): Promise<{ outcome: CreateTeamOutcome }> {
  const { outcome } = await createTeamBrigade(name);
  return { outcome };
}
