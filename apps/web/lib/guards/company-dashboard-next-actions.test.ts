import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the company dashboard shows a usable, honest STATUS surface after
 * automatic-first onboarding — never an empty/unclear dashboard, never
 * "wait for admin approval", never faked verification/hiring/AI.
 *
 * Consolidated (canonical-user-journey v1): CompanyNextActions is now the
 * data-driven status header (name, honest verification status, what to fix,
 * tracked demand CTA); the four static explainer cards were removed because
 * they duplicated the page's single CompanyActionNextActions action center.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const PAGE = "app/[locale]/dashboard/company/page.tsx";
const COMPONENT = "components/app/company-next-actions.tsx";
const LOCALES = ["lt", "en"] as const;
const FAKE = /\bAI\b|\bmatch(?:ing|ed)?\b|\bhired?\b|\bhiring\b|\bguarantee\b|dirbtin\w*\s*intelekt|atitikim/i;

describe("Guard: the company dashboard wires the next-actions surface", () => {
  const page = read(PAGE);

  it("reuses the canonical company route + role gate stays first", () => {
    const gateIdx = page.search(/await\s+requireRoleOrRedirect\(\s*locale\s*,\s*["']company["']\s*\)/);
    const readIdx = page.search(/getOwnCompanyProfile\(\)/);
    expect(gateIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeGreaterThan(gateIdx); // company read happens after the gate
  });

  it("renders CompanyNextActions for an existing company", () => {
    expect(page).toMatch(/import\s*\{[\s\S]*CompanyNextActions[\s\S]*\}\s*from\s*["']@\/components\/app\/company-next-actions["']/);
    expect(page).toMatch(/companyRow\s*\?\s*<CompanyNextActions\s+company=\{companyRow\}/);
  });

  it("guides to start-company (no empty technical blocks) when no company row", () => {
    expect(page).toMatch(/companyProfile\.kind\s*===\s*"ok"\s*&&\s*companyProfile\.row\s*===\s*null/);
    expect(page).toMatch(/<CompanyNoProfileGuide\s*\/>/);
  });

  it("uses the company-setup read (has verification status), not the workers-only read", () => {
    expect(page).toMatch(/getOwnCompany as getOwnCompanyProfile.*from "@\/lib\/company\/company-setup"/);
  });
});

describe("Guard: the next-actions component is honest + data-driven", () => {
  const src = read(COMPONENT);

  it("shows the status badge from the ACTUAL company status (verified only if real)", () => {
    expect(src).toMatch(/verificationStatus\.\$\{status\}/);
    expect(src).toMatch(/data-status=\{status\}/);
    // status comes from the company prop, never hardcoded to verified.
    expect(src).toMatch(/const status = company\.verificationStatus/);
    expect(src).not.toMatch(/=\s*["']verified["']/); // no hardcoded verified assignment
  });

  it("reuses the honest setup status + explainer copy", () => {
    expect(src).toMatch(/verificationExplainer\.\$\{status\}/);
  });

  it("keeps ONE action center: no duplicate explainer card stack", () => {
    // The static completeDetails/team/verification cards live nowhere — the
    // room's action center is CompanyActionNextActions on the page. Only the
    // tracked demand CTA (real telemetry) remains here.
    for (const c of ["completeDetails", "team", "verification"]) {
      expect(src).not.toContain(`cards.${c}.title`);
    }
    expect(src).toContain("cards.requests.cta");
    expect(src).toContain("companyDemandActionClicked");
  });

  it("surfaces needs_checks / missing items with a fix link", () => {
    expect(src).toMatch(/runCompanyChecks/);
    expect(src).toContain("company-next-actions-tofix");
    expect(src).toContain("company-next-actions-fix-link");
  });

  it("makes no fake matching / hiring / AI / verification claim in the component body", () => {
    const body = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(body.match(FAKE)).toBeNull();
  });

  it("never writes to companies (read + render only)", () => {
    expect(src).not.toMatch(/\.update\(|\.upsert\(|\.insert\(|\.rpc\(/);
  });
});

describe("Guard: next-actions i18n is honest + parity-clean (LT/EN)", () => {
  for (const loc of LOCALES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const na = ((loadJson(`messages/${loc}.json`).roleDashboards as any)?.company?.nextActions) as any;

    it(`${loc}: ships the demand CTA + noCompany + fix headings`, () => {
      expect(na, `${loc} nextActions missing`).toBeTruthy();
      expect(na.cards?.requests?.cta, `${loc} requests.cta`).toBeTruthy();
      expect(na.noCompany?.title && na.noCompany?.body && na.noCompany?.cta).toBeTruthy();
      expect(na.fixHeading && na.missingHeading).toBeTruthy();
    });

    it(`${loc}: copy has no "wait for admin approval" + no fake claims`, () => {
      const blob = JSON.stringify(na);
      expect(blob.toLowerCase()).not.toMatch(/wait for (an )?admin|laukti administratoriaus/);
      expect(blob).not.toMatch(FAKE);
    });
  }
});
