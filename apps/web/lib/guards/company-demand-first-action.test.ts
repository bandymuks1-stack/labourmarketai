import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Company demand first-action guards (findings F-D1/F-D2/F-D3/F-D5 of the
 * full-project audit 2026-07-02).
 *
 * Contract:
 *   - The company saved-draft state links to the REAL submit wizard on the
 *     root dashboard (the draft alone never reaches customer_requests).
 *   - The root-dashboard demand wizard section carries the #demand-intake
 *     anchor those links target.
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

describe("company draft → real request bridge (F-D1)", () => {
  it("saved-draft state opens the root-dashboard wizard via the workspace-switching action", () => {
    // Audit PR4: a raw /dashboard#demand-intake link dead-ended for
    // held-company users whose active role was worker (the wizard renders
    // only in the org branch); the action switches the workspace first.
    const page = read("app/[locale]/dashboard/company/page.tsx");
    expect(page).toMatch(/company-request-submit-real-link/);
    expect(page).toMatch(/openDemandIntakeAsCompanyAction/);
    expect(page).toMatch(/firstAction\.submitRealCta/);
    const action = read("lib/company/demand-intake-navigation.ts");
    expect(action).toMatch(/\/dashboard#demand-intake/);
    expect(action).toMatch(/switchActiveRole\("company"\)/);
  });

  it("the wizard section carries the demand-intake anchor", () => {
    const page = read("app/[locale]/dashboard/page.tsx");
    expect(page).toMatch(/id="demand-intake"/);
    expect(page).toMatch(/data-testid="demand-intake-section"/);
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
      expect(
        msgs.roleDashboards.company.firstAction.submitRealCta,
        `submitRealCta ${locale}`,
      ).toBeTruthy();
      expect(msgs.scouting.noDemandsCta, `noDemandsCta ${locale}`).toBeTruthy();
      expect(
        msgs.companyOps.projectsManageCta,
        `projectsManageCta ${locale}`,
      ).toBeTruthy();
    }
  });
});
