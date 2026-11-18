import { describe, expect, it } from "vitest";

import {
  projectWorkPlanItem,
  projectWorkPlanItems,
  validateWorkPlanInput,
  type WorkPlanEntry,
} from "./work-plan-model";

const ORG = "11111111-2222-4333-8444-555555555555";
const WORKER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROJECT = "99999999-8888-4777-8666-555555555555";

const base = { organizationId: ORG, workerId: WORKER, startDate: "2026-09-07", endDate: "2026-09-11" };

describe("validateWorkPlanInput — mirrors the database checks", () => {
  it("accepts a bounded, ordered window; a missing end date means one day", () => {
    const v = validateWorkPlanInput({ ...base, endDate: "" });
    expect(v).toEqual({
      ok: true,
      value: { ...base, endDate: "2026-09-07", projectId: null, workObjectId: null, startTime: null, endTime: null, note: null, recurrence: null },
    });
  });

  it("refuses an inverted window, a >366-day window, inverted or malformed times, a long note, non-UUID ids", () => {
    expect(validateWorkPlanInput({ ...base, endDate: "2026-09-01" })).toMatchObject({ ok: false, code: "window_order" });
    expect(validateWorkPlanInput({ ...base, endDate: "2027-09-10" })).toMatchObject({ ok: false, code: "window_too_long" });
    expect(validateWorkPlanInput({ ...base, startTime: "9:00" })).toMatchObject({ ok: false, code: "time" });
    expect(validateWorkPlanInput({ ...base, startTime: "17:00", endTime: "08:00" })).toMatchObject({ ok: false, code: "time_order" });
    expect(validateWorkPlanInput({ ...base, note: "x".repeat(501) })).toMatchObject({ ok: false, code: "note_too_long" });
    expect(validateWorkPlanInput({ ...base, organizationId: "org" })).toMatchObject({ ok: false, code: "organization" });
    expect(validateWorkPlanInput({ ...base, workerId: "'; drop table" })).toMatchObject({ ok: false, code: "worker" });
    expect(validateWorkPlanInput({ ...base, projectId: "not-a-uuid" })).toMatchObject({ ok: false, code: "project" });
    expect(validateWorkPlanInput({ ...base, startDate: "2026-02-30" })).toMatchObject({ ok: false, code: "start_date" });
  });

  it("keeps optional fields when valid", () => {
    const v = validateWorkPlanInput({ ...base, projectId: PROJECT, startTime: "08:00", endTime: "17:00", note: "  Objektas A  " });
    expect(v).toMatchObject({ ok: true, value: { projectId: PROJECT, startTime: "08:00", endTime: "17:00", note: "Objektas A" } });
  });
});

describe("projectWorkPlanItem — a plan is a calendar SOURCE, never a copy", () => {
  const entry: WorkPlanEntry = {
    id: "e1", organizationId: ORG, workerId: WORKER, workerName: "Jonas", projectId: PROJECT, projectTitle: "Vilniaus objektas",
    workObjectId: null, workObjectName: null, startDate: "2026-09-07", endDate: "2026-09-11", startTime: "08:00", endTime: null,
    note: null, status: "planned", createdAt: "2026-09-02T15:00:00Z",
  };

  it("projects a planned window with the real project title, the worker as counterpart, and a day-view link", () => {
    const item = projectWorkPlanItem(entry, "managed");
    expect(item).toMatchObject({
      id: "plan:e1", sourceType: "plan", sourceId: "e1", label: "Vilniaus objektas", detail: "Jonas",
      startDate: "2026-09-07", endDate: "2026-09-11", status: "planned", statusKey: "planning.planStatus.planned",
      href: "/dashboard/planning?view=day&date=2026-09-07", roleContext: "managed", startTime: "08:00", duration: "5", project: "Vilniaus objektas", counterpart: "Jonas",
    });
  });

  it("a cancelled window is not a plan any more — not projected", () => {
    expect(projectWorkPlanItem({ ...entry, status: "cancelled" }, "managed")).toBeNull();
  });

  it("falls back to the object name, then the worker, never invented copy", () => {
    expect(projectWorkPlanItem({ ...entry, projectTitle: null, workObjectName: "Sandėlis B" }, "assigned")?.label).toBe("Sandėlis B");
    expect(projectWorkPlanItem({ ...entry, projectTitle: null, workerName: null }, "assigned")?.label).toBeNull();
  });

  it("the planned worker reads where and for whom — never their own name back", () => {
    const unreadableProject = { ...entry, projectTitle: null, organizationName: "Van Dijk Bouw B.V." };
    const mine = projectWorkPlanItem(unreadableProject, "assigned");
    expect(mine?.label).toBe("Van Dijk Bouw B.V.");
    expect(mine?.detail).toBe("Van Dijk Bouw B.V.");
    expect(mine?.label).not.toBe(entry.workerName);
    expect(projectWorkPlanItem({ ...entry, projectTitle: null, workObjectName: null }, "assigned")?.label).toBeNull();
    const managed = projectWorkPlanItem(unreadableProject, "managed");
    expect(managed?.label).toBe(entry.workerName);
    expect(managed?.detail).toBe(entry.workerName);
  });
});

