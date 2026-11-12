import { getTranslations } from "next-intl/server";

import { StructureTree, type StructureNode } from "@/components/ui/StructureTree";
import type { TeamBrigade } from "@/lib/company/team-brigades";

/**
 * THE COMPANY'S TEAM STRUCTURE, read from what the people door already holds:
 * company → teams → people, plus the company's people who are in no team.
 *
 * A view only. It reads no new data and stores nothing: the teams are the ones
 * the teams panel lists for this person, the people are the active roster the
 * page already read. A team (a shift, a care team, a crew) has no stored link
 * to a parent team, so this is two levels and never draws a hierarchy the data
 * does not hold. Drawn by the shared `StructureTree` (DESIGN.md §10).
 */
export async function CompanyTeamStructure({
  organizationName,
  teams,
  people,
}: {
  organizationName: string;
  teams: readonly TeamBrigade[];
  /** The company's active people (profile id + shown name). */
  people: readonly { profileId: string | null; name: string }[];
}) {
  const t = await getTranslations("teamBrigades.structure");
  const inTeam = new Set(teams.flatMap((team) => team.members.map((m) => m.profileId)));
  // A person without a profile yet (an unclaimed roster row) cannot be a team
  // member, so they are listed outside the teams, never dropped.
  const outside = people.filter((p) => !p.profileId || !inTeam.has(p.profileId));

  const teamNodes: StructureNode[] = teams.map((team) => ({
    id: `team-${team.id}`,
    label: <span className="break-words">{team.name}</span>,
    meta: t("kindTeam"),
    count: team.members.length,
    empty: t("teamEmpty"),
    children: team.members.map((m) => ({
      id: `team-${team.id}-${m.profileId}`,
      label: <span className="break-words">{m.name}</span>,
    })),
  }));
  const nodes: StructureNode[] = [
    {
      id: "company",
      label: <span className="break-words">{organizationName || t("company")}</span>,
      count: teams.length,
      meta: t("teamsCount"),
      empty: t("noTeams"),
      children: [
        ...teamNodes,
        ...(outside.length > 0
          ? [
              {
                id: "outside",
                label: t("outside"),
                count: outside.length,
                children: outside.map((p, i) => ({
                  id: `outside-${p.profileId ?? i}`,
                  label: <span className="break-words">{p.name}</span>,
                })),
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <section className="flex flex-col gap-2" data-testid="company-team-structure">
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("title")}</h2>
      <p className="text-meta leading-relaxed text-text-muted">{t("scopeNote")}</p>
      <StructureTree label={t("title")} nodes={nodes} openDepth={2} testId="company-team-tree" />
    </section>
  );
}
