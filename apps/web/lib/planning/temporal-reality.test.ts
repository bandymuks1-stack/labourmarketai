import { describe, expect, it } from "vitest";

import {
  detectConflicts,
  planningMeta,
  type PlanningItem,
} from "@/lib/planning/planning-model";
import { temporalReality } from "@/lib/planning/temporal-reality";

function item(over: Partial<PlanningItem> & { readonly id: string }): PlanningItem {
  return {
    sourceType: "booking",
    sourceId: over.id,
    label: null,
    detail: null,
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    status: "accepted",
    statusKey: "bookings.status.accepted",
    href: "/dashboard/bookings",
    roleContext: "incoming",
    ...planningMeta(),
    ...over,
  };
}

describe("temporalReality — the calendar's one honest rule", () => {
  it("a journal entry is OBSERVED — it happened", () => {
    expect(temporalReality(item({ id: "j", sourceType: "journal", status: "recorded" }))).toBe(
      "observed",
    );
  });

  it("no date is UNKNOWN — never today, never zero", () => {
    expect(
      temporalReality(item({ id: "t", sourceType: "task", startDate: null, endDate: null })),
    ).toBe("unknown");
    expect(
      temporalReality(item({ id: "j", sourceType: "journal", startDate: null, endDate: null })),
    ).toBe("unknown");
  });

  it("COMMITTED is exactly the conflict-eligible set — the two rules cannot disagree", () => {
    const committed = [
      item({ id: "b", sourceType: "booking", status: "accepted", roleContext: "incoming" }),
      item({ id: "p", sourceType: "project", status: "active", roleContext: "assigned" }),
      item({ id: "a", sourceType: "absence", status: "approved" }),
      item({ id: "r", sourceType: "trip", status: "approved" }),
    ];
    for (const c of committed) expect(temporalReality(c), c.id).toBe("committed");
    // and every pair of them on the same days is a real conflict
    expect(detectConflicts(committed).length).toBe(6);
  });

  it("a plan is never painted as an observation or a commitment", () => {
    const planned = [
      item({ id: "b1", sourceType: "booking", status: "proposed", roleContext: "incoming" }),
      item({ id: "b2", sourceType: "booking", status: "accepted", roleContext: "outgoing" }),
      item({ id: "p", sourceType: "project", status: "active", roleContext: "managed" }),
      item({ id: "t", sourceType: "task", status: "open", roleContext: "mine" }),
      item({ id: "f", sourceType: "finance", status: "due" }),
      item({ id: "i", sourceType: "invitation", status: "pending" }),
      item({ id: "s", sourceType: "stage", status: "planned" }),
      item({ id: "a", sourceType: "absence", status: "requested" }),
    ];
    for (const p of planned) expect(temporalReality(p), p.id).toBe("planned");
  });
});
