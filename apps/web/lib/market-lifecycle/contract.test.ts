import { describe, expect, it } from "vitest";

import {
  ENTRY_ACTIONS,
  ENTRY_STATES,
  allowedActions,
  isPubliclyVisible,
  transition,
  visibilityReason,
  type DomainSupport,
  type EntryFacts,
} from "./contract";
import { demandAdapter, listingAdapter, serviceAdapter } from "./adapters";

const FULL: DomainSupport = { pause: true, close: true, closedOutcome: true, editPublished: true };
const f = (state: EntryFacts["state"], closedOutcome: EntryFacts["closedOutcome"] = null): EntryFacts => ({
  state,
  closedOutcome,
});

describe("the state machine (full support)", () => {
  it("offers the same words per state, in one order", () => {
    expect(allowedActions(FULL, f("draft"))).toEqual(["publish", "edit", "withdraw"]);
    expect(allowedActions(FULL, f("active"))).toEqual(["edit", "pause", "complete", "withdraw"]);
    expect(allowedActions(FULL, f("paused"))).toEqual(["edit", "resume", "complete", "withdraw"]);
    expect(allowedActions(FULL, f("closed", "completed"))).toEqual(["edit", "resume"]);
    expect(allowedActions(FULL, f("closed", "withdrawn"))).toEqual(["edit", "resume"]);
    expect(allowedActions(FULL, f("closed", null))).toEqual(["edit", "resume"]);
  });

  it("moves each action to its one target", () => {
    expect(transition(FULL, f("draft"), "publish")).toEqual({ state: "active", closedOutcome: null });
    expect(transition(FULL, f("active"), "pause")).toEqual({ state: "paused", closedOutcome: null });
    expect(transition(FULL, f("paused"), "resume")).toEqual({ state: "active", closedOutcome: null });
    expect(transition(FULL, f("active"), "complete")).toEqual({ state: "closed", closedOutcome: "completed" });
    expect(transition(FULL, f("paused"), "withdraw")).toEqual({ state: "closed", closedOutcome: "withdrawn" });
    expect(transition(FULL, f("closed", "completed"), "resume")).toEqual({ state: "active", closedOutcome: null });
  });

  it("withdrawing a draft discards it, and a discarded draft never reopens into the market", () => {
    expect(transition(FULL, f("draft"), "withdraw")).toEqual({ state: "closed", closedOutcome: "discarded" });
    expect(allowedActions(FULL, f("closed", "discarded"))).not.toContain("resume");
    expect(transition(FULL, f("closed", "discarded"), "resume")).toBeNull();
  });

  it("forbids every transition the table does not name", () => {
    expect(transition(FULL, f("draft"), "pause")).toBeNull();
    expect(transition(FULL, f("draft"), "complete")).toBeNull();
    expect(transition(FULL, f("draft"), "resume")).toBeNull();
    expect(transition(FULL, f("active"), "publish")).toBeNull();
    expect(transition(FULL, f("active"), "resume")).toBeNull();
    expect(transition(FULL, f("paused"), "pause")).toBeNull();
    expect(transition(FULL, f("closed", "completed"), "pause")).toBeNull();
    expect(transition(FULL, f("closed", "completed"), "complete")).toBeNull();
    expect(transition(FULL, f("closed", "completed"), "withdraw")).toBeNull();
  });

  it("an owner-locked entry offers nothing", () => {
    for (const state of ENTRY_STATES) {
      expect(allowedActions(FULL, { state, closedOutcome: null, ownerLocked: true })).toEqual([]);
      for (const a of ENTRY_ACTIONS) {
        expect(transition(FULL, { state, closedOutcome: null, ownerLocked: true }, a)).toBeNull();
      }
    }
  });

  it("edit keeps the state and the recorded outcome", () => {
    expect(transition(FULL, f("closed", "withdrawn"), "edit")).toEqual({ state: "closed", closedOutcome: "withdrawn" });
  });
});

