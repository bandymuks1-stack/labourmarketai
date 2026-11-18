import { describe, expect, it } from "vitest";

import { NO_PROJECT, chosenProject, projectChoices, rowsForProject } from "@/lib/journal/review-project-filter";

const rows = [
  { id: "e1", projectId: "p1", projectName: "Banquet week" },
  { id: "e2", projectId: null, projectName: null },
  { id: "e3", projectId: "p2", projectName: null },
  { id: "e4", projectId: "p1", projectName: null },
];

describe("review queue by project", () => {
  it("one choice per project with its real count, then the entries with no project", () => {
    expect(projectChoices(rows)).toEqual([
      { value: "p1", name: "Banquet week", count: 2 },
      { value: "p2", name: null, count: 1 },
      { value: NO_PROJECT, name: null, count: 1 },
    ]);
  });

  it("no 'no project' choice when every entry has a project", () => {
    expect(projectChoices(rows.filter((r) => r.projectId)).some((c) => c.value === NO_PROJECT)).toBe(false);
  });

  it("the counts add up to the queue: nothing is hidden", () => {
    expect(projectChoices(rows).reduce((n, c) => n + c.count, 0)).toBe(rows.length);
  });

  it("narrows to one project, or to the entries without one", () => {
    expect(rowsForProject(rows, "p1").map((r) => r.id)).toEqual(["e1", "e4"]);
    expect(rowsForProject(rows, NO_PROJECT).map((r) => r.id)).toEqual(["e2"]);
    expect(rowsForProject(rows, null)).toHaveLength(4);
  });

  it("a stale or foreign value shows everything, never an empty queue", () => {
    const choices = projectChoices(rows);
    expect(chosenProject("not-in-this-queue", choices)).toBeNull();
    expect(chosenProject(undefined, choices)).toBeNull();
    expect(chosenProject(["p2", "p1"], choices)).toBe("p2");
    expect(chosenProject(NO_PROJECT, choices)).toBe(NO_PROJECT);
    expect(chosenProject(NO_PROJECT, projectChoices(rows.filter((r) => r.projectId)))).toBeNull();
  });
});
