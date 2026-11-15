import { describe, expect, it } from "vitest";

import { projectPageTeams, teamsByPerson } from "@/lib/projects/project-page-teams";
import type { TeamAssignmentRow } from "@/lib/projects/team-assignment-model";

const row = (over: Partial<TeamAssignmentRow>): TeamAssignmentRow => ({
  id: "a1",
  teamOrgId: "t1",
  teamName: "Evening kitchen shift",
  projectId: "p1",
  workObjectId: null,
  taskId: null,
  assignedAt: "2026-11-01T08:00:00Z",
  members: [],
  ...over,
});

const ana = { profileId: "pa", workerId: "wa", name: "Ana" };
const ben = { profileId: "pb", workerId: null, name: "Ben" };

describe("projectPageTeams", () => {
  it("lists a team once, however many of its assignments are active", () => {
    const teams = projectPageTeams([
      row({ id: "a1", taskId: "k1", members: [ana] }),
      row({ id: "a2", taskId: "k2", members: [ana, ben] }),
    ]);
    expect(teams).toHaveLength(1);
    expect(teams[0]?.name).toBe("Evening kitchen shift");
    expect(teams[0]?.members.map((m) => m.name)).toEqual(["Ana", "Ben"]);
  });

  it("keeps two teams apart, in first-assigned order", () => {
    const teams = projectPageTeams([
      row({ id: "a1", teamOrgId: "t1", teamName: "Care team A", members: [ana] }),
      row({ id: "a2", teamOrgId: "t2", teamName: "Dev squad", members: [ben] }),
    ]);
    expect(teams.map((t) => t.name)).toEqual(["Care team A", "Dev squad"]);
  });

  it("never invents a name: an unreadable team name stays null", () => {
    const teams = projectPageTeams([row({ teamName: null, members: [ana] }), row({ id: "a2", teamName: "  " })]);
    expect(teams[0]?.name).toBeNull();
  });

  it("takes the name from whichever assignment carries it", () => {
    const teams = projectPageTeams([row({ teamName: null }), row({ id: "a2", teamName: "Crew 4" })]);
    expect(teams[0]?.name).toBe("Crew 4");
  });

  it("a team with no members now is still a team on the project", () => {
    expect(projectPageTeams([row({})])[0]?.members).toEqual([]);
  });
});

describe("teamsByPerson", () => {
  it("finds a person's team by profile id and by worker id", () => {
    const map = teamsByPerson([row({ members: [ana, ben] })]);
    expect(map.get("pa")).toEqual(["Evening kitchen shift"]);
    expect(map.get("wa")).toEqual(["Evening kitchen shift"]);
    expect(map.get("pb")).toEqual(["Evening kitchen shift"]);
  });

  it("a person in two teams gets both, each once", () => {
    const map = teamsByPerson([
      row({ id: "a1", teamOrgId: "t1", teamName: "Care team A", members: [ana] }),
      row({ id: "a2", teamOrgId: "t2", teamName: "Dev squad", members: [ana] }),
      row({ id: "a3", teamOrgId: "t2", teamName: "Dev squad", taskId: "k9", members: [ana] }),
    ]);
    expect(map.get("pa")).toEqual(["Care team A", "Dev squad"]);
  });

  it("a person on no team has no entry", () => {
    expect(teamsByPerson([row({ members: [ana] })]).has("someone-else")).toBe(false);
  });

  it("an unnamed team is a null entry, not a made-up label", () => {
    expect(teamsByPerson([row({ teamName: null, members: [ben] })]).get("pb")).toEqual([null]);
  });
});
