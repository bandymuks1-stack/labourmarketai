/**
 * THE COMPANY'S PEOPLE WHO ARE IN NO TEAM - pure, from what the teams panel
 * already holds. Each team carries `addable`: the company's people who are not
 * members of THAT team, with the names the invite picker shows. A person who
 * is addable to every team and a member of none is outside all teams.
 *
 * `null` = UNKNOWN: some team's list could not be read, so "in no team" cannot
 * be said for anyone. The caller then shows no such group; an unreadable list
 * is never rendered as "everyone is in a team".
 */
type Team = {
  readonly members: readonly { readonly profileId: string }[];
  readonly addable: readonly { readonly profileId: string; readonly name: string }[] | null;
};

export function peopleOutsideTeams(
  teams: readonly Team[],
): readonly { profileId: string; name: string }[] | null {
  if (teams.some((t) => t.addable === null)) return null;
  const inSomeTeam = new Set(teams.flatMap((t) => t.members.map((m) => m.profileId)));
  const out = new Map<string, { profileId: string; name: string }>();
  for (const t of teams) {
    for (const p of t.addable ?? []) {
      if (!p.profileId || inSomeTeam.has(p.profileId) || out.has(p.profileId)) continue;
      out.set(p.profileId, { profileId: p.profileId, name: p.name });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
