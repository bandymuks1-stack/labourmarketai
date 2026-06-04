import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: company onboarding is AUTOMATIC-FIRST.
 *
 * A user creates a usable company immediately; admin approval is NOT the
 * default gate; 'verified' is never faked; the manual review is an optional
 * escalation; no direct authenticated companies UPDATE grant; the PR #250
 * verification trigger is preserved.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
function read(rel: string, root = APP_ROOT): string {
  return readFileSync(join(root, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const MIGRATION = "supabase/migrations/20260604140000_company_automatic_first.sql";
const LIB = "lib/company/company-setup.ts";
const LOCALES = ["lt", "en"] as const;

describe("Guard: the automatic-first migration", () => {
  const sql = read(MIGRATION, REPO_ROOT);
  const code = sql.replace(/--[^\n]*/g, " ");

  it("defaults new companies to active_unverified (usable immediately)", () => {
    expect(code).toMatch(/alter column verification_status set default 'active_unverified'/i);
  });

  it("widens the status ladder to include active_unverified + needs_checks", () => {
    const m = code.match(/verification_status in \(([^)]*)\)/i);
    expect(m).toBeTruthy();
    expect(m![1]).toMatch(/'active_unverified'/);
    expect(m![1]).toMatch(/'needs_checks'/);
  });

  it("derives the status from automated checks (not from admin approval)", () => {
    expect(code).toMatch(/automated\s*:=\s*case/i);
    expect(code).toMatch(/'needs_checks'/);
    expect(code).toMatch(/else 'active_unverified'/);
    // The normal (non-escalation) save uses the automated status.
    expect(code).toMatch(/else\s+next_status\s*:=\s*automated/);
  });

  it("treats manual review as an OPTIONAL escalation, never the default", () => {
    // pending_verification only on p_submit (explicit escalation).
    expect(code).toMatch(/elsif p_submit then\s*next_status\s*:=\s*'pending_verification'/);
    const pendingAssigns = code.match(/next_status\s*:=\s*'pending_verification'/g) ?? [];
    expect(pendingAssigns.length).toBe(1);
  });

  it("never fabricates 'verified' (kept only when already verified)", () => {
    const verifiedAssigns = code.match(/next_status\s*:=\s*'verified'/g) ?? [];
    expect(verifiedAssigns.length).toBe(1);
    expect(code).toMatch(/current_status\s*=\s*'verified'/);
  });

  it("preserves the PR #250 trigger (does not drop/replace it)", () => {
    expect(code).not.toMatch(/drop trigger[^\n]*trg_company_verification_guard/i);
    expect(code).not.toMatch(/create (or replace )?function public\.enforce_company_verification_guard/i);
  });

  it("introduces no direct companies INSERT/UPDATE grant to authenticated", () => {
    expect(code).not.toMatch(
      /\bgrant\b[\s\S]{0,80}?\b(insert|update)\b[\s\S]{0,120}?\bcompanies\b[\s\S]{0,60}?\bto\s+authenticated\b/i,
    );
  });

  it("is additive — no destructive drops of the companies table/columns", () => {
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
  });
});

describe("Guard: the status type carries the automatic-first states", () => {
  const lib = read(LIB);
  it("CompanyVerificationStatus includes active_unverified + needs_checks", () => {
    expect(lib).toMatch(/"active_unverified"/);
    expect(lib).toMatch(/"needs_checks"/);
  });
  it("the read fallback is active_unverified, not draft", () => {
    expect(lib).toMatch(/verification_status as CompanyVerificationStatus\) \?\? "active_unverified"/);
  });
});

describe("Guard: copy is automatic-first + honest (LT/EN)", () => {
  for (const loc of LOCALES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = loadJson(`messages/${loc}.json`) as any;
    const setup = json?.roleDashboards?.company?.setup;
    const adminCv = json?.admin?.companyVerification;

    it(`${loc}: setup status ladder + active_unverified/needs_checks present`, () => {
      for (const s of ["active_unverified", "needs_checks", "verified", "pending_verification"]) {
        expect(setup?.verificationStatus?.[s], `${loc} status.${s}`).toBeTruthy();
        expect(setup?.verificationExplainer?.[s], `${loc} explainer.${s}`).toBeTruthy();
      }
    });

    it(`${loc}: setup copy says usable now and NOT "wait for admin approval"`, () => {
      const notice = String(setup?.verificationNotice ?? "");
      const sub = String(setup?.formSubtitle ?? "");
      const blob = `${notice} ${sub}`.toLowerCase();
      // Must NOT carry the old "use REQUIRES verification" must-wait claim.
      // (Honest negations like "you do not need to wait for an admin" are fine,
      // so we ban the specific required-to-wait phrasing, not the word "wait".)
      expect(blob).not.toMatch(/requires verification|reikia patvirtinimo/);
      // No fake-automatic-verification claim.
      expect(notice).not.toMatch(/\bautomatic\s+verification\b/i);
      // States usability now.
      expect(blob).toMatch(loc === "lt" ? /naudojam|aktyv/i : /usable|active/i);
    });

    it(`${loc}: admin surface is framed as exception review, not an approval queue`, () => {
      const sub = String(adminCv?.subtitle ?? "").toLowerCase();
      expect(adminCv?.status?.active_unverified, `${loc} admin active_unverified`).toBeTruthy();
      expect(adminCv?.status?.needs_checks, `${loc} admin needs_checks`).toBeTruthy();
      expect(sub).toMatch(loc === "lt" ? /išimt|eskalav/i : /exception|escalation/i);
      expect(sub).toMatch(loc === "lt" ? /ne.*eilė|automatiškai/i : /not an approval queue|automatically/i);
    });
  }
});