describe("missing storage hides the action instead of faking it", () => {
  it("no pause support → no pause, never a close standing in for it", () => {
    const s = { ...FULL, pause: false };
    expect(allowedActions(s, f("active"))).toEqual(["edit", "complete", "withdraw"]);
  });

  it("no close support → no complete / withdraw", () => {
    const s = { ...FULL, close: false };
    expect(allowedActions(s, f("active"))).toEqual(["edit", "pause"]);
    expect(allowedActions(s, f("draft"))).toEqual(["publish", "edit"]);
  });

  it("no outcome storage → the state still changes, the outcome stays unrecorded", () => {
    const s = { ...FULL, closedOutcome: false };
    expect(transition(s, f("active"), "complete")).toEqual({ state: "closed", closedOutcome: null });
  });

  it("published text not editable → edit only on drafts", () => {
    const s = { ...FULL, editPublished: false };
    expect(allowedActions(s, f("draft"))).toContain("edit");
    expect(allowedActions(s, f("active"))).not.toContain("edit");
  });
});

describe("visibility is a function of the lifecycle and the domain's facts", () => {
  it("only active, unexpired, gate-met entries are publicly visible", () => {
    expect(isPubliclyVisible(f("active"))).toBe(true);
    expect(isPubliclyVisible(f("active"), { expired: true })).toBe(false);
    expect(isPubliclyVisible(f("active"), { accessGateMet: false })).toBe(false);
    for (const s of ["draft", "paused", "closed"] as const) expect(isPubliclyVisible(f(s))).toBe(false);
  });

  it("names the reason for the owner", () => {
    expect(visibilityReason(f("active"))).toBe("visible");
    expect(visibilityReason(f("active"), { expired: true })).toBe("expired");
    expect(visibilityReason(f("active"), { accessGateMet: false })).toBe("gated");
    expect(visibilityReason(f("closed", "withdrawn"))).toBe("withdrawn");
    expect(visibilityReason(f("closed", null))).toBe("closed");
    expect(visibilityReason({ state: "active", closedOutcome: null, ownerLocked: true })).toBe("locked");
  });
});

describe("domain adapters map stored statuses onto the contract", () => {
  it("demand: submitted is active; the admin pipeline is owner-locked; no pause; no edit after submit", () => {
    const d = demandAdapter({ closedOutcomeStored: true });
    expect(d.facts({ status: "submitted" })).toEqual({ state: "active", closedOutcome: null });
    for (const s of ["in_review", "needs_followup", "approved"]) {
      expect(d.facts({ status: s }).ownerLocked).toBe(true);
    }
    expect(d.facts({ status: "closed", closedOutcome: "discarded" })).toEqual({ state: "closed", closedOutcome: "discarded" });
    expect(d.statusFor("active")).toBe("submitted");
    expect(allowedActions(d.support, d.facts({ status: "submitted" }))).toEqual(["complete", "withdraw"]);
    expect(allowedActions(d.support, d.facts({ status: "closed", closedOutcome: "discarded" }))).toEqual([]);
  });

  it("service: closed only once supported; an unknown status is locked, never guessed", () => {
    const before = serviceAdapter({ closedSupported: false });
    expect(allowedActions(before.support, before.facts({ status: "active" }))).toEqual(["edit", "pause"]);
    expect(() => before.statusFor("closed")).toThrow();
    const after = serviceAdapter({ closedSupported: true });
    expect(allowedActions(after.support, after.facts({ status: "active" }))).toEqual(["edit", "pause", "complete", "withdraw"]);
    expect(before.facts({ status: "archived" }).ownerLocked).toBe(true);
  });

  it("listing: one to one", () => {
    const l = listingAdapter({ pauseSupported: true, closedOutcomeStored: false });
    for (const s of ["draft", "active", "paused"] as const) expect(l.facts({ status: s }).state).toBe(s);
    expect(l.facts({ status: "closed" })).toEqual({ state: "closed", closedOutcome: null });
    expect(l.statusFor("closed")).toBe("closed");
  });
});
