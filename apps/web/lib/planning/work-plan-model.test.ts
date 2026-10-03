import { describe, expect, it } from "vitest";

import {
  projectWorkPlanItem,
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
      value: { ...base, endDate: "2026-09-07", projectId: null, workObjectId: null, startTime: null, endTime: null, note: null },
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
});
