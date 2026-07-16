import { describe, expect, it } from "vitest";
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
 *   3. the org (company/agency) overview keeps the task order the owner set:
 *      current workforce need → new responses → next action → compact
 *      planning status → optional market context.
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
  const REDIRECT_STUBS: ReadonlyArray<{ file: string; target: RegExp }> = [
    {
      file: "app/[locale]/dashboard/marketplace/page.tsx",
      target: /redirect\(`\/\$\{locale\}\/dashboard\/market-map`\)/,
    },
    {
      file: "app/[locale]/dashboard/player-card/page.tsx",
      target: /redirect\(`\/\$\{locale\}\/dashboard\/journal`\)/,
    },
    {
      file: "app/[locale]/dashboard/agency/page.tsx",
      target: /redirect\(.*\/dashboard\/company/,
    },
  ];
  for (const { file, target } of REDIRECT_STUBS) {
    it(`${file} still redirects to its canonical surface`, () => {
      expect(read(file)).toMatch(target);
    });
  }
});

describe("Wagon 3 — org overview keeps the owner's task order", () => {
  it("need → responses → next action → planning status → market context", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    // Work inside the org branch only (starts at the role !== "worker" return).
    const orgBranch = page.slice(page.indexOf("Wagon 3 org-branch order"));
    expect(orgBranch.length).toBeGreaterThan(100);

    const need = orgBranch.indexOf("<DemandRequestsReadback");
    const responses = orgBranch.indexOf("{serviceRequestsNextAction}");
    const nextAction = orgBranch.indexOf("<DashboardNextAction");
    const planning = orgBranch.indexOf("<DashboardStatusStrip");
    const market = orgBranch.indexOf("<HubCompanyIntelligence");

    for (const [name, idx] of Object.entries({
      need,
      responses,
      nextAction,
      planning,
      market,
    })) {
      expect(idx, `${name} section missing from the org branch`).toBeGreaterThan(-1);
    }
    expect(need).toBeLessThan(responses);
    expect(responses).toBeLessThan(nextAction);
    expect(nextAction).toBeLessThan(planning);
    expect(planning).toBeLessThan(market);
  });

  it("the workforce-need readback renders exactly once on the overview", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(
      (page.match(/<DemandRequestsReadback/g) ?? []).length,
    ).toBe(1);
  });
});
