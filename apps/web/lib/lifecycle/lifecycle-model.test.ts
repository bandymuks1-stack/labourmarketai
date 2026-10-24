import { describe, expect, it } from "vitest";

import {
  collapseDuplicateLifecycleRows,
  type LifecycleMemberRow,
} from "@/lib/lifecycle/lifecycle-model";

const row = (over: Partial<LifecycleMemberRow>): LifecycleMemberRow => ({
  engagementId: "ec-1",
  profileId: "p-owner",
  name: "Owner",
  relationshipSlug: "owner",
  engagementStatus: "active",
  stage: "active",
  probationUntil: null,
  endedReason: null,
  isRegisteredOwner: true,
  openOnboardingRunId: null,
  openOffboardingRunId: null,
  ...over,
});

describe("collapseDuplicateLifecycleRows — one person, one row per relationship (UX review 2026-10-24, row 3.23)", () => {
  it("the owner's duplicate plain owner engagement is listed once, in its first place", () => {
    const rows = [
      row({ engagementId: "ec-a" }),
      row({ engagementId: "ec-w", profileId: "p-worker", name: "Worker", relationshipSlug: "employee", isRegisteredOwner: false }),
      row({ engagementId: "ec-b" }),
    ];
    expect(collapseDuplicateLifecycleRows(rows).map((r) => r.engagementId)).toEqual(["ec-a", "ec-w"]);
  });

  it("the same person under a DIFFERENT relationship is a different row", () => {
    const rows = [row({ engagementId: "ec-a" }), row({ engagementId: "ec-b", relationshipSlug: "employee" })];
    expect(collapseDuplicateLifecycleRows(rows)).toHaveLength(2);
  });

  it("a duplicate that carries lifecycle work of its own is never folded away", () => {
    const rows = [
      row({ engagementId: "ec-a" }),
      row({ engagementId: "ec-b", openOnboardingRunId: "run-1" }),
      row({ engagementId: "ec-c", stage: "probation" }),
      row({ engagementId: "ec-d", openOffboardingRunId: "run-2" }),
    ];
    expect(collapseDuplicateLifecycleRows(rows).map((r) => r.engagementId)).toEqual([
      "ec-a",
      "ec-b",
      "ec-c",
      "ec-d",
    ]);
  });

  it("ended engagements are history and always stay", () => {
    const rows = [
      row({ engagementId: "ec-a" }),
      row({ engagementId: "ec-b", engagementStatus: "ended", stage: "ended" }),
      row({ engagementId: "ec-c", engagementStatus: "ended", stage: "ended" }),
    ];
    expect(collapseDuplicateLifecycleRows(rows)).toHaveLength(3);
  });

  it("is pure: the input is not mutated", () => {
    const rows = [row({ engagementId: "ec-a" }), row({ engagementId: "ec-b" })];
    const copy = JSON.stringify(rows);
    collapseDuplicateLifecycleRows(rows);
    expect(JSON.stringify(rows)).toBe(copy);
  });
});
