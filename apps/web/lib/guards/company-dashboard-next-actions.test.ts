import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the company dashboard shows a usable, honest "next actions" surface
 * after automatic-first onboarding — never an empty/unclear dashboard, never
 * "wait for admin approval", never faked verification/hiring/AI.
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

  it("renders the four next-action cards incl. optional verification", () => {
    for (const c of ["completeDetails", "team", "requests", "verification"]) {
      expect(src).toContain(`cards.${c}.title`);
    }
    expect(src).toMatch(/optional:\s*true/); // verification card is optional
    expect(src).toContain("optionalBadge");
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

    it(`${loc}: ships cards + noCompany + headings`, () => {
      expect(na, `${loc} nextActions missing`).toBeTruthy();
      expect(na.heading).toBeTruthy();
      for (const c of ["completeDetails", "team", "requests", "verification"]) {
        expect(na.cards?.[c]?.title, `${loc} ${c}.title`).toBeTruthy();
        expect(na.cards?.[c]?.body, `${loc} ${c}.body`).toBeTruthy();
        expect(na.cards?.[c]?.cta, `${loc} ${c}.cta`).toBeTruthy();
      }
      expect(na.noCompany?.title && na.noCompany?.body && na.noCompany?.cta).toBeTruthy();
      expect(na.fixHeading && na.missingHeading).toBeTruthy();
    });

    it(`${loc}: copy has no "wait for admin approval" + no fake claims`, () => {
      const blob = JSON.stringify(na);
      expect(blob.toLowerCase()).not.toMatch(/wait for (an )?admin|laukti administratoriaus/);
      expect(blob).not.toMatch(FAKE);
    });

    it(`${loc}: the verification card is framed as optional`, () => {
      const body = String(na.cards?.verification?.body ?? "").toLowerCase();
      expect(body).toMatch(loc === "lt" ? /neprivalom/ : /optional/);
    });
  }
});
