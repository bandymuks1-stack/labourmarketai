import { describe, expect, it } from "vitest";

import {
  COMPANY_REQUEST_LIMITS,
  CONVERSATION_REQUEST_LIMITS,
  evaluateRequestBudget,
  rollingDayFloorIso,
} from "./request-rate-limits";

describe("evaluateRequestBudget — company request budget (10 open / 30 per day)", () => {
  it("allows a request comfortably inside the budget", () => {
    expect(evaluateRequestBudget({ openCount: 0, last24hCount: 0 })).toEqual({
      allowed: true,
    });
    expect(evaluateRequestBudget({ openCount: 9, last24hCount: 29 })).toEqual({
      allowed: true,
    });
  });

  it("refuses at the open cap (>= 10 open)", () => {
    const d = evaluateRequestBudget({ openCount: 10, last24hCount: 0 });
    expect(d).toEqual({ allowed: false, reason: "too_many_open" });
    expect(
      evaluateRequestBudget({ openCount: 50, last24hCount: 0 }).allowed,
    ).toBe(false);
  });

  it("refuses at the daily cap (>= 30 in 24h)", () => {
    const d = evaluateRequestBudget({ openCount: 0, last24hCount: 30 });
    expect(d).toEqual({ allowed: false, reason: "daily_limit" });
  });

  it("FAILS CLOSED when a count could not be read (null)", () => {
    expect(evaluateRequestBudget({ openCount: null, last24hCount: 0 })).toEqual(
      { allowed: false, reason: "counts_unavailable" },
    );
    expect(evaluateRequestBudget({ openCount: 0, last24hCount: null })).toEqual(
      { allowed: false, reason: "counts_unavailable" },
    );
    expect(
      evaluateRequestBudget({ openCount: null, last24hCount: null }).allowed,
    ).toBe(false);
  });

  it("pins the shared limit numbers (DB wrappers must match)", () => {
    expect(COMPANY_REQUEST_LIMITS).toEqual({ maxOpen: 10, maxPerDay: 30 });
  });
});

describe("evaluateRequestBudget — conversation budget (daily only)", () => {
  it("ignores the open count (no open state exists for conversations)", () => {
    expect(
      evaluateRequestBudget(
        { openCount: null, last24hCount: 5 },
        CONVERSATION_REQUEST_LIMITS,
      ),
    ).toEqual({ allowed: true });
  });

  it("still refuses at the daily cap and fails closed on a null daily count", () => {
    expect(
      evaluateRequestBudget(
        { openCount: null, last24hCount: 30 },
        CONVERSATION_REQUEST_LIMITS,
      ),
    ).toEqual({ allowed: false, reason: "daily_limit" });
    expect(
      evaluateRequestBudget(
        { openCount: null, last24hCount: null },
        CONVERSATION_REQUEST_LIMITS,
      ),
    ).toEqual({ allowed: false, reason: "counts_unavailable" });
  });
});

describe("rollingDayFloorIso", () => {
  it("returns exactly 24h before the given instant", () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    expect(rollingDayFloorIso(now)).toBe("2026-07-15T12:00:00.000Z");
  });
});
