"use server";

/**
 * Server-action wrappers around the owner-only `profile_skill_claims`
 * helpers. Kept thin — auth, RLS, and persistence logic all live in
 * {@link ./profile-skill-claims.ts}. Client components import THIS file
 * (so Next.js wires the actions correctly); server components and other
 * server modules import the raw helpers directly.
 */

import "server-only";
import {
  saveProfileSkillClaims as _saveProfileSkillClaims,
  deleteProfileSkillClaim as _deleteProfileSkillClaim,
  type ProfileSkillClaimRow,
} from "./profile-skill-claims";

export async function saveProfileSkillClaimsAction(
  labels: string[],
): Promise<ProfileSkillClaimRow[]> {
  return _saveProfileSkillClaims(labels);
}

export async function deleteProfileSkillClaimAction(id: string): Promise<void> {
  return _deleteProfileSkillClaim(id);
}
