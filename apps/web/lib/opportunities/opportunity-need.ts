/**
 * Demand → MatchNeed for the worker side (PURE). ONE derivation shared by
 * the opportunity board loader AND the express-interest flow so the match a
 * worker sees is EXACTLY the match stored in their interest snapshot — no
 * second pipeline (guard-pinned).
 */

import { deriveNeedSkills, type NeedSkillSource } from "@/lib/market/need-skills";
import type { MatchNeed } from "@/lib/market/match-v1";

export function needFromRoleText(
  roleText: string | null,
  country: string | null,
  city: string | null = null,
): { need: MatchNeed; source: NeedSkillSource | null } {
  // Underscores/hyphens → spaces so structured work-type slugs recognise
  // through the same offline pipeline as free text.
  const derived = deriveNeedSkills({
    roleOrWorkType: (roleText ?? "").replace(/[_-]+/g, " "),
  });
  return {
    need: {
      skillIds: derived.skillSlugs,
      needSource: derived.source,
      professionSlug: derived.professionSlug,
      country,
      // Coarse place label (city/region) when the demand carries one — the
      // engine's city tier fires only when BOTH sides know their city.
      city: city && city.trim() !== "" ? city : null,
    },
    source: derived.source,
  };
}
