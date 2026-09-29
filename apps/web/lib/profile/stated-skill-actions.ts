"use server";

import "server-only";

import { saveProfileSkillClaimsAction } from "@/lib/profile/profile-skill-claims-actions";
import { promoteConfirmedClaimsAction } from "@/lib/profile/claim-catalog-promotion-actions";

/**
 * A SKILL SAID IN CHAT, SAVED THROUGH THE PROFILE'S OWN PATH (2026-09-29).
 * The same two calls the profile's text-first flow makes after the person
 * confirms a chip: the words become the person's own skill claim
 * (`profile_skill_claims`), then a best-effort promotion to a catalogued
 * `worker_skills` row where the shared lexicon maps it. No new write; the
 * answer reports what the calls returned.
 */
export type SaveStatedSkillResult =
  | {
      readonly ok: true;
      readonly saved: boolean;
      /** Catalogued skills inserted / already held / outside the person's directions. */
      readonly promoted: number;
      readonly alreadySaved: number;
      readonly outsideDirections: number;
    }
  | { readonly ok: false };

export async function saveStatedSkillAction(phrase: string): Promise<SaveStatedSkillResult> {
  const words = (phrase ?? "").trim();
  if (words.length < 3 || words.length > 200) return { ok: false };
  try {
    const rows = await saveProfileSkillClaimsAction([words]);
    let promo = { promoted: 0, alreadySaved: 0, skippedOutsideDirections: 0 };
    try {
      promo = await promoteConfirmedClaimsAction([words]);
    } catch {
      // the profile flow treats promotion as best-effort too
    }
    return {
      ok: true,
      saved: rows.length > 0,
      promoted: promo.promoted,
      alreadySaved: promo.alreadySaved,
      outsideDirections: promo.skippedOutsideDirections,
    };
  } catch {
    return { ok: false };
  }
}
