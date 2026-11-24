import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc,
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setStageResponsibleAction } from "@/lib/projects/stages-actions";
import {
  buildResponsibleOptions,
  responsibleDisplayName,
  responsibleNameMap,
  responsibleOutcomeKey,
  UNREADABLE_NAME,
} from "@/lib/projects/stage-responsible";
import { buildActivityTimeline } from "@/lib/projects/stage-gantt";
import type { ProjectStage } from "@/lib/projects/stages-model";

const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";
const STAGE = "33333333-3333-4333-8333-333333333333";

describe("responsible options — only eligible engagements, never raw ids", () => {
  it("dedupes, drops malformed ids, keeps order", () => {
    const o = buildResponsibleOptions([
      { engagementId: E1, name: "Ona" },
      { engagementId: E1, name: "Ona again" },
      { engagementId: "not-a-uuid", name: "Ghost" },
      { engagementId: E2, name: "  Jonas  " },
    ]);
    expect(o).toEqual([
      { engagementId: E1, name: "Ona" },
      { engagementId: E2, name: "Jonas" },
    ]);
  });

  it("an unreadable name is the dash, never an id", () => {
    const o = buildResponsibleOptions([{ engagementId: E1, name: "" }]);
    expect(o[0].name).toBe(UNREADABLE_NAME);
    expect(responsibleDisplayName(o, E1)).toBeNull();
    expect(responsibleNameMap(o).size).toBe(0);
  });

  it("resolves the current responsible's display name; unset or ineligible → null", () => {
    const o = buildResponsibleOptions([{ engagementId: E1, name: "Ona" }]);
    expect(responsibleDisplayName(o, E1)).toBe("Ona");
    expect(responsibleDisplayName(o, null)).toBeNull();
    expect(responsibleDisplayName(o, E2)).toBeNull();
  });
});

describe("outcome mapping", () => {
  it("maps results to honest states", () => {
    expect(responsibleOutcomeKey({ ok: true })).toBe("saved");
    expect(responsibleOutcomeKey({ ok: false, code: "needs_migration" })).toBe("needs_migration");
    expect(responsibleOutcomeKey({ ok: false, code: "not_authorized" })).toBe("not_authorized");
    expect(responsibleOutcomeKey({ ok: false, code: "invalid" })).toBe("invalid");
    expect(responsibleOutcomeKey({ ok: false, code: "weird" })).toBe("error");
  });
});

describe("setStageResponsibleAction — refusal mapping and degradation", () => {
  it("rejects malformed ids before any RPC", async () => {
    rpc.mockClear();
    expect(await setStageResponsibleAction({ stageId: "x", engagementId: null })).toEqual({
      ok: false,
      code: "invalid",
    });
    expect(
      await setStageResponsibleAction({ stageId: STAGE, engagementId: "nope" }),
    ).toEqual({ ok: false, code: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("clears with NULL when no engagement is given", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    const r = await setStageResponsibleAction({ stageId: STAGE, engagementId: "" });
    expect(r).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("set_project_stage_responsible_v1", {
      p_stage_id: STAGE,
      p_engagement_id: null,
    });
  });

  it.each([
    [{ code: "42883", message: "x" }, "needs_migration"],
    [{ code: "PGRST202", message: "x" }, "needs_migration"],
    [{ code: "42501", message: "x" }, "not_authorized"],
    [{ code: "P0001", message: "not authorized to manage this project" }, "not_authorized"],
    [{ code: "P0001", message: "responsible engagement does not belong to this project organization" }, "invalid"],
  ])("RPC error %j → %s", async (error, code) => {
    rpc.mockResolvedValueOnce({ error });
    const r = await setStageResponsibleAction({ stageId: STAGE, engagementId: E1 });
    expect(r).toEqual({ ok: false, code });
  });
});

describe("timeline responsible column for stages", () => {
  const stage = (over: Partial<ProjectStage>): ProjectStage => ({
    id: STAGE,
    name: "Foundations",
    stageOrder: 1,
    status: "planned",
    plannedStart: "2026-10-01",
    plannedEnd: "2026-10-10",
    actualStart: null,
    actualEnd: null,
    blockedReason: null,
    completionCriteria: null,
    ...over,
  });
  const build = (s: ProjectStage, names?: ReadonlyMap<string, string>) =>
    buildActivityTimeline({
      projectId: "p1",
      stages: [s],
      tasks: [],
      waitingOnByTask: {},
      stageResponsibleNames: names,
      meProfileId: null,
      people: [],
      memberNameByProfileId: new Map(),
      todayIso: "2026-10-02",
    }).stages[0];

  it("shows the readable name as plain text (no link)", () => {
    const row = build(
      stage({ responsibleEngagementId: E1 }),
      new Map([[E1, "Ona"]]),
    );
    expect(row.responsible).toEqual({ kind: "named", name: "Ona", href: null });
  });

  it("unset, unreadable or unknown → null (the dash), never a guess", () => {
    expect(build(stage({}), new Map([[E1, "Ona"]])).responsible).toBeNull();
    expect(build(stage({ responsibleEngagementId: E1 }), new Map()).responsible).toBeNull();
    expect(build(stage({ responsibleEngagementId: E1 })).responsible).toBeNull();
  });
});
