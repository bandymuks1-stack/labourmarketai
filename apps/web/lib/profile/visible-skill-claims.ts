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
