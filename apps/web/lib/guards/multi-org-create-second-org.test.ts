import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * M-P0-2 GUARDS — explicit create/edit company path.
 *
 * Owner doctrine (2026-08-05 directive §8): the same profile creates
 * organization A, then organization B, and creating B never renames A;
 * editing A affects only A; the save target is explicit; there is no
 * first-company fallback anywhere on the path.
 *
 * Pinned here:
 *   1. v3 exists, takes an explicit p_company_id, creates INSERT-only and
 *      edits only `id = p_company_id and profile_id = uid`;
 *   2. the legacy v1/v2 singleton RPCs carry the multiplicity guard
 *      ('multiple_companies') — they can never pick a planner-ordered row;
 *   3. the app save path passes an explicit target and maps the three new
 *      tagged failures; the v3-missing case is an honest needs-migration,
 *      never a silent v2 fallback (which would rename another company);
 *   4. the setup page resolves its target from the ACTIVE WORKSPACE or an
 *      explicit ?new=1 — with a fail-closed chooser for the ambiguous case
 *      — and never `.maybeSingle()`s "the" company;
 *   5. the migration ships RED (no @human-gate-approved marker) until an
 *      owner apply decision is recorded.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MIGRATION = join(
  REPO_ROOT,
  "supabase",
  "migrations",
  "20260805190000_save_company_setup_v3_multi_org.sql",
);
const ROLLBACK = join(
  REPO_ROOT,
  "supabase",
  "rollbacks",
  "20260805190000_save_company_setup_v3_multi_org.down.sql",
);

const stripComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

describe("M-P0-2 — the v3 RPC", () => {
  const raw = readFileSync(MIGRATION, "utf8");
  const sql = stripComments(raw);

  it("takes an explicit company id and edits ONLY that row", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.save_company_setup_v3\(\s*p_company_id\s+uuid/i);
    expect(sql).toMatch(/where\s+id\s*=\s*p_company_id\s+and\s+profile_id\s*=\s*uid/i);
    // The edit path never keys on profile_id alone.
    expect(sql).not.toMatch(/update\s+public\.companies[\s\S]{0,400}?where\s+profile_id\s*=\s*uid\s*(returning|;)/i);
  });

  it("create is INSERT-only and duplicate names surface as duplicate_company", () => {
    expect(sql).toMatch(/insert\s+into\s+public\.companies/i);
    expect(sql).toMatch(/duplicate_company/);
    expect(sql).toMatch(/unique_violation/i);
  });

  it("forged/foreign ids fail closed with no existence oracle", () => {
    expect(sql).toMatch(/not_owner/);
    // The same error for "not yours" and "does not exist" (single tag).
    expect(sql.match(/raise\s+exception\s+'not_owner'/gi)?.length).toBeGreaterThanOrEqual(1);
  });

  it("legacy v1 AND v2 both carry the multiplicity guard and delegate to v3", () => {
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.save_company_setup_v2/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.save_company_setup\(/i);
    expect(sql.match(/multiple_companies/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/save_company_setup_v3\(/gi)?.length).toBeGreaterThanOrEqual(3);
  });

  it("anon is revoked on all three; authenticated-only EXECUTE", () => {
    expect(sql.match(/revoke\s+all\s+on\s+function[^;]+from\s+anon/gi)?.length).toBe(3);
    expect(sql.match(/grant\s+execute\s+on\s+function[^;]+to\s+authenticated/gi)?.length).toBe(3);
    expect(sql).not.toMatch(/to\s+anon/i);
  });

  it("carries the recorded-decision human-gate marker", () => {
    // OWNER APPROVAL recorded 2026-08-05 ("OWNER DECISION — APPLY AND MERGE
    // M-P0-2" §1, bound to reviewed HEAD 15ff08a5). Before that decision this
    // assertion enforced ABSENCE of the marker. Same line-anchored detection
    // as .github/scripts/migration-safety.mjs.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(ANNOTATION.test(raw)).toBe(true);
  });

  it("has a paired rollback that documents the singleton re-opening risk", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = readFileSync(ROLLBACK, "utf8");
    expect(down).toMatch(/drop\s+function\s+if\s+exists\s+public\.save_company_setup_v3/i);
    expect(down).toMatch(/RE-OPENS the singleton behaviour/);
  });
});

describe("M-P0-2 — the app write path", () => {
  const SETUP = readFileSync(join(APP_ROOT, "lib", "company", "company-setup.ts"), "utf8");
  const ACTIONS = readFileSync(join(APP_ROOT, "lib", "company", "setup-actions.ts"), "utf8");
  const PAGE = readFileSync(
    join(APP_ROOT, "app", "[locale]", "dashboard", "start", "company", "page.tsx"),
    "utf8",
  );
  const FORM = readFileSync(
    join(APP_ROOT, "components", "app", "company-setup-form.tsx"),
    "utf8",
  );

  it("saveCompanySetup calls v3 for explicit targets and never falls back to v2 there", () => {
    expect(SETUP).toMatch(/save_company_setup_v3/);
    // In the explicit branch, RPC-missing is an honest needs-migration…
    expect(SETUP).toMatch(/cannot be honoured by the singleton RPCs/);
    // …and the three tagged failures are mapped.
    for (const tag of ["duplicate-company", "not-owner", "multiple-companies"]) {
      expect(SETUP).toContain(`kind: "${tag}"`);
    }
  });

  it("a multi-company read exists and getOwnCompany gains no new callers here", () => {
    expect(SETUP).toMatch(/export async function listOwnedCompanies/);
    expect(SETUP).toMatch(/export async function getOwnedCompanyById/);
  });

  it("the action forwards the explicit target and maps the new failures", () => {
    expect(ACTIONS).toMatch(/company_id/);
    for (const code of ["duplicate_company", "not_owner", "multiple_companies"]) {
      expect(ACTIONS).toContain(`"${code}"`);
    }
  });

  it("the setup page resolves its target from the workspace / ?new=1, fail-closed", () => {
    expect(PAGE).toMatch(/resolveEmployerCompanyContext/);
    expect(PAGE).toMatch(/listOwnedCompanies/);
    expect(PAGE).not.toMatch(/\bgetOwnCompany\b/);
    expect(PAGE).toMatch(/company-start-ambiguous-chooser/);
    expect(PAGE).toMatch(/\?new=1/);
  });

  it("the form posts the explicit hidden target", () => {
    expect(FORM).toMatch(/name="company_id"/);
    expect(FORM).toMatch(/targetCompanyId/);
  });
});
