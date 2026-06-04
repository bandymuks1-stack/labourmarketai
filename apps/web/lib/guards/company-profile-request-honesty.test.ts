import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the company setup path is an honest profile REQUEST with a
 * verification ladder — never an unrestricted "verified company" creation,
 * and never construction-coupled (PLATFORM_DOCTRINE §7).
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

function read(rel: string, root = APP_ROOT): string {
  return readFileSync(join(root, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const MIGRATION =
  "supabase/migrations/20260604120000_company_profile_request.sql";
const SETUP_LIB = "lib/company/company-setup.ts";
const SETUP_PAGE = "app/[locale]/dashboard/start/company/page.tsx";
const SETUP_FORM = "components/app/company-setup-form.tsx";
const LOCALES = ["lt", "en"] as const;
const STATUSES = ["draft", "pending_verification", "unverified", "verified"];

describe("Guard: migration declares an honest verification ladder", () => {
  const sql = read(MIGRATION, REPO_ROOT);

  it("constrains verification_status to the 4 honest states", () => {
    for (const s of STATUSES) expect(sql).toContain(`'${s}'`);
    expect(sql).toMatch(/verification_status\s+in\s*\(/i);
  });

  it("defaults new rows to draft, not verified", () => {
    expect(sql).toMatch(/verification_status\s+text\s+not\s+null\s+default\s+'draft'/i);
  });

  it("the setup RPC can request but never fabricate a verified company", () => {
    // The only place next_status becomes 'verified' is the branch that keeps
    // an ALREADY-verified company verified. A submit only requests.
    expect(sql).toMatch(/next_status\s*:=\s*'pending_verification'/);
    expect(sql).toMatch(/next_status\s*:=\s*'draft'/);
    // The verified assignment must be gated on the company already being
    // verified (current_status = 'verified').
    const verifiedAssign = sql.match(/next_status\s*:=\s*'verified'/g) ?? [];
    expect(verifiedAssign.length).toBe(1);
    expect(sql).toMatch(/current_status\s*=\s*'verified'/);
  });

  it("is additive — no destructive drops of the companies table/columns", () => {
    expect(sql).not.toMatch(/drop\s+table\s+[^;]*companies/i);
    // (A guarded DROP CONSTRAINT for the re-runnable CHECK is allowed.)
  });
});

describe("Guard: the company-setup service is honest + migration-safe", () => {
  const lib = read(SETUP_LIB);

  it("exposes the 4-state verification type", () => {
    for (const s of STATUSES) expect(lib).toContain(`"${s}"`);
  });

  it("degrades to needs-migration when columns/RPC are absent", () => {
    expect(lib).toContain("needs-migration");
    expect(lib).toMatch(/42703/); // undefined_column
    expect(lib).toMatch(/42883/); // undefined_function
  });

  it("validates the company name and never forces a verified state", () => {
    expect(lib).toMatch(/length\s*<\s*2|length\s*>\s*200/);
    // The service never passes a verified flag to the RPC.
    expect(lib).not.toMatch(/verified\s*:\s*true/);
  });
});

describe("Guard: the setup page + form explain verification honestly", () => {
  const page = read(SETUP_PAGE);
  const form = read(SETUP_FORM);

  it("renders the verification status + explainer", () => {
    expect(page).toContain("company-start-verification-status");
    expect(page).toContain("verificationExplainer");
  });

  it("shows a verification notice and a request (not a verify) action", () => {
    expect(form).toContain("company-setup-verification-notice");
    expect(form).toContain("submitRequest");
    // No control that claims to verify the company itself.
    expect(form).not.toMatch(/verifyCompany|markVerified|setVerified/i);
  });

  it("collects the required organisation fields", () => {
    for (const field of [
      "legal_name",
      "country",
      "registration_code",
      "address",
      "website",
      "requester_role",
    ]) {
      expect(form).toContain(`name="${field}"`);
    }
  });
});

describe("Guard: setup copy is multi-sector + honest in LT and EN", () => {
  for (const loc of LOCALES) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const json = loadJson(`messages/${loc}.json`) as any;
    const setup: any = json?.roleDashboards?.company?.setup ?? {};
    /* eslint-enable @typescript-eslint/no-explicit-any */

    it(`${loc}: ships the verification status + explainer keys`, () => {
      for (const s of STATUSES) {
        expect(setup.verificationStatus?.[s]).toBeTruthy();
        expect(setup.verificationExplainer?.[s]).toBeTruthy();
      }
    });

    it(`${loc}: the name placeholder is NOT construction-only`, () => {
      const ph = String(setup.legalNamePlaceholder ?? "").toLowerCase();
      expect(ph).not.toMatch(/statyb|build\s*solutions|construction/);
    });

    it(`${loc}: the verification notice makes no fake-automatic claim`, () => {
      const notice = String(setup.verificationNotice ?? "");
      expect(notice.length).toBeGreaterThan(0);
      expect(notice).not.toMatch(/\bautomatic\s+verification\b/i);
      // It must state verification is required / human, not automatic.
      const honest = loc === "lt" ? /patvirtinim/i : /verif/i;
      expect(notice).toMatch(honest);
    });
  }
});
