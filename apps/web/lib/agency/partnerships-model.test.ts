import { describe, expect, it } from "vitest";

import {
  commissionFromRow,
  dueByCurrency,
  parseSharePercent,
  partnershipErrorCode,
  partnershipFromRow,
  PARTNERSHIP_ERROR_CODES,
} from "./partnerships-model";

describe("agency partnerships — the database's refusals become codes", () => {
  it("each refusal the functions raise is a known code", () => {
    for (const code of PARTNERSHIP_ERROR_CODES) {
      if (code === "needs_migration" || code === "error") continue;
      expect(partnershipErrorCode({ code: "42501", message: code })).toBe(code);
    }
  });

  it("a missing function is 'needs_migration', anything else a plain error", () => {
    expect(partnershipErrorCode({ code: "PGRST202", message: "Could not find the function" })).toBe("needs_migration");
    expect(partnershipErrorCode({ code: "42883", message: "x" })).toBe("needs_migration");
    expect(partnershipErrorCode({ code: "XX000", message: "boom" })).toBe("error");
    expect(partnershipErrorCode(null)).toBe("error");
  });
});

describe("agency partnerships — the share the lead offers", () => {
  it("is above 0 and below 100, with at most two decimals", () => {
    expect(parseSharePercent("20")).toBe(20);
    expect(parseSharePercent("12,5")).toBe(12.5);
    expect(parseSharePercent("0.01")).toBe(0.01);
    expect(parseSharePercent("0")).toBeNull();
    expect(parseSharePercent("100")).toBeNull();
    expect(parseSharePercent("12.345")).toBeNull();
    expect(parseSharePercent("ten")).toBeNull();
  });
});

describe("agency partnerships — rows", () => {
  const p = {
    partnership_id: "p1",
    side: "lead",
    lead_company_id: "L",
    lead_name: "Lead",
    partner_company_id: "P",
    partner_name: "Partner",
    invited_email: "x@example.test",
    partner_share_percent: "20.00",
    status: "active",
    created_at: "2026-11-18T00:00:00Z",
  };

  it("the invited address is kept for the lead only", () => {
    expect(partnershipFromRow(p)?.invitedEmail).toBe("x@example.test");
    expect(partnershipFromRow({ ...p, side: "partner" })?.invitedEmail).toBeNull();
    expect(partnershipFromRow({ ...p, side: "invited" })?.invitedEmail).toBeNull();
  });

  it("an unknown side or status is not a row", () => {
    expect(partnershipFromRow({ ...p, side: "admin" })).toBeNull();
    expect(partnershipFromRow({ ...p, status: "paused" })).toBeNull();
  });

  const c = {
    offer_id: "o1",
    agency_company_id: "L",
    role: "lead",
    counterpart_name: "Partner",
    request_id: "r1",
    term_id: "t1",
    fee_amount: "1000.00",
    currency: "EUR",
    share_percent: "80.00",
    amount: "800.00",
    placement_status: "placed",
    accepted_at: "2026-11-18T00:00:00Z",
    placed_at: "2026-11-19T00:00:00Z",
  };

  it("an amount is shown only for a placed row", () => {
    expect(commissionFromRow(c)?.amount).toBe(800);
    expect(commissionFromRow({ ...c, placement_status: "pending" })?.amount).toBeNull();
    expect(commissionFromRow({ ...c, placement_status: "not_placed" })?.amount).toBeNull();
    expect(commissionFromRow({ ...c, placement_status: "pending" })?.placedAt).toBeNull();
  });

  it("an agency's own candidate names no counterpart", () => {
    expect(commissionFromRow({ ...c, role: "direct", counterpart_name: "x" })?.counterpartName).toBeNull();
  });

  it("totals are per currency and only of what is due", () => {
    const rows = [
      commissionFromRow(c)!,
      commissionFromRow({ ...c, offer_id: "o2", amount: "200.50" })!,
      commissionFromRow({ ...c, offer_id: "o3", currency: "SEK", amount: "300" })!,
      commissionFromRow({ ...c, offer_id: "o4", placement_status: "pending" })!,
    ];
    expect([...dueByCurrency(rows)]).toEqual([
      ["EUR", 1000.5],
      ["SEK", 300],
    ]);
  });
});