describe("CAL-8 — a shift pattern is a property of the plan window", () => {
  // 2026-10-26 is a Monday.
  const week = { organizationId: ORG, workerId: WORKER, startDate: "2026-10-26", endDate: "2026-11-08" };

  it("no repeat fields keep today's one-off window", () => {
    expect(validateWorkPlanInput(week)).toMatchObject({ ok: true, value: { recurrence: null } });
    expect(validateWorkPlanInput({ ...week, repeat: "none" })).toMatchObject({ ok: true, value: { recurrence: null } });
  });

  it("weekly and rotation patterns validate into the canonical rule", () => {
    expect(validateWorkPlanInput({ ...week, repeat: "weekly", weekdays: ["5", "1", "3"] })).toMatchObject({
      ok: true,
      value: { recurrence: { kind: "weekly", days: [1, 3, 5] } },
    });
    expect(validateWorkPlanInput({ ...week, repeat: "cycle", cycleOn: "4", cycleOff: "2", cycleOffset: "1" })).toMatchObject({
      ok: true,
      value: { recurrence: { kind: "cycle", on: 4, off: 2, offset: 1 } },
    });
  });

  it("an incomplete pattern and a pattern with no working day are named, never 'every day'", () => {
    expect(validateWorkPlanInput({ ...week, repeat: "weekly", weekdays: [] })).toMatchObject({ ok: false, code: "recurrence" });
    expect(validateWorkPlanInput({ ...week, repeat: "cycle", cycleOn: "4" })).toMatchObject({ ok: false, code: "recurrence" });
    expect(
      validateWorkPlanInput({ ...week, endDate: "2026-10-30", repeat: "weekly", weekdays: ["6", "7"] }),
    ).toMatchObject({ ok: false, code: "recurrence_empty" });
  });

  const rota: WorkPlanEntry = {
    id: "r1", organizationId: ORG, workerId: WORKER, workerName: "Jonas", projectId: PROJECT, projectTitle: "Vilniaus objektas",
    workObjectId: null, workObjectName: null, startDate: "2026-10-26", endDate: "2026-11-08", startTime: "07:00", endTime: "19:00",
    note: null, status: "planned", createdAt: "2026-10-23T12:00:00Z", recurrence: { kind: "cycle", on: 4, off: 2, offset: 0 },
  };

  it("projects one band per run of shift days, each linking to its own day", () => {
    const items = projectWorkPlanItems(rota, "managed");
    expect(items.map((i) => [i.startDate, i.endDate])).toEqual([
      ["2026-10-26", "2026-10-29"],
      ["2026-11-01", "2026-11-04"],
      ["2026-11-07", "2026-11-08"],
    ]);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
    expect(items.every((i) => i.sourceId === "r1" && i.sourceType === "plan")).toBe(true);
    expect(items[1]?.href).toBe("/dashboard/planning?view=day&date=2026-11-01");
  });

  it("clips to the calendar range being drawn", () => {
    const items = projectWorkPlanItems(rota, "assigned", { startDate: "2026-10-28", endDate: "2026-11-01" });
    expect(items.map((i) => [i.startDate, i.endDate])).toEqual([
      ["2026-10-28", "2026-10-29"],
      ["2026-11-01", "2026-11-01"],
    ]);
  });

  it("a window without a pattern projects exactly like projectWorkPlanItem; a cancelled rota projects nothing", () => {
    const oneOff = { ...rota, recurrence: null };
    expect(projectWorkPlanItems(oneOff, "managed")).toEqual([projectWorkPlanItem(oneOff, "managed")]);
    expect(projectWorkPlanItems({ ...rota, status: "cancelled" }, "managed")).toEqual([]);
  });
});
