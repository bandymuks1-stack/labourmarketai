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
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    expect(page).toMatch(/id="demand-intake"/);
    expect(page).toMatch(/data-testid="demand-intake-section"/);
    expect(page).toMatch(/<DemandRequestButton/);
  });

  // W3 Package 4 deleted the advanced page itself, so "the advanced page
  // carries no demand surface" no longer needs a file-level check here — the
  // deletion ratchet (w3-return-to-workspace / route-truth-map) owns absence.

  /**
   * AND IT IS ACTUALLY FIRST.
   *
   * The section has carried `data-testid="company-dashboard-first-action"`
   * since the W3 consolidation while rendering LAST in the room — after the
   * decisions strip, agency mode, ops workspace, assignment connections, the
   * pilot note, the invite link, the lifecycle panel and the public business
   * profile. The testid asserted a position nothing enforced, so "demand
   * first" was a name, not a fact. This pins the fact.
   *
   * Source order is DOM order for a server component with no reordering CSS
   * (the room is a plain `flex flex-col`), so an index comparison in the file
   * is a real statement about what the employer sees first.
   */
  it("the demand intake renders BEFORE every other section of the room", () => {
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    const at = (needle: string) => {
      const i = page.indexOf(needle);
      expect(i, `missing marker: ${needle}`).toBeGreaterThan(-1);
      return i;
    };

    // On the Needs door (IA 2026-09-16) only the header and the door onward
    // to matching stand before the intake; everything else follows it.
    const intake = at('data-testid="demand-intake-section"');
    expect(at('data-testid="company-needs-matching-door"')).toBeLessThan(intake);
    for (const later of [
      "<DemandRequestsReadback",
      'id="company-claims"',
      "<PublicDemandSection",
      "<CompanyScoutingBridge",
    ]) {
      expect(at(later), `${later} must render after the demand intake`).toBeGreaterThan(
        intake,
      );
    }
  });

  /**
   * The next step travels with it. "What I already asked for" — and the
   * per-demand scouting deep link inside it, which is the ONLY route from a
   * submitted need to ranked candidates — is the second half of the same
   * question. Leaving the readback at the bottom would put matching at the
   * far end of the page again, which is the defect this guard exists for.
   */
  it("the readback (and its scouting deep link) sits with the wizard", () => {
    const page = read("app/[locale]/dashboard/company/needs/page.tsx");
    const intake = page.indexOf('data-testid="demand-intake-section"');
    const readback = page.indexOf("<DemandRequestsReadback");
    const nextSection = page.indexOf('id="company-claims"');
    expect(intake).toBeGreaterThan(-1);
    expect(readback).toBeGreaterThan(intake);
    expect(readback).toBeLessThan(nextSection);
  });

  /**
   * The submit is not a dead end: the done state hands the employer the one
   * room where matches for that need appear. Guarded here because the whole
   * demand-first path is worth nothing if its last link is missing.
   */
  it("a submitted need points at the scouting room", () => {
    const form = read("components/app/demand-request-button.tsx");
    expect(form).toMatch(/data-testid="demand-done-scouting-link"/);
    expect(form).toMatch(/\/dashboard\/company\/scouting/);
  });

  it("the workspace-switching action targets the company route's anchor", () => {
    const action = read("lib/company/demand-intake-navigation.ts");
    expect(action).toMatch(/\/dashboard\/company\/needs#demand-intake/);
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

describe("the projects board is an organization door (F-D5, IA 2026-09-16)", () => {
  it("the Work door leads to /dashboard/projects", () => {
    const doors = read("lib/company/organization-doors.ts");
    expect(doors).toMatch(/work: "\/dashboard\/projects"/);
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
