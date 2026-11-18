import { describe, expect, it } from "vitest";

import { isCompletedProject, summarizeOrganizationProjects } from "./organization-projects";

const row = (id: string, status: string | null, createdAt: string, title: string | null = `P ${id}`) => ({
  id,
  title,
  city: null,
  status,
  createdAt,
});

describe("the organization's projects", () => {
  it("counts running and completed apart, and nothing else", () => {
    const s = summarizeOrganizationProjects([
      row("a", "active", "2026-01-01"),
      row("b", "completed", "2026-02-01"),
      row("c", null, "2026-03-01"),
      row("d", "completed", "2026-04-01"),
    ]);
    expect(s).toMatchObject({ total: 4, running: 2, completed: 2 });
  });

  it("an unknown status is still running work, never a finished one", () => {
    expect(isCompletedProject(null)).toBe(false);
    expect(isCompletedProject("paused")).toBe(false);
    expect(isCompletedProject("completed")).toBe(true);
  });

  it("lists running first, then completed, newest first in each", () => {
    const s = summarizeOrganizationProjects([
      row("old-run", "active", "2025-01-01"),
      row("new-done", "completed", "2026-05-01"),
      row("new-run", "active", "2026-04-01"),
      row("old-done", "completed", "2025-02-01"),
    ]);
    expect(s.items.map((i) => i.id)).toEqual(["new-run", "old-run", "new-done", "old-done"]);
  });

  it("a row read twice is counted once", () => {
    const s = summarizeOrganizationProjects([row("a", "active", "2026-01-01"), row("a", "active", "2026-01-01")]);
    expect(s.total).toBe(1);
  });

  it("the list is bounded but the counts are not", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`p${String(i).padStart(2, "0")}`, "active", `2026-01-${String(i + 1).padStart(2, "0")}`));
    const s = summarizeOrganizationProjects(rows, 5);
    expect(s.items).toHaveLength(5);
    expect(s.running).toBe(20);
  });

  it("an untitled project keeps no invented name", () => {
    const s = summarizeOrganizationProjects([row("a", "active", "2026-01-01", "  ")]);
    expect(s.items[0]!.title).toBeNull();
  });

  it("carries no person, no hours and no skill", () => {
    const s = summarizeOrganizationProjects([row("a", "completed", "2026-01-01")]);
    expect(Object.keys(s.items[0]!).sort()).toEqual(["city", "completed", "id", "title"]);
  });
});
