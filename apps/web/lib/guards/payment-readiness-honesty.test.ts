import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveBillingConfig } from "@/lib/billing/config-core";
import {
  resolveVisibilityScope,
  wouldBeFakePaidUnlock,
} from "@/lib/work-market/visibility";

/**
 * Payment readiness honesty guard (full-completion train PR 8).
 *
 * Before Stripe: payments stay disabled/inert, the account surface says so
 * honestly, entitlements never widen visibility unless billing is truly live,
 * and the Stripe handoff exists (but Stripe is NOT connected).
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("account surface states payment readiness honestly", () => {
  it("the account page renders the payment-readiness note", () => {
    const page = read("app/[locale]/dashboard/account/page.tsx");
    expect(page).toMatch(/account-payment-readiness/);
    expect(page).toMatch(/featureNotes\.paymentReadiness/);
  });
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: payment readiness says not active / being prepared`, () => {
      const txt = (JSON.parse(read(`messages/${loc}.json`)).featureNotes.paymentReadiness as string).toLowerCase();
      expect(/not active|neaktyv|не актив|prepared|ruošiam|готов/.test(txt)).toBe(true);
    });
  }
});

describe("billing stays disabled / inert (no live Stripe)", () => {
  it("billing resolves disabled by default; payments off", () => {
    const cfg = resolveBillingConfig({
      paymentsEnabled: undefined,
      provider: undefined,
      mode: undefined,
      secretKey: undefined,
      webhookSecret: undefined,
      publishableKey: undefined,
    });
    expect(cfg.state).toBe("disabled");
    expect(cfg.paymentsEnabled).toBe(false);
  });
  it("entitlements never widen visibility unless billing is live", () => {
    const input = {
      totalActiveUsers: 5000,
      identity: "person" as const,
      planTier: "business" as const,
      billingLive: false,
    };
    expect(wouldBeFakePaidUnlock(input)).toBe(true);
    expect(resolveVisibilityScope(input)).toBe("own_country");
    // with billing truly live, a business tier may widen — the real seam
    expect(resolveVisibilityScope({ ...input, billingLive: true })).toBe("own_region");
  });
});

describe("Stripe handoff exists but Stripe is not connected", () => {
  it("the next-sprint handoff doc is present", () => {
    expect(existsSync(join(REPO, "docs", "launch", "stripe-next-sprint-handoff.md"))).toBe(true);
  });
});
