import "server-only";

import { listProfileSkillClaims } from "@/lib/profile/profile-skill-claims";

/**
 * Product Signal Connection v1 (PR #480).
 *
 * One honest skill-signal summary shared by My Work View and the Labour Market
 * World Map, so an ACCEPTED suggestion (#478 → profile_skill_claims, self-
 * declared) actually lights up those surfaces — instead of living only on the
 * profile. Read-only union of the worker's capability tiers + self-declared
 * claims; no DB change, no verification, no fabricated counts.
 */

export interface CapabilityTierCounts {
  /** worker_skills.verified — confirmed by a person. */
  readonly confirmed: number;
  /** journal-evidence supported (work_journal). */
  readonly suggested: number;
  /** declared only. */
  readonly self_declared: number;
}

export interface ConnectedSkillSignal {
  readonly confirmed: number;
  readonly supported: number;
  /** declared capabilities + accepted self-declared claims. */
  readonly selfDeclared: number;
  /** accepted self-declared claims (subset of selfDeclared). */
  readonly claims: number;
  readonly total: number;
}

/** Pure merge: capability tiers + accepted self-declared claim count. Claims
 *  are ALWAYS self-declared — never promoted to supported/confirmed. */
export function mergeSkillSignal(
  caps: CapabilityTierCounts,
  claimCount: number,
): ConnectedSkillSignal {
  const claims = Math.max(0, Math.floor(claimCount) || 0);
  const selfDeclared = caps.self_declared + claims;
  return {
    confirmed: caps.confirmed,
    supported: caps.suggested,
    selfDeclared,
    claims,
    total: caps.confirmed + caps.suggested + selfDeclared,
  };
}

/** The signed-in user's accepted self-declared claim count (RLS owner-only). */
export async function getOwnAcceptedClaimCount(): Promise<number> {
  const claims = await listProfileSkillClaims();
  return claims.length;
}