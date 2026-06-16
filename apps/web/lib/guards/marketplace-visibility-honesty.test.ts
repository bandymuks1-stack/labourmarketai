import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBillingConfig } from "@/lib/billing/config-core";
import {
  resolveVisibilityScope,
  wouldBeFakePaidUnlock,
} from "@/lib/work-market/visibility";

/**
 * Marketplace visibility honesty guard (full-completion train PR 4).
 *
 * The supply/demand decision surfaces must base visibility on readiness / trust
 * / permissions — never on payment while billing is disabled. No fake paid
 * unlock, no fake listings.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("scouting (supply) surface states honest visibility", () => {
  const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
  it("renders the visibility note", () => {
    expect(page).toMatch(/scouting-visibility-note/);
    expect(page).toMatch(/visibilityNote/);
  });
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: visibility copy says paid access not active + no fake listings`, () => {
      const txt = (JSON.parse(read(`messages/${loc}.json`)).scouting.visibilityNote as string).toLowerCase();
      expect(/readiness|pasiruoš|готовн/.test(txt), `${loc} mentions readiness`).toBe(true);
      expect(/not active|neaktyv|не актив|prepared|ruošiam|готов/.test(txt), `${loc} paid not active`).toBe(true);
      expect(/fake|netikr|фальшив/.test(txt), `${loc} no fake listings`).toBe(true);
    });
  }
});

describe("billing disabled cannot widen visibility (no fake unlock)", () => {
  it("with payments off, a business plan does NOT widen the scope", () => {
    const input = {
      totalActiveUsers: 5000,
      identity: "company" as const,
      planTier: "business" as const,
      billingLive: false,
    };
    expect(wouldBeFakePaidUnlock(input)).toBe(true);
    expect(resolveVisibilityScope(input)).toBe("own_country");
  });
  it("billing config resolves to disabled by default", () => {
    const cfg = resolveBillingConfig({
      paymentsEnabled: undefined,
      provider: undefined,
      mode: undefined,
      secretKey: undefined,
      webhookSecret: undefined,
      publishableKey: undefined,
    });
    expect(cfg.paymentsEnabled).toBe(false);
  });
});
