import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Company demand first-action guards (findings F-D1/F-D2/F-D3/F-D5 of the
 * full-project audit 2026-07-02; consolidated by W3 rows 7/8/25).
 *
 * Contract:
 *   - The FULL demand wizard lives on /dashboard/company under the
 *     #demand-intake anchor (its canonical home — the advanced-page mount is
 *     gone). No draft-to-wizard bridge is needed: the wizard IS the page's
 *     demand surface, and its own save-draft leg covers the private draft.
 *   - The workspace-switching action targets the company route, so every
 *     held-role caller lands on an anchor that exists.
 *   - Scouting's no-demands empty state has a CTA to create a need, and the
 *     "not structured" copy no longer instructs the company to perform the
 *     admin-only structuring step.
 *   - The buyer draft form is labelled as optional private notes, not as
 *     the page's first action (the real request form sits above it).
 *   - The company projects card links to the working /dashboard/projects
 *     board, not only to create-new.
 */

const APP = join(process.cwd());
const read = (rel: string) => readFileSync(join(APP, rel), "utf-8");

describe("the canonical demand intake lives on the company page (W3 7/8/25)", () => {
  it("the company page hosts the wizard under the demand-intake anchor", () => {
    const page = read("app/[locale]/dashboard/company/page.tsx");
    expect(page).toMatch(/id="demand-intake"/);
    expect(page).toMatch(/data-testid="demand-intake-section"/);
    expect(page).toMatch(/<DemandRequestButton/);
  });

  // W3 Package 4 deleted the advanced page itself, so "the advanced page
  // carries no demand surface" no longer needs a file-level check here — the
  // deletion ratchet (w3-return-to-workspace / route-truth-map) owns absence.

  it("the workspace-switching action targets the company route's anchor", () => {
    const action = read("lib/company/demand-intake-navigation.ts");
    expect(action).toMatch(/\/dashboard\/company#demand-intake/);
    expect(action).toMatch(/switchActiveRole\("company"\)/);
  });
});

describe("scouting empty states are actionable (F-D2)", () => {
  it("no-demands state has a create-need CTA", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/scouting-no-demands-cta/);
    expect(page).toMatch(/noDemandsCta/);
  });

  it("copy no longer tells the company to structure skills itself", () => {
    const en = JSON.parse(read("messages/en.json"));
    expect(en.scouting.notStructured).not.toMatch(
      /structure the required skills first/i,
    );
    expect(en.scouting.noDemands).not.toMatch(/then structure/i);
    expect(en.scouting.noDemandsCta).toBeTruthy();
  });
});

describe("buyer draft form is demoted to optional notes (F-D3)", () => {
  it("en copy says the real form above reaches the team", () => {
    const en = JSON.parse(read("messages/en.json"));
    const fa = en.roleDashboards.buyer.firstAction;
    expect(fa.title).toMatch(/optional/i);
    expect(fa.body).toMatch(/form above/i);
  });
});

describe("company projects card reaches the projects board (F-D5)", () => {
  it("links to /dashboard/projects", () => {
    const page = read("app/[locale]/dashboard/company/page.tsx");
    expect(page).toMatch(/company-ops-projects-manage/);
    expect(page).toMatch(/href="\/dashboard\/projects"/);
  });
});

describe("keys exist in en/lt/ru", () => {
  it("all new keys present", () => {
    for (const locale of ["en", "lt", "ru"]) {
      const msgs = JSON.parse(read(`messages/${locale}.json`));
      expect(msgs.scouting.noDemandsCta, `noDemandsCta ${locale}`).toBeTruthy();
      expect(
        msgs.companyOps.projectsManageCta,
        `projectsManageCta ${locale}`,
      ).toBeTruthy();
    }
  });
});
