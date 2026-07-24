import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Company card identity guard (owner browser-smoke repair #3, 2026-07-05).
 *
 * Owner rule: the mobile/desktop home company card must name the ACTIVE
 * company — never a generic "Jūsų įmonė" when a real company exists; a
 * no-company state shows the create action instead of pretending; the
 * change-workspace action stays visible; company actions apply only to the
 * shown company (they render only when that company exists).
 *
 * Model note (documented, source-verified): the data model holds ONE company
 * per profile (getOwnCompany / save_company_setup are profile-scoped), so
 * "multiple companies" is not representable today — workspace switching is
 * the existing Manage-spaces surface, and every company action is
 * auth-scoped to the one owned company (no wrong-company writes possible →
 * no P0).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const identity = read("components/app/identity-actions.tsx");
const dashboard = read("app/[locale]/dashboard/advanced/page.tsx");

describe("active company name is the card title", () => {
  it("title falls back to the generic label ONLY when no name exists", () => {
    expect(identity).toMatch(/companyName\?\.trim\(\) \|\| t\("company\.title"\)/);
  });
  it("dashboard passes the REAL legalName from the RLS-scoped read", () => {
    expect(dashboard).toMatch(/companyRead\.row\?\.legalName \?\? null/);
    expect(dashboard).toMatch(/companyName=\{companyName\}/);
  });
  it("a real name gets the workspace subtitle even on the compact mobile card", () => {
    expect(identity).toMatch(/t\("company\.workspaceSubtitle"\)/);
  });
});

describe("no-company and switch states", () => {
  it("no company → the create CTA replaces the actions (never blind edit of a phantom)", () => {
    expect(identity).toMatch(/data-testid="identity-company-create"/);
    expect(identity).toMatch(/href=\{"\/dashboard\/start\/company" as "\/dashboard"\}/);
    // The target page splits create vs edit headings (clickability guard
    // pins the split itself) — pinned here as the no-blind-edit contract.
    const start = read("app/[locale]/dashboard/start/company/page.tsx");
    expect(start).toMatch(/formTitleEdit.*formTitleCreate|formTitleCreate.*formTitleEdit/);
  });
  it("the change-workspace action renders with the company channel", () => {
    // ManageSpacesLink is the existing workspace-selection surface — the
    // focused company view must keep it adjacent to the named card.
    expect(identity).toMatch(/<CompanyChannel[\s\S]{0,400}\/>[\s\S]{0,200}<ManageSpacesLink/);
  });
});

describe("actions bind to the shown company only", () => {
  it("company actions render ONLY when the (one) company exists", () => {
    // showActions gates the commercial links behind hasCompany — an absent
    // company can never route into demand/hire/projects blindly.
    expect(identity).toMatch(/const showActions = hasCompany \|\| focusRole === "customer";/);
    expect(identity).toMatch(/showActions=\{showActions\}/);
  });
});

describe("LT copy covered", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: workspaceSubtitle + create CTA exist`, () => {
      const c = JSON.parse(read(`messages/${loc}.json`)).identityActions.company;
      expect(typeof c.workspaceSubtitle === "string" && c.workspaceSubtitle.length > 0).toBe(true);
      expect(typeof c.empty?.cta === "string" && c.empty.cta.length > 0).toBe(true);
    });
  }
  it("LT subtitle is the owner wording", () => {
    const c = JSON.parse(read("messages/lt.json")).identityActions.company;
    expect(c.workspaceSubtitle).toBe("Įmonės darbo erdvė");
  });
});
