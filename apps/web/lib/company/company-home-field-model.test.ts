import { describe, expect, it } from "vitest";

import type { ProjectStage } from "@/lib/projects/stages-model";
import {
  attentionChipHref,
  deriveStageTimeline,
  selectOpenNeeds,
  unpackRiskSignals,
} from "@/lib/company/company-home-field-model";
import type { CustomerRequestRow } from "@/lib/buyer/customer-requests";

function stage(
  overrides: Partial<ProjectStage> & Pick<ProjectStage, "id" | "name" | "stageOrder" | "status">,
): ProjectStage {
  return {
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    blockedReason: null,
    completionCriteria: null,
    ...overrides,
  };
}

describe("deriveStageTimeline — now is a fact, next is DERIVED", () => {
  it("unavailable stages are reported as unavailable, never as 'no stages'", () => {
    const t = deriveStageTimeline(null);
    expect(t.now.kind).toBe("unavailable");
    expect(t.next.kind).toBe("unavailable");
  });

  it("now = the stage in progress; next = the first planned stage after it, marked derived", () => {
    const t = deriveStageTimeline([
      stage({ id: "c", name: "Roof", stageOrder: 3, status: "planned", plannedStart: "2026-09-22" }),
      stage({ id: "a", name: "Foundations", stageOrder: 1, status: "done" }),
      stage({ id: "b", name: "Frame", stageOrder: 2, status: "in_progress" }),
      stage({ id: "d", name: "Finishing", stageOrder: 4, status: "planned" }),
    ]);
    expect(t.now).toEqual({ kind: "in_progress", name: "Frame", stageId: "b" });
    expect(t.next).toEqual({
      kind: "derived",
      name: "Roof",
      stageId: "c",
      plannedStart: "2026-09-22",
      derived: true,
    });
    expect(t.done).toBe(1);
    expect(t.total).toBe(4);
  });

  it("a blocked stage with nothing in progress is 'now' — with its reason", () => {
    const t = deriveStageTimeline([
      stage({ id: "a", name: "Permits", stageOrder: 1, status: "blocked", blockedReason: "waiting for the municipality" }),
      stage({ id: "b", name: "Frame", stageOrder: 2, status: "planned" }),
    ]);
    expect(t.now).toEqual({ kind: "blocked", name: "Permits", stageId: "a", reason: "waiting for the municipality" });
    expect(t.next.kind).toBe("derived");
  });

  it("with nothing in progress, next is the first planned stage; cancelled stages do not count", () => {
    const t = deriveStageTimeline([
      stage({ id: "x", name: "Old plan", stageOrder: 1, status: "cancelled" }),
      stage({ id: "a", name: "Foundations", stageOrder: 2, status: "done" }),
      stage({ id: "b", name: "Frame", stageOrder: 3, status: "planned" }),
    ]);
    expect(t.now.kind).toBe("none");
    expect(t.next).toMatchObject({ kind: "derived", name: "Frame" });
    expect(t.total).toBe(2);
  });

  it("all done → now none, next none", () => {
    const t = deriveStageTimeline([stage({ id: "a", name: "Only", stageOrder: 1, status: "done" })]);
    expect(t.now.kind).toBe("none");
    expect(t.next.kind).toBe("none");
  });
});

describe("unpackRiskSignals — the chat's numbers, never a calm zero pretending to be a fact", () => {
  it("unknown pulse and unreadable stages → not known, no signals", () => {
    const r = unpackRiskSignals({
      pulseKnown: false,
      tasksOverdue: 0,
      stagesBlocked: null,
      workersWithMissingDocs: 0,
      nobodyOnLiveProject: false,
    });
    expect(r.known).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("every counted fact becomes one coded signal", () => {
    const r = unpackRiskSignals({
      pulseKnown: true,
      tasksOverdue: 2,
      stagesBlocked: 1,
      workersWithMissingDocs: 3,
      nobodyOnLiveProject: true,
    });
    expect(r.known).toBe(true);
    expect(r.signals.map((s) => s.code)).toEqual([
      "overdue_tasks",
      "blocked_stages",
      "missing_documents",
      "nobody_on_live_project",
    ]);
  });

  it("a live project with nobody on it is a known signal even without a pulse", () => {
    const r = unpackRiskSignals({
      pulseKnown: false,
      tasksOverdue: 0,
      stagesBlocked: null,
      workersWithMissingDocs: 0,
      nobodyOnLiveProject: true,
    });
    expect(r.known).toBe(true);
    expect(r.signals).toEqual([{ code: "nobody_on_live_project", count: 1 }]);
  });
});

describe("selectOpenNeeds — closed needs drop, drafts lead, bounded", () => {
  const row = (id: string, status: CustomerRequestRow["status"], updatedAt: string): CustomerRequestRow => ({
    id,
    profileId: "p",
    customerId: null,
    // These fixtures are OPEN NEEDS by construction — the demand direction.
    direction: "demand",
    title: id,
    needSummary: null,
    country: null,
    location: null,
    roleOrWorkType: null,
    teamSize: null,
    startPeriod: null,
    duration: null,
    languageRequirement: null,
    notes: null,
    payload: null,
    status,
    manualReviewNote: null,
    createdAt: updatedAt,
    updatedAt,
  });

  it("orders draft → needs_followup → submitted → in_review → approved and drops closed", () => {
    const rows = selectOpenNeeds([
      row("closed", "closed", "2026-09-05"),
      row("approved", "approved", "2026-09-05"),
      row("submitted", "submitted", "2026-09-05"),
      row("draft", "draft", "2026-09-01"),
      row("followup", "needs_followup", "2026-09-05"),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["draft", "followup", "submitted", "approved"]);
  });

  it("is bounded by the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) => row(`n${i}`, "submitted", "2026-09-05"));
    expect(selectOpenNeeds(many, 20)).toHaveLength(20);
  });
});

describe("attentionChipHref — every chip leads to a page, or is not shown", () => {
  it("link chips carry their own path", () => {
    expect(attentionChipHref("link:/dashboard/inbox")).toBe("/dashboard/inbox");
    expect(attentionChipHref("link:javascript:alert(1)")).toBeNull();
    expect(attentionChipHref("link://evil.example")).toBeNull();
    expect(attentionChipHref("link:/dashboard//inbox")).toBe("/dashboard//inbox");
  });
  it("chat-answer chips map to the page that renders the same rows", () => {
    expect(attentionChipHref("candidates")).toBe("/dashboard/company/scouting");
    expect(attentionChipHref("agency:progress")).toBe("/dashboard/company#company-agency");
  });
  it("an unknown chat-answer chip yields null (the line stays, the shortcut does not)", () => {
    expect(attentionChipHref("something-else")).toBeNull();
  });
});
