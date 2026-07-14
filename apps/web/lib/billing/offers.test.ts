/**
 * Launch Offer window + 15% first-annual discount — boundary-date and math
 * guard (Sprint v2 §9). The dates are owner commitments; changing them fails
 * here until deliberately updated with the owner.
 */
import { describe, it, expect } from "vitest";

import {
  LAUNCH_OFFER_PLAN_SLUG,
  LAUNCH_OFFER_ELIGIBILITY_SLUG,
  LAUNCH_OFFER_VALID_UNTIL_ISO,
  FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO,
  FIRST_ANNUAL_DISCOUNT_PERCENT,
  launchOfferWindowOpen,
  earnsFirstAnnualDiscount,
  firstAnnualDiscountApplies,
  applyFirstAnnualDiscountCents,
  buildLaunchOfferEligibilityRow,
} from "./offers";

describe("owner constants are pinned", () => {
  it("window/deadline/percent match the owner requirement", () => {
    expect(LAUNCH_OFFER_VALID_UNTIL_ISO).toBe("2026-10-31");
    expect(FIRST_ANNUAL_DISCOUNT_DEADLINE_ISO).toBe("2027-01-01");
    expect(FIRST_ANNUAL_DISCOUNT_PERCENT).toBe(15);
    expect(LAUNCH_OFFER_PLAN_SLUG).toBe("launch_offer_99");
    expect(LAUNCH_OFFER_ELIGIBILITY_SLUG).toBe("launch_offer_15pct_annual");
  });
});

describe("launch offer activation window (UTC, inclusive last day)", () => {
  it("open well inside the window", () => {
    expect(launchOfferWindowOpen("2026-07-14T12:00:00.000Z")).toBe(true);
  });
  it("open on the last day 2026-10-31 (start and end of day)", () => {
    expect(launchOfferWindowOpen("2026-10-31T00:00:00.000Z")).toBe(true);
    expect(launchOfferWindowOpen("2026-10-31T23:59:59.000Z")).toBe(true);
  });
  it("closed from 2026-11-01T00:00:00Z", () => {
    expect(launchOfferWindowOpen("2026-11-01T00:00:00.000Z")).toBe(false);
  });
  it("invalid dates never open the window", () => {
    expect(launchOfferWindowOpen("not-a-date")).toBe(false);
  });
  it("earning eligibility follows the same window", () => {
    expect(earnsFirstAnnualDiscount("2026-10-31T20:00:00.000Z")).toBe(true);
    expect(earnsFirstAnnualDiscount("2026-11-01T00:00:00.000Z")).toBe(false);
  });
});

describe("first-annual discount consumption (before 2027-01-01, exclusive)", () => {
  const base = {
    eligibilityEarned: true,
    consumedAt: null as string | null,
    isFirstAnnual: true,
  };

  it("applies on 2026-12-31 23:59:59Z", () => {
    expect(
      firstAnnualDiscountApplies({
        ...base,
        annualActivationAt: "2026-12-31T23:59:59.000Z",
      }),
    ).toBe(true);
  });

  it("does NOT apply at exactly 2027-01-01T00:00:00Z (exclusive)", () => {
    expect(
      firstAnnualDiscountApplies({
        ...base,
        annualActivationAt: "2027-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("requires earned + unconsumed + first-annual", () => {
    const at = "2026-12-01T00:00:00.000Z";
    expect(
      firstAnnualDiscountApplies({ ...base, eligibilityEarned: false, annualActivationAt: at }),
    ).toBe(false);
    expect(
      firstAnnualDiscountApplies({
        ...base,
        consumedAt: "2026-11-15T00:00:00.000Z",
        annualActivationAt: at,
      }),
    ).toBe(false);
    expect(
      firstAnnualDiscountApplies({ ...base, isFirstAnnual: false, annualActivationAt: at }),
    ).toBe(false);
  });
});

describe("15% computation (cents, rounded)", () => {
  it("annual Launch Offer 12 × 99 € = 1188 € → 1009.80 €", () => {
    expect(applyFirstAnnualDiscountCents(9900 * 12)).toBe(100980);
  });
  it("annual agency START 12 × 99.99 € = 1199.88 € → 1019.90 € (rounded)", () => {
    expect(applyFirstAnnualDiscountCents(9999 * 12)).toBe(101990);
  });
  it("degenerate inputs never produce a negative/NaN price", () => {
    expect(applyFirstAnnualDiscountCents(0)).toBe(0);
    expect(applyFirstAnnualDiscountCents(-5)).toBe(0);
    expect(applyFirstAnnualDiscountCents(Number.NaN)).toBe(0);
  });
});

describe("automatic eligibility row building (the 'system remembers' write)", () => {
  const inWindow = "2026-09-01T10:00:00.000Z";

  it("builds the row for a launch_offer_99 activation inside the window", () => {
    const row = buildLaunchOfferEligibilityRow({
      profileId: "profile-1",
      planV2Slug: "launch_offer_99",
      activationAtIso: inWindow,
      testMode: true,
    });
    expect(row).toEqual({
      profile_id: "profile-1",
      offer_slug: "launch_offer_15pct_annual",
      activation_at: inWindow,
      earned_from_plan: "launch_offer_99",
      apply_before: "2027-01-01T00:00:00.000Z",
      discount_percent: 15,
      test_mode: true,
    });
  });

  it("returns null outside the window — nothing is fabricated", () => {
    expect(
      buildLaunchOfferEligibilityRow({
        profileId: "profile-1",
        planV2Slug: "launch_offer_99",
        activationAtIso: "2026-11-02T00:00:00.000Z",
        testMode: true,
      }),
    ).toBeNull();
  });

  it("returns null for any other plan or a missing profile", () => {
    expect(
      buildLaunchOfferEligibilityRow({
        profileId: "profile-1",
        planV2Slug: "agency_start",
        activationAtIso: inWindow,
        testMode: true,
      }),
    ).toBeNull();
    expect(
      buildLaunchOfferEligibilityRow({
        profileId: "",
        planV2Slug: "launch_offer_99",
        activationAtIso: inWindow,
        testMode: true,
      }),
    ).toBeNull();
  });
});
