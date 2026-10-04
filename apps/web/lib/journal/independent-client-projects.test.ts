import { describe, expect, it } from "vitest";

import {
  addClientProjects,
  PERSONAL_CONTEXT_KEY,
  projectDisplayLabel,
  projectsForContext,
  type ProjectLabelKey,
} from "@/lib/journal/project-attribution";

/**
 * An INDEPENDENT person (personal / own-workspace context) with an active
 * PERSON assignment on a CLIENT organisation's project (migration
 * 20261003150700, independent_journal_context_v1) is offered that project in the
 * journal picker, labelled honestly as a client project.
 */
describe("independent person - client projects (person assignment on another organisation)", () => {
  const rows = [
    { project_id: "p1", projects: { id: "p1", title: "Client hall", organization_id: "client-org" } },
    { project_id: "p2", projects: { id: "p2", title: "Own employer job", organization_id: "employer-org" } },
  ];
  it("offers a non-member project under the personal context and each owned workspace, labelled", () => {
    const m = addClientProjects(new Map(), rows, new Set(["employer-org"]), ["own-ws"]);
    expect(m.get(PERSONAL_CONTEXT_KEY)).toEqual([{ id: "p1", label: "Client hall", clientProject: true }]);
    expect(m.get("own-ws")).toEqual([{ id: "p1", label: "Client hall", clientProject: true }]);
    expect(m.has("employer-org")).toBe(false);
  });
  it("never lists the employer's project as a client project", () => {
    const m = addClientProjects(new Map(), rows, new Set(["employer-org", "client-org"]), []);
    expect(m.size).toBe(0);
  });
  it("a project of the owned workspace itself is not a client project of that workspace", () => {
    const m = addClientProjects(new Map(), rows, new Set(), ["client-org"]);
    expect(m.get("client-org")?.some((p) => p.id === "p1") ?? false).toBe(false);
    expect(m.get(PERSONAL_CONTEXT_KEY)?.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
  it("projectsForContext maps a null organisation to the personal key", () => {
    const m = addClientProjects(new Map(), rows, new Set(), []);
    expect(projectsForContext(m, null)).toHaveLength(2);
    expect(projectsForContext(m, undefined)).toHaveLength(2);
    expect(projectsForContext(m, "other")).toEqual([]);
  });
  it("does not duplicate a project already listed for the context", () => {
    const base = new Map([[PERSONAL_CONTEXT_KEY, [{ id: "p1", label: "Client hall" }]]]);
    const m = addClientProjects(base, rows, new Set(), []);
    expect(m.get(PERSONAL_CONTEXT_KEY)?.filter((p) => p.id === "p1")).toHaveLength(1);
  });
  it("labels a client project honestly", () => {
    const t = (k: ProjectLabelKey, v: { project: string; team: string }) =>
      k === "projectClient" ? `${v.project} (client project)` : v.project;
    expect(projectDisplayLabel({ id: "p", label: "Client hall", clientProject: true }, t)).toBe(
      "Client hall (client project)",
    );
    expect(projectDisplayLabel({ id: "p", label: "Hall" }, t)).toBe("Hall");
  });
});
