import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wagon 3 — Dashboard and Navigation Simplification (UX Recovery Train).
 *
 * Pins the doc's three durable rules:
 *   1. primary-nav labels never leak internal architecture terminology to a
 *      normal user (intelligence, evidence registry, normalized skills,
 *      system/network jargon) in ANY active locale;
 *   2. the route-consolidation redirects stay in place (one canonical
 *      surface per capability — no second dashboard, no duplicate entries);
 *   3. the org (company/agency) overview keeps the owner's task order.
 *      Compact home v1 (owner directive 2026-07-16) superseded the Wagon 3
 *      readback-first order: new responses → next action → compact planning
 *      status lead the first screen; the workforce-need readback and the
 *      market context still render, folded into the collapsed more-section
 *      (the full order lives in dashboard-hierarchy.test.ts).
 */

const APP = process.cwd();
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const ACTIVE_LOCALES = ["lt", "en", "de", "nl", "ru"] as const;

// Architecture terms a worker must never see in the primary nav. Deliberately
// scoped to NAV LABELS only — content surfaces (admin, intelligence
// workspace) are separate audiences with their own guards.
const FORBIDDEN_IN_NAV = [
  /intelligence/i,
  /intelekt/i,
  /žvalgyb/i,
  /evidence/i,
  /įrodym/i,
  /registr/i, // registry as an exposed concept
  /normaliz/i,
  /schema/i,
  /pipeline/i,
  /provenance/i,
];

describe("Wagon 3 — primary nav stays plain-language in every locale", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`auth.dashboard.tabs.* labels are architecture-free (${locale})`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        auth?: { dashboard?: { tabs?: Record<string, string> } };
      };
      const tabs = messages.auth?.dashboard?.tabs ?? {};
      expect(Object.keys(tabs).length).toBeGreaterThan(4);
      for (const [key, label] of Object.entries(tabs)) {
        for (const banned of FORBIDDEN_IN_NAV) {
          expect(
            label,
            `tabs.${key} (${locale}) leaks architecture terminology: "${label}"`,
          ).not.toMatch(banned);
        }
      }
    });
  }
});

describe("Wagon 3 — route consolidation redirects stay canonical", () => {
  // W1: these were redirect-only page files. The files are gone; the redirects
  // moved to next.config, so the URLs still resolve. Same intent, one less
  // App Router entry each.
  const REDIRECT_STUBS: ReadonlyArray<{ route: string; destination: string }> = [
    { route: "/dashboard/marketplace", destination: "/dashboard/market-map" },
    { route: "/dashboard/player-card", destination: "/dashboard/journal" },
    { route: "/dashboard/agency", destination: "/dashboard/company" },
  ];
  for (const { route, destination } of REDIRECT_STUBS) {
    it(`${route} still redirects to its canonical surface`, () => {
      expect(isCanonicallyRedirected(route, destination)).toBe(true);
    });
  }
});

describe("Wagon 3 — org overview keeps the owner's task order (compact home v1)", () => {
  it("responses → next action → planning status lead; readback + market context stay in the fold", () => {
    const page = read("app/[locale]/dashboard/advanced/page.tsx");
    // Work inside the org branch only (starts at the compact-home-v1 order note).
    const orgBranch = page.slice(page.indexOf("Compact home v1 (owner directive"));
    expect(orgBranch.length).toBeGreaterThan(100);

    const responses = orgBranch.indexOf("{serviceRequestsNextAction}");
    const nextAction = orgBranch.indexOf("<DashboardNextAction");
    const planning = orgBranch.indexOf("<DashboardStatusStrip");
    const fold = orgBranch.indexOf("<DashboardMoreSection");
    const market = orgBranch.indexOf("<HubCompanyIntelligence");

    for (const [name, idx] of Object.entries({
      responses,
      nextAction,
      planning,
      fold,
      market,
    })) {
      expect(idx, `${name} section missing from the org branch`).toBeGreaterThan(-1);
    }
    expect(responses).toBeLessThan(nextAction);
    expect(nextAction).toBeLessThan(planning);
    expect(planning).toBeLessThan(fold);
    // The market context renders inside the fold. (The workforce-need
    // readback MOVED to /dashboard/company with W3 rows 7/8/25.)
    expect(market).toBeGreaterThan(fold);
  });

  it("the workforce-need readback renders exactly once, on the company page", () => {
    expect(
      (read("app/[locale]/dashboard/advanced/page.tsx").match(/<DemandRequestsReadback/g) ?? [])
        .length,
    ).toBe(0);
    expect(
      (read("app/[locale]/dashboard/company/page.tsx").match(/<DemandRequestsReadback/g) ?? [])
        .length,
    ).toBe(1);
  });
});
