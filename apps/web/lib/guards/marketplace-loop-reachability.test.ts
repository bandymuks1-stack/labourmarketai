import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 Real-Use Hardening — marketplace loop reachability.
 *
 * Before this slice the loop's two halves were UI-orphaned: /dashboard/services
 * (where a provider publishes an offering) had NO link anywhere in the app, and
 * /dashboard/service-requests was only reachable through the count-gated action
 * cards — so a first-time buyer/provider had no path into the loop.
 *
 * This guard pins the always-on access: a calm (NOT count-gated) marketplace
 * access block on the dashboard linking to BOTH halves, rendered in both the org
 * and worker branches, plus a cross-link on each half pointing at the other.
 * Pure navigation over shipped routes — no DB, no business logic, no fake count.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("dashboard exposes an always-on marketplace access block", () => {
  const page = read("app/[locale]/dashboard/page.tsx");

  it("defines a single access block element linking to both halves", () => {
    expect(page).toMatch(/const marketplaceAccess = \(/);
    expect(page).toMatch(/data-testid="dashboard-marketplace-access"/);
    expect(page).toMatch(/testid="dashboard-marketplace-offer"/); // ActionCard (audit PR8)
    expect(page).toMatch(/testid="dashboard-marketplace-find"/); // ActionCard (audit PR8)
    // ActionCard casts the href internally (audit PR8) — the page passes
    // the plain routes.
    expect(page).toMatch(/href="\/dashboard\/services"/);
    expect(page).toMatch(/"\/dashboard\/service-requests"/);
  });

  it("renders the access block in BOTH the org and worker branches", () => {
    expect((page.match(/\{marketplaceAccess\}/g) ?? []).length).toBe(2);
  });

  it("is calm, never count-gated and never the doctrine-killed /discover", () => {
    // The block is a plain element, not wrapped in a `> 0 ?` conditional like the
    // urgent action cards — honest access, no fabricated urgency.
    expect(page).not.toMatch(/marketplaceAccess[^}]*> 0/);
    expect(page).not.toMatch(/\/dashboard\/discover/);
  });

  it("labels come from i18n (no hardcoded UI copy)", () => {
    for (const k of ["hubTitle", "hubOffer", "hubOfferNote", "hubFind", "hubFindNote"]) {
      expect(page).toMatch(new RegExp(`tMarket\\("${k}"\\)`));
    }
  });
});

describe("the two halves cross-link to each other", () => {
  it("/dashboard/services links to the request loop", () => {
    const page = read("app/[locale]/dashboard/services/page.tsx");
    expect(page).toMatch(/from "@\/lib\/i18n\/navigation"/);
    expect(page).toMatch(/data-testid="services-to-requests-link"/);
    expect(page).toMatch(/"\/dashboard\/service-requests" as "\/dashboard"/);
    expect(page).toMatch(/t\("linkToRequests"\)/);
  });

  it("/dashboard/service-requests links to manage offerings", () => {
    const page = read("app/[locale]/dashboard/service-requests/page.tsx");
    expect(page).toMatch(/from "@\/lib\/i18n\/navigation"/);
    expect(page).toMatch(/data-testid="requests-to-services-link"/);
    expect(page).toMatch(/"\/dashboard\/services" as "\/dashboard"/);
    expect(page).toMatch(/t\("linkToServices"\)/);
  });
});

describe("reachability copy exists across active locales", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    const json = JSON.parse(read(`messages/${loc}.json`)) as {
      marketplace?: Record<string, unknown>;
      serviceOfferings?: Record<string, unknown>;
    };
    it(`${loc}: marketplace hub + cross-link keys present + non-empty`, () => {
      const m = json.marketplace ?? {};
      for (const k of [
        "hubTitle",
        "hubOffer",
        "hubOfferNote",
        "hubFind",
        "hubFindNote",
        "linkToServices",
      ]) {
        expect(typeof m[k], `${loc}.marketplace.${k}`).toBe("string");
        expect(String(m[k]).trim().length, `${loc}.marketplace.${k}`).toBeGreaterThan(0);
      }
    });
    it(`${loc}: serviceOfferings.linkToRequests present + non-empty`, () => {
      const v = (json.serviceOfferings ?? {}).linkToRequests;
      expect(typeof v, `${loc}.serviceOfferings.linkToRequests`).toBe("string");
      expect(String(v).trim().length).toBeGreaterThan(0);
    });
  }
});
