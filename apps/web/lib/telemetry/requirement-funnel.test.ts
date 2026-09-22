import { describe, expect, it } from "vitest";

import {
  FUNNEL_EVENTS,
  REQUIREMENT_STATUSES,
  type RequirementStatus,
} from "./funnel-events";
import {
  REQUIREMENT_ACTIVE_STATUSES,
  isRequirementActivatedStatus,
  isRequirementStatus,
  requirementFunnelEvents,
} from "./requirement-funnel";

/**
 * The ONE mapping from a stored requirement's status to the bounded events
 * the write emits (employer funnel closure, owner §23, 2026-09-22).
 */
describe("requirementFunnelEvents", () => {
  it("a submitted requirement emits the write AND the activation, in that order", () => {
    expect(requirementFunnelEvents("submitted")).toEqual([
      FUNNEL_EVENTS.demandSaved,
      FUNNEL_EVENTS.requirementActivated,
    ]);
  });

  it("an approved requirement is live for workers too", () => {
    expect(requirementFunnelEvents("approved")).toEqual([
      FUNNEL_EVENTS.demandSaved,
      FUNNEL_EVENTS.requirementActivated,
    ]);
  });

  it("every other status emits the write only — never an activation it did not observe", () => {
    for (const status of ["draft", "in_review", "needs_followup", "closed"] as const) {
      expect(requirementFunnelEvents(status), status).toEqual([FUNNEL_EVENTS.demandSaved]);
    }
  });

  it("is never empty for any status in the closed set", () => {
    for (const status of REQUIREMENT_STATUSES) {
      expect(requirementFunnelEvents(status).length).toBeGreaterThan(0);
    }
  });
});

describe("the closed status set", () => {
  it("activation statuses are exactly submitted and approved", () => {
    expect([...REQUIREMENT_ACTIVE_STATUSES].sort()).toEqual(["approved", "submitted"]);
    const active = REQUIREMENT_STATUSES.filter(isRequirementActivatedStatus);
    expect([...active].sort()).toEqual(["approved", "submitted"]);
  });

  it("isRequirementStatus admits the closed set and nothing else", () => {
    for (const s of REQUIREMENT_STATUSES) expect(isRequirementStatus(s)).toBe(true);
    for (const bad of ["Submitted", "open", "", null, undefined, 1, {}, "submitted "]) {
      expect(isRequirementStatus(bad), String(bad)).toBe(false);
    }
  });

  it("mirrors the customer_requests statuses the RPCs and the lifecycle model name", () => {
    const expected: RequirementStatus[] = [
      "draft",
      "submitted",
      "in_review",
      "needs_followup",
      "approved",
      "closed",
    ];
    expect([...REQUIREMENT_STATUSES]).toEqual(expected);
  });
});
