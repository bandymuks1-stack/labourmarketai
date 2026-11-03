import { describe, expect, it } from "vitest";

import { firstTouchToCopy } from "./first-touch-account-copy";

/**
 * The account copy for OAuth sign-ups writes a NEW account's own campaign
 * once, bounded, and never overwrites. Consent is checked by the caller
 * (whenAnalyticsConsentGranted) and proven in lib/consent.
 */

const NOW = Date.parse("2026-11-03T12:00:00Z");
const fresh = { created_at: "2026-11-03T11:55:00Z", user_metadata: { locale: "lt" } };

describe("firstTouchToCopy", () => {
  it("copies the allowlisted keys for a fresh account with none", () => {
    expect(
      firstTouchToCopy(fresh, { utm_source: "fb", utm_campaign: "worker-inbound", utm_term: "my typed query", landing_path: "/lt" }, NOW),
    ).toEqual({ utm_source: "fb", utm_campaign: "worker-inbound", landing_path: "/lt" });
  });

  it("never overwrites an account that already carries a campaign", () => {
    expect(firstTouchToCopy({ ...fresh, user_metadata: { utm_source: "email-form" } }, { utm_source: "fb" }, NOW)).toBeNull();
  });

  it("an old account passing through onboarding is not a sign-up", () => {
    expect(firstTouchToCopy({ ...fresh, created_at: "2026-10-01T00:00:00Z" }, { utm_source: "fb" }, NOW)).toBeNull();
    expect(firstTouchToCopy({ ...fresh, created_at: null }, { utm_source: "fb" }, NOW)).toBeNull();
  });

  it("nothing to copy, or no user, writes nothing", () => {
    expect(firstTouchToCopy(fresh, {}, NOW)).toBeNull();
    expect(firstTouchToCopy(fresh, { utm_term: "only a search query" }, NOW)).toBeNull();
    expect(firstTouchToCopy(null, { utm_source: "fb" }, NOW)).toBeNull();
  });

  it("values are bounded like every other first-touch read", () => {
    const out = firstTouchToCopy(fresh, { utm_campaign: `<b>${"x".repeat(300)}` }, NOW);
    expect(out?.utm_campaign).not.toContain("<");
    expect(out?.utm_campaign.length).toBeLessThanOrEqual(120);
  });
});
