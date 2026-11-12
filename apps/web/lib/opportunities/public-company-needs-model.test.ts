import { describe, expect, it } from "vitest";

import {
  isUnconfirmedCompanyRoute,
  NEED_PUBLIC_REASONS,
  parseNeedPublicReasons,
  parseNeedPublicState,
  parsePublicCompanyNeedRows,
} from "./public-company-needs-model";
import { isApprovedRouteRow } from "./opportunity-fit";

const ID = "11111111-1111-4111-8111-111111111111";

describe("parsePublicCompanyNeedRows", () => {
  it("keeps exactly the nine contract fields", () => {
    const [n] = parsePublicCompanyNeedRows([
      {
        id: ID,
        role_text: "electrician",
        country: "LT",
        location_label: "Kaunas",
        team_size: 3,
        start_period: "asap",
        created_at: "2026-11-12T00:00:00Z",
        company_name: "Clean UAB",
        company_confirmed: false,
        contact_email: "leak@firma.lt",
      },
    ]);
    expect(n).toEqual({
      id: ID,
      roleText: "electrician",
      country: "LT",
      locationLabel: "Kaunas",
      teamSize: 3,
      startPeriod: "asap",
      createdAt: "2026-11-12T00:00:00Z",
      companyName: "Clean UAB",
      companyConfirmed: false,
    });
    expect(Object.keys(n)).not.toContain("contactEmail");
  });

  it("only an explicit true is confirmed", () => {
    const rows = parsePublicCompanyNeedRows([
      { id: ID, company_confirmed: "true" },
      { id: ID, company_confirmed: null },
      { id: ID, company_confirmed: true },
    ]);
    expect(rows.map((r) => r.companyConfirmed)).toEqual([false, false, true]);
  });

  it("drops malformed rows and non-arrays", () => {
    expect(parsePublicCompanyNeedRows(null)).toEqual([]);
    expect(parsePublicCompanyNeedRows([{ id: "x" }, null, 3])).toEqual([]);
  });
});

describe("route status", () => {
  it("an unconfirmed company row reaches the worker board, labelled", () => {
    expect(isApprovedRouteRow({ route_status: "unconfirmed_company" })).toBe(true);
    expect(isUnconfirmedCompanyRoute("unconfirmed_company")).toBe(true);
    expect(isUnconfirmedCompanyRoute("approved_direct_partner")).toBe(false);
    expect(isUnconfirmedCompanyRoute(null)).toBe(false);
  });

  it("an unknown route stays hidden (default-closed)", () => {
    expect(isApprovedRouteRow({ route_status: "held_review" })).toBe(false);
  });
});

describe("state and reason parsing", () => {
  it("accepts only the closed sets", () => {
    expect(parseNeedPublicState("held_review")).toBe("held_review");
    expect(parseNeedPublicState("approved")).toBeNull();
    expect(parseNeedPublicReasons(["phone", "made_up", 1, "rate"])).toEqual(["phone", "rate"]);
    expect(NEED_PUBLIC_REASONS.length).toBe(14);
  });
});
