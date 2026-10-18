import { describe, expect, it } from "vitest";

import {
  addTeamProjects,
  projectDisplayLabel,
  type AssignedProject,
  type ProjectLabelKey,
} from "@/lib/journal/project-attribution";
import {
  teamProjectsFromRows,
  teamScopeOf,
  viaTeamLabel,
  type TeamWorkContextRow,
} from "@/lib/projects/team-work-context-model";

const row = (o: Partial<TeamWorkContextRow>): TeamWorkContextRow => ({
  assignment_id: "a1",
  team_org_id: "team-1",
  team_name: "Brigade A",
  project_id: "p1",
  project_title: "Hall 7",
  project_org_id: "org-1",
  work_object_id: null,
  task_id: null,
  assigned_at: "2026-09-01T00:00:00Z",
  ...o,
});

describe("teamScopeOf", () => {
  it("task beats work object beats project", () => {
    expect(teamScopeOf({ work_object_id: null, task_id: null })).toBe("project");
    expect(teamScopeOf({ work_object_id: "o", task_id: null })).toBe("work_object");
    expect(teamScopeOf({ work_object_id: null, task_id: "t" })).toBe("task");
  });
});

describe("teamProjectsFromRows", () => {
  it("collapses assignments per project, keeps every team name once, earliest assignment wins", () => {
    const out = teamProjectsFromRows([
      row({ assignment_id: "a2", team_org_id: "team-2", team_name: "Brigade B", assigned_at: "2026-09-10T00:00:00Z" }),
      row({ assignment_id: "a1" }),
      row({ assignment_id: "a3", task_id: "t1" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ projectId: "p1", assignmentId: "a1", assignedAt: "2026-09-01T00:00:00Z" });
    expect(out[0]!.teamNames).toEqual(["Brigade A", "Brigade B"]);
    expect(out[0]!.teamOrgIds).toEqual(["team-2", "team-1"]);
  });
  it("sorts by title and skips rows without a project", () => {
    const out = teamProjectsFromRows([
      row({ project_id: "p2", project_title: "Yard" }),
      row({ project_id: "", project_title: "ghost" }),
      row({ project_id: "p1", project_title: "Annex" }),
    ]);
    expect(out.map((p) => p.title)).toEqual(["Annex", "Yard"]);
  });
});

describe("viaTeamLabel", () => {
  it("joins names, null when none", () => {
    expect(viaTeamLabel(["A", " B "])).toBe("A, B");
    expect(viaTeamLabel([])).toBeNull();
    expect(viaTeamLabel(["  "])).toBeNull();
  });
});

describe("addTeamProjects — the picker's source", () => {
  it("lists a team project under the project org AND the team org, labelled", () => {
    const m = addTeamProjects(new Map(), [row({})]);
    expect(m.get("org-1")).toEqual([{ id: "p1", label: "Hall 7", viaTeam: "Brigade A" }]);
    expect(m.get("team-1")).toEqual([{ id: "p1", label: "Hall 7", viaTeam: "Brigade A" }]);
  });
  it("a person assignment wins: the same project stays unlabelled", () => {
    const base = new Map<string, AssignedProject[]>([["org-1", [{ id: "p1", label: "Hall 7" }]]]);
    const m = addTeamProjects(base, [row({})]);
    expect(m.get("org-1")).toEqual([{ id: "p1", label: "Hall 7" }]);
    expect(m.get("team-1")).toHaveLength(1);
  });
  it("two teams on one project stay ONE project and carry both names; two projects stay two", () => {
    const m = addTeamProjects(new Map(), [
      row({}),
      row({ assignment_id: "a2", team_org_id: "team-2", team_name: "Brigade B" }),
      row({ assignment_id: "a3", project_id: "p2", project_title: "Annex" }),
    ]);
    const list = m.get("org-1")!;
    expect(list.map((p) => p.id)).toEqual(["p2", "p1"]); // Annex, Hall 7
    expect(list.find((p) => p.id === "p1")!.viaTeam).toBe("Brigade A, Brigade B");
  });
  it("no rows adds nothing (a failed read degrades to the person map)", () => {
    expect(addTeamProjects(new Map(), []).size).toBe(0);
  });
});

describe("projectDisplayLabel", () => {
  const t = (k: ProjectLabelKey, v: { project: string; team: string }) =>
    k === "projectViaTeam" ? `${v.project} (via team ${v.team})` : `${v.project} (client project)`;
  it("labels team projects, leaves person projects alone", () => {
    expect(projectDisplayLabel({ id: "p", label: "Hall 7", viaTeam: "Brigade A" }, t)).toBe("Hall 7 (via team Brigade A)");
    expect(projectDisplayLabel({ id: "p", label: "Hall 7" }, t)).toBe("Hall 7");
    expect(projectDisplayLabel({ id: "p", label: "Hall 7", viaTeam: null }, t)).toBe("Hall 7");
  });
});
