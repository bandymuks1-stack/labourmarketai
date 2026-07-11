/**
 * Guard — structured demand form bridge (marketplace precision PR 2).
 *
 * Pins that the advanced-form state round-trips losslessly through the wire
 * contract (form → wire → sanitize → stored → form), that empty form state
 * produces NO wire object (a v1-style request stays untouched), and that
 * unchecked checkboxes never persist a fabricated "false" fact.
 */
import { describe, expect, it } from "vitest";
import {
  buildStructuredV2Input,
  storedV2ToFormState,
  EMPTY_ADVANCED_DEMAND_STATE,
  type AdvancedDemandFormState,
} from "@/lib/demand/structured-demand-form";
import { sanitizeStructuredDemandV2 } from "@/lib/demand/structured-demand-v2";

describe("buildStructuredV2Input", () => {
  it("empty form → undefined wire (request submits exactly as before)", () => {
    expect(buildStructuredV2Input({ ...EMPTY_ADVANCED_DEMAND_STATE })).toBeUndefined();
  });

  it("currency alone (the EUR default) does not create a compensation cluster", () => {
    const wire = buildStructuredV2Input({
      ...EMPTY_ADVANCED_DEMAND_STATE,
      currency: "EUR",
    });
    expect(wire).toBeUndefined();
  });

  it("unchecked checkboxes are absent from the wire — never stored as false", () => {
    const wire = buildStructuredV2Input({
      ...EMPTY_ADVANCED_DEMAND_STATE,
      internationalTravel: "provided",
    });
    expect(wire).toEqual({
      transport: { international_travel: "provided" },
    });
  });

  it("round-trips a filled form through sanitize → stored → form state", () => {
    const filled: AdvancedDemandFormState = {
      ...EMPTY_ADVANCED_DEMAND_STATE,
      opportunityType: "employment",
      targetSupply: "team",
      engagementForm: "posted_worker",
      contractCountry: "nl",
      startEarliest: "2026-08-01",
      hoursPerWeek: "40",
      minGuaranteedHours: "30",
      shifts: ["weekend", "day"],
      overtimeExpected: true,
      compMin: "14,50",
      compMax: "18",
      currency: "EUR",
      basis: "gross",
      unit: "hour",
      deductions: [{ kind: "accommodation", amount: "90", period: "week" }],
      accommodationState: "offered",
      accommodationPayer: "shared",
      accommodationPrice: "90",
      accommodationPricePeriod: "week",
      room: "shared",
      occupancy: "2",
      amenities: ["kitchen", "internet"],
      internationalTravel: "compensated",
      dailyTransport: "provided",
      licenceCategories: ["B"],
      minExperienceYears: "2",
      languages: [{ lang: "en", level: "B1", onePerTeam: true }],
      certificates: ["Safety card", " "],
      ownTools: true,
      applicationMethod: "interest_signal",
      responseDeadlineDays: "7",
      listingKind: "active_vacancy",
    };
    const wire = buildStructuredV2Input(filled);
    const v2 = sanitizeStructuredDemandV2(wire);
    expect(v2).not.toBeNull();
    expect(v2?.compensation?.min_cents).toBe(1450);
    expect(v2?.compensation?.max_cents).toBe(1800);
    expect(v2?.time?.shifts).toEqual(["day", "weekend"]);
    expect(v2?.requirements?.certificates).toEqual(["Safety card"]);

    const back = storedV2ToFormState(v2);
    expect(back.compMin).toBe("14.50");
    expect(back.compMax).toBe("18");
    expect(back.engagementForm).toBe("posted_worker");
    expect(back.contractCountry).toBe("NL");
    expect(back.shifts).toEqual(["day", "weekend"]);
    expect(back.overtimeExpected).toBe(true);
    expect(back.deductions).toEqual([
      { kind: "accommodation", amount: "90", period: "week" },
    ]);
    expect(back.languages).toEqual([{ lang: "en", level: "B1", onePerTeam: true }]);
    expect(back.accommodationState).toBe("offered");
    expect(back.occupancy).toBe("2");
    expect(back.listingKind).toBe("active_vacancy");

    // Second pass is loss-free: wire(back) sanitizes to the SAME v2.
    const v2Again = sanitizeStructuredDemandV2(buildStructuredV2Input(back));
    expect(v2Again).toEqual(v2);
  });

  it("null stored v2 → pristine empty form state (no invented values)", () => {
    expect(storedV2ToFormState(null)).toEqual(EMPTY_ADVANCED_DEMAND_STATE);
  });

  it("garbage numeric input is dropped, not stored", () => {
    const wire = buildStructuredV2Input({
      ...EMPTY_ADVANCED_DEMAND_STATE,
      hoursPerWeek: "40h",
      compMin: "12.999",
      minExperienceYears: "-1",
    });
    expect(wire).toBeUndefined();
  });
});
