import { describe, expect, it } from "vitest";

import { toCanonicalDemand, type CanonicalDemand } from "@/lib/demand/canonical-demand-model";
import type { GeographySelection } from "./geography-selection";
import { groupIntoDemandUnits } from "./project-results-model";

/**
 * THE DRILLDOWN'S ROWS ARE REAL DEMAND — the unit half of the 2026-09-05 fix.
 *
 * Until this slice the market drilldown read `job_demands`, a table frozen at 0
 * rows in production. The marker above it was built from the CANONICAL demand
 * read (`customer_requests`), so every marker a real user clicked opened onto
 * an empty list and the evaluation behind it — and the continuation to people —
 * could not be reached at all.
 *
 * These pin the shaping that closes it. They are deliberately pure: the claim
 * "what the marker counted is what the list shows" must be checkable without a
 * database, or it will rot the next time either side is touched.
 */

const NL_CITY: GeographySelection = {
  countryCode: "NL",
  city: "Rotterdam",
  precision: "city",
};
const NL_COUNTRY: GeographySelection = { countryCode: "NL", precision: "country" };

/** Rotterdam is on the coordinate table; "Nieuwdorp" is not. */
const resolves = (country: string, city: string) =>
  country === "NL" && city.trim().toLowerCase() === "rotterdam";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function need(over: Partial<Parameters<typeof toCanonicalDemand>[0]> = {}): CanonicalDemand {
  const row = toCanonicalDemand({
    id: UUID_A,
    source: "customer_request",
    actionable: true,
    country: "NL",
    cityLabel: "Rotterdam",
    quantity: 4,
    roleText: "Elektricien",
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  });
  if (!row) throw new Error("fixture produced no canonical row");
  return row;
}

describe("one canonical demand row is one unit under the marker", () => {
  it("a real customer request in the selected city becomes a reachable row", () => {
    const rows = groupIntoDemandUnits([need()], NL_CITY, resolves);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.unitKind).toBe("need");
    // The URL address is the request's OWN id, so depth 2 reads the same row.
    expect(rows[0]?.projectId).toBe(UUID_A);
    expect(rows[0]?.title).toBe("Elektricien");
    expect(rows[0]?.roles).toEqual(["Elektricien"]);
    expect(rows[0]?.openHeadcount).toBe(4);
    expect(rows[0]?.openDemandCount).toBe(1);
    expect(rows[0]?.precision).toBe("city");
  });

  it("two needs from the same place stay two rows", () => {
    // Folding them would invent a third commitment that nobody made: a need
    // for 4 in May and one for 2 in July is not "a project for 6".
    const rows = groupIntoDemandUnits(
      [need(), need({ id: UUID_B, quantity: 2, roleText: "Lasser" })],
      NL_CITY,
      resolves,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.projectId).sort()).toEqual([UUID_A, UUID_B]);
  });
});

describe("the list applies exactly the marker's geography rule", () => {
  it("a city selection takes only rows whose city folds to it", () => {
    const rows = groupIntoDemandUnits(
      [need(), need({ id: UUID_B, cityLabel: "Amsterdam" })],
      NL_CITY,
      resolves,
    );
    expect(rows.map((r) => r.projectId)).toEqual([UUID_A]);
  });

  it("a country selection takes only the UNRESOLVED rows the dashed marker counted", () => {
    // Matching every row in the country would show more units than the marker
    // aggregated — the list and the map would describe different markets.
    const rows = groupIntoDemandUnits(
      [need(), need({ id: UUID_B, cityLabel: "Nieuwdorp" })],
      NL_COUNTRY,
      resolves,
    );
    expect(rows.map((r) => r.projectId)).toEqual([UUID_B]);
    expect(rows[0]?.precision).toBe("country");
    expect(rows[0]?.matchReason).toEqual({ code: "country_unresolved", country: "NL" });
  });

  it("another country never appears", () => {
    const rows = groupIntoDemandUnits(
      [need({ country: "BE", cityLabel: "Gent" })],
      NL_CITY,
      resolves,
    );
    expect(rows).toEqual([]);
  });

  it("a row with no country is real demand but not placeable, so it is withheld", () => {
    const rows = groupIntoDemandUnits([need({ country: null })], NL_COUNTRY, resolves);
    expect(rows).toEqual([]);
  });

  it("a region selection matches nothing — the caller states the gap instead", () => {
    const region: GeographySelection = {
      countryCode: "NL",
      region: "Randstad",
      precision: "region",
    };
    expect(groupIntoDemandUnits([need()], region, resolves)).toEqual([]);
  });
});

