import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA Q-3 — the company home composes the reads the chat already answers with
 * and must not read the SAME rows a second time: the risk row went through
 * the project panel's detail read (stages + roster), so the home derives from
 * what that row carries; the page hands in the roster read it already awaits.
 *
 * Pinned here with real module boundaries mocked: when the risk rows carry
 * complete stages and names, `listProjectStages` / `listProjectAssignments`
 * are NOT called; when a row carries nothing usable (older producer, or a list
 * the panel's bound cut short) the canonical read still runs — the behaviour
 * the home had before is preserved exactly in that case.
 */

const h = vi.hoisted(() => ({
  listProjectStages: vi.fn(),
  listProjectAssignments: vi.fn(),
  loadProjectRiskForChat: vi.fn(),
  loadWhoIsAvailableForChat: vi.fn(),
  loadEmployerOpeningBrief: vi.fn(),
}));

vi.mock("@/lib/projects/stages", () => ({ listProjectStages: h.listProjectStages }));
vi.mock("@/lib/projects/projects", () => ({ listProjectAssignments: h.listProjectAssignments }));
vi.mock("@/lib/conversation/project-risk", () => ({ loadProjectRiskForChat: h.loadProjectRiskForChat }));
vi.mock("@/lib/conversation/capacity", () => ({ loadWhoIsAvailableForChat: h.loadWhoIsAvailableForChat }));
vi.mock("@/lib/conversation/opening-brief", () => ({ loadEmployerOpeningBrief: h.loadEmployerOpeningBrief }));

import { loadCompanyHomeField } from "@/lib/company/company-home-field";
import {
  COMPANY_HOME_PEOPLE_CHIP_LIMIT,
  carriedPeopleNames,
  carriedStages,
} from "@/lib/company/company-home-field-model";
import type { ProjectRiskRow } from "@/lib/conversation/project-risk-contract";
import { PROJECT_ASSIGNMENT_LIMIT, type ProjectStageRow } from "@/lib/projects/project-result-contract";

function stage(id: string, stageOrder: number, status: string): ProjectStageRow {
  return {
    id,
    name: `Stage ${id}`,
    status,
    stageOrder,
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    blockedReason: null,
  };
}

function riskRow(overrides: Partial<ProjectRiskRow> & Pick<ProjectRiskRow, "projectId">): ProjectRiskRow {
  return {
    title: `Project ${overrides.projectId}`,
    status: "live",
    people: 0,
    pulseKnown: true,
    tasksOpen: 0,
    tasksOverdue: 0,
    stagesBlocked: 0,
    workersWithMissingDocs: 0,
    readinessChecked: 0,
    readinessTotal: 0,
    nobodyOnLiveProject: false,
    signals: 0,
    ...overrides,
  };
}

beforeEach(() => {
  h.listProjectStages.mockReset();
  h.listProjectAssignments.mockReset();
  h.loadProjectRiskForChat.mockReset();
  h.loadWhoIsAvailableForChat.mockReset();
  h.loadEmployerOpeningBrief.mockReset();
  h.loadWhoIsAvailableForChat.mockResolvedValue({ kind: "empty" });
  h.loadEmployerOpeningBrief.mockResolvedValue({ kind: "unavailable" });
  h.listProjectStages.mockResolvedValue({ applied: true, stages: [], error: null });
  h.listProjectAssignments.mockResolvedValue([]);
});

describe("company home — no second read of what the risk row already carries", () => {
  it("performs NO listProjectStages / listProjectAssignments call when the rows carry complete stages and names", async () => {
    h.loadProjectRiskForChat.mockResolvedValue({
      kind: "ok",
      total: 2,
      rows: [
        riskRow({
          projectId: "p1",
          people: 2,
          stages: [stage("a", 1, "done"), stage("b", 2, "in_progress"), stage("c", 3, "planned")],
          stageTotal: 3,
          peopleNames: ["Jonas", "Rasa"],
        }),
        riskRow({ projectId: "p2", people: 0, stages: [], stageTotal: 0, peopleNames: [] }),
      ],
    });

    const field = await loadCompanyHomeField();

    expect(h.listProjectStages).not.toHaveBeenCalled();
    expect(h.listProjectAssignments).not.toHaveBeenCalled();
    expect(field.projects.kind).toBe("ok");
    if (field.projects.kind !== "ok") return;
    const [p1, p2] = field.projects.rows;
    // Derived from the carried stages — the same timeline the stages read gave before.
    expect(p1.timeline.now).toEqual({ kind: "in_progress", name: "Stage b", stageId: "b" });
    expect(p1.timeline.next).toMatchObject({ kind: "derived", name: "Stage c", derived: true });
    expect(p1.timeline.done).toBe(1);
    expect(p1.timeline.total).toBe(3);
    expect(p1.peopleNames).toEqual(["Jonas", "Rasa"]);
    expect(p2.timeline).toEqual({ now: { kind: "none" }, next: { kind: "none" }, done: 0, total: 0 });
    expect(p2.peopleNames).toEqual([]);
  });

  it("stages the risk read could not read (null) stay 'unavailable' — no second attempt either", async () => {
    h.loadProjectRiskForChat.mockResolvedValue({
      kind: "ok",
      total: 1,
      rows: [riskRow({ projectId: "p1", stagesBlocked: null, stages: null, stageTotal: null, peopleNames: [] })],
    });
    const field = await loadCompanyHomeField();
    expect(h.listProjectStages).not.toHaveBeenCalled();
    if (field.projects.kind !== "ok") throw new Error("expected ok");
    expect(field.projects.rows[0].timeline.now.kind).toBe("unavailable");
  });

  it("falls back to the canonical reads when a row carries nothing, or a list the panel's bound cut short", async () => {
    h.loadProjectRiskForChat.mockResolvedValue({
      kind: "ok",
      total: 2,
      rows: [
        // Older producer: no carried fields at all.
        riskRow({ projectId: "legacy", people: 1 }),
        // Carried, but sliced: 2 of 5 stages — a done/total over the slice would lie.
        riskRow({
          projectId: "long",
          people: 9,
          stages: [stage("a", 1, "done"), stage("b", 2, "done")],
          stageTotal: 5,
          // 9 people, only 3 names carried → fewer than the chips the row shows.
          peopleNames: ["A", "B", "C"],
        }),
      ],
    });
    h.listProjectStages.mockResolvedValue({
      applied: true,
      error: null,
      stages: [
        { ...stage("a", 1, "done"), completionCriteria: null },
        { ...stage("b", 2, "done"), completionCriteria: null },
        { ...stage("c", 3, "in_progress"), completionCriteria: null },
        { ...stage("d", 4, "planned"), completionCriteria: null },
        { ...stage("e", 5, "planned"), completionCriteria: null },
      ],
    });
    h.listProjectAssignments.mockResolvedValue(
      ["A", "B", "C", "D", "E", "F", "G"].map((name) => ({ workerProfileId: name, name, assignedAt: "2026-09-01" })),
    );

    const field = await loadCompanyHomeField();

    expect(h.listProjectStages.mock.calls.map((c) => c[0]).sort()).toEqual(["legacy", "long"]);
    expect(h.listProjectAssignments.mock.calls.map((c) => c[0]).sort()).toEqual(["legacy", "long"]);
    if (field.projects.kind !== "ok") throw new Error("expected ok");
    const long = field.projects.rows.find((r) => r.projectId === "long")!;
    expect(long.timeline.total).toBe(5);
    expect(long.timeline.done).toBe(2);
    expect(long.timeline.now).toEqual({ kind: "in_progress", name: "Stage c", stageId: "c" });
    expect(long.peopleNames).toHaveLength(COMPANY_HOME_PEOPLE_CHIP_LIMIT);
  });

  it("hands the page's roster read to the capacity answer; without one the capacity read runs as before", async () => {
    h.loadProjectRiskForChat.mockResolvedValue({ kind: "empty" });
    const roster = Promise.resolve({ kind: "ok" as const, rows: [] });

    await loadCompanyHomeField({ roster });
    expect(h.loadWhoIsAvailableForChat).toHaveBeenLastCalledWith({ roster });

    await loadCompanyHomeField();
    expect(h.loadWhoIsAvailableForChat).toHaveBeenLastCalledWith(undefined);
  });

  it("a failed capacity read is the named error state, never a calm empty block", async () => {
    h.loadProjectRiskForChat.mockResolvedValue({ kind: "empty" });
    h.loadWhoIsAvailableForChat.mockRejectedValue(new Error("boom"));
    const field = await loadCompanyHomeField();
    expect(field.capacity).toEqual({ kind: "error" });
  });
});

describe("carriedStages / carriedPeopleNames — the completeness rule (pure)", () => {
  it("undefined = read yourself; null = unreadable there; complete = reuse; sliced = read yourself", () => {
    expect(carriedStages({ stages: undefined, stageTotal: undefined })).toBeUndefined();
    expect(carriedStages({ stages: null, stageTotal: null })).toBeNull();
    const two = [stage("a", 1, "done"), stage("b", 2, "planned")];
    expect(carriedStages({ stages: two, stageTotal: 2 })).toBe(two);
    expect(carriedStages({ stages: two, stageTotal: 3 })).toBeUndefined();
    // A producer that carries stages but no total is not trusted as complete.
    expect(carriedStages({ stages: two, stageTotal: undefined })).toBeUndefined();
  });

  it("names are reused only when they cover every chip the row shows", () => {
    expect(carriedPeopleNames({ people: 3, peopleNames: undefined })).toBeUndefined();
    expect(carriedPeopleNames({ people: 3, peopleNames: ["A", "B", "C"] })).toEqual(["A", "B", "C"]);
    expect(carriedPeopleNames({ people: 3, peopleNames: ["A"] })).toBeUndefined();
    // More people than chips: the carried panel slice is enough for the chips.
    const eight = ["A", "B", "C", "D", "E", "F", "G", "H"];
    expect(carriedPeopleNames({ people: 20, peopleNames: eight })).toHaveLength(COMPANY_HOME_PEOPLE_CHIP_LIMIT);
    expect(carriedPeopleNames({ people: 0, peopleNames: [] })).toEqual([]);
  });

  it("the panel's roster slice always covers the home's chips — so a complete panel roster never forces a re-read", () => {
    expect(COMPANY_HOME_PEOPLE_CHIP_LIMIT).toBeLessThanOrEqual(PROJECT_ASSIGNMENT_LIMIT);
  });
});
