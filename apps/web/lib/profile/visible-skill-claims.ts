import type { SkillPresentation } from "@/lib/cv-export/skill-presentation";

/**
 * The free-label skill claims a profile section shows: the server's current
 * rows (the `claims` prop, re-read on every `router.refresh()`), minus the ids
 * this session has just removed and the refresh has not caught up with yet.
 *
 * Why a derivation and not `useState(claims)`: state seeded from a prop keeps
 * its first value. After a manual add, `router.refresh()` delivered the new
 * row in `claims`, but the section kept rendering the stale seeded list, so
 * the new chip never appeared until a full reload. Production walk
 * profile-cv-history P-13 (runs 40169213003 and 40175731734): the server
 * re-read the list two seconds after the 201 insert, and the chip still did
 * not show.
 */
export function visibleSkillClaims<T extends { readonly id: string }>(
  claims: readonly T[],
  removedIds: ReadonlySet<string>,
): T[] {
  return claims.filter((c) => !removedIds.has(c.id));
}

/** One chip in the profile's self-stated skills list. */
export type SkillClaimChip = {
  readonly key: string;
  readonly label: string;
  /** Every saved claim id this chip stands for (removal covers them all). */
  readonly ids: string[];
  readonly variants: readonly string[];
};

/**
 * The chips the profile's skills list shows for the claims it holds.
 *
 * Without a presentation: one chip per claim. With one: one chip per folded
 * self-stated item, and a claim the presentation does not account for at all
 * (in no item of any tier) shows as its own chip. That is a claim saved after
 * the presentation was built: the save answers with the stored row (held by
 * `useSavedRows`), while the presentation arrives only with the refreshed
 * page, which commits as one piece after its slowest read. Production walk
 * profile-cv-history P-13, run 44637832323: the save answered, the chip did
 * not show in 30 s, a reload showed it.
 *
 * A claim folded into a catalogued skill carries its id on that skill's item,
 * so it is accounted for and never shown twice. PURE.
 */
export function skillClaimChips(
  presentation: SkillPresentation | null,
  claims: readonly { readonly id: string; readonly label: string }[],
): SkillClaimChip[] {
  const own = (c: { readonly id: string; readonly label: string }): SkillClaimChip => ({
    key: c.id,
    label: c.label,
    ids: [c.id],
    variants: [c.label],
  });
  if (!presentation) return claims.map(own);
  const held = new Set(claims.map((c) => c.id));
  const accounted = new Set(presentation.groups.flatMap((g) => g.items.flatMap((it) => it.claimIds)));
  const folded = (presentation.groups.find((g) => g.tier === "self_stated")?.items ?? [])
    .map((it) => ({ key: it.key, label: it.name, ids: it.claimIds.filter((id) => held.has(id)), variants: it.variants }))
    .filter((it) => it.ids.length > 0);
  return [...folded, ...claims.filter((c) => !accounted.has(c.id)).map(own)];
}