describe("nothing is invented for a field the canonical contract does not carry", () => {
  it("an unstated headcount is a declared gap, never a 1", () => {
    const rows = groupIntoDemandUnits([need({ quantity: null })], NL_CITY, resolves);
    expect(rows[0]?.missing).toContain("headcount");
    // 0 here is "no number to show"; the UI reads `missing` and prints the gap.
    expect(rows[0]?.openHeadcount).toBe(0);
  });

  it("names the organisation when the branch that answered disclosed it", () => {
    // The worker RPC returns company_name for a VERIFIED company. Rendering
    // "not stated" over a name we are allowed to show is worse than showing it.
    const row = groupIntoDemandUnits(
      [need({ organizationName: "Bouwbedrijf De Vries BV" })],
      NL_CITY,
      resolves,
    )[0];
    expect(row?.organization).toBe("Bouwbedrijf De Vries BV");
    expect(row?.missing).not.toContain("organization");
  });

  it("states the gap when the branch disclosed no organisation", () => {
    // The employer's own-rows read has no company column. Absent stays absent —
    // it is never filled from the viewer's own workspace.
    const row = groupIntoDemandUnits([need({ organizationName: null })], NL_CITY, resolves)[0];
    expect(row?.organization).toBeNull();
    expect(row?.missing).toContain("organization");
  });

  it("a blank name is a gap, not an empty label", () => {
    const row = groupIntoDemandUnits([need({ organizationName: "   " })], NL_CITY, resolves)[0];
    expect(row?.organization).toBeNull();
    expect(row?.missing).toContain("organization");
  });

  it("dates, skills and status are structurally absent and always declared", () => {
    const row = groupIntoDemandUnits([need()], NL_CITY, resolves)[0];
    expect(row?.startDate).toBeNull();
    expect(row?.endDate).toBeNull();
    expect(row?.projectStatus).toBeNull();
    expect(row?.requiredSkillIds).toEqual([]);
    expect(row?.missing).toEqual(
      expect.arrayContaining(["startDate", "endDate", "requiredSkills"]),
    );
  });

  it("an unstated role leaves the title null rather than generating one", () => {
    const row = groupIntoDemandUnits([need({ roleText: "   " })], NL_CITY, resolves)[0];
    expect(row?.title).toBeNull();
    expect(row?.roles).toEqual([]);
    expect(row?.missing).toContain("roleTitle");
  });
});

describe("the order is total, so the list never flickers between reads", () => {
  it("most demand first, then title, then id", () => {
    const rows = groupIntoDemandUnits(
      [
        need({ id: UUID_A, quantity: 2, roleText: "Lasser" }),
        need({ id: UUID_B, quantity: 9, roleText: "Elektricien" }),
      ],
      NL_CITY,
      resolves,
    );
    expect(rows.map((r) => r.projectId)).toEqual([UUID_B, UUID_A]);
  });
});

describe("ownership is provenance, and it decides what the panel may offer", () => {
  it("the viewer's OWN need carries ownership through to the row", () => {
    const row = groupIntoDemandUnits([need({ ownedByViewer: true })], NL_CITY, resolves)[0];
    expect(row?.ownedByViewer).toBe(true);
  });

  it("another tenant's need does NOT", () => {
    // The worker RPC branch returns other tenants' demand by design. Offering
    // an own-demand action over it would dead-end in `not-found`.
    const row = groupIntoDemandUnits(
      [need({ ownedByViewer: false, organizationName: "Verified BV" })],
      NL_CITY,
      resolves,
    )[0];
    expect(row?.ownedByViewer).toBe(false);
    // …and the disclosed name is still shown: naming is not owning.
    expect(row?.organization).toBe("Verified BV");
  });

  it("ownership defaults to false — it is never assumed", () => {
    expect(groupIntoDemandUnits([need()], NL_CITY, resolves)[0]?.ownedByViewer).toBe(false);
  });
});
