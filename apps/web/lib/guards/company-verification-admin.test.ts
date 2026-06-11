import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: the admin company-verification review surface is admin-only, writes
 * only through the SECURITY DEFINER RPC (no direct companies UPDATE grant),
 * preserves the PR #250 verification trigger, and never fakes a verified state.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

function read(rel: string, root = APP_ROOT): string {
  return readFileSync(join(root, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const MIGRATION = "supabase/migrations/20260604130000_admin_company_verification.sql";
const LIB = "lib/admin/company-verification.ts";
const ACTION = "lib/admin/company-verification-actions.ts";
const PAGE = "app/[locale]/dashboard/admin/company-verification/page.tsx";
const FORM = "components/app/company-verification-review.tsx";
const LOCALES = ["lt", "en"] as const;
const ADMIN_STATUSES = ["verified", "unverified", "pending_verification"];

describe("Guard: the admin verification RPC is admin-only + safe", () => {
  const sql = read(MIGRATION, REPO_ROOT);
  const code = sql.replace(/--[^\n]*/g, " ");

  it("defines a SECURITY DEFINER RPC", () => {
    expect(sql).toMatch(/create or replace function public\.admin_set_company_verification/);
    expect(sql).toMatch(/security definer/i);
  });

  it("rejects non-admins (not public.is_admin() → not_admin) before any write", () => {
    expect(sql).toMatch(/not\s+public\.is_admin\(\)/);
    expect(sql).toMatch(/return\s+'not_admin'/);
    const adminGateIdx = code.search(/not\s+public\.is_admin\(\)/);
    const updateIdx = code.search(/update\s+public\.companies/i);
    expect(adminGateIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(adminGateIdx);
  });

  it("only allows verified / unverified / pending_verification (never draft)", () => {
    expect(sql).toMatch(
      /not in \(\s*'verified',\s*'unverified',\s*'pending_verification'\s*\)/,
    );
    // The allowed-status check must not list 'draft'.
    const m = sql.match(/v_status not in \(([^)]*)\)/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toMatch(/'draft'/);
  });

  it("records the transition in audit_logs (no fake history)", () => {
    expect(sql).toMatch(/insert into public\.audit_logs/);
    expect(sql).toMatch(/'admin_set_company_verification'/);
    expect(sql).toMatch(/'from',\s*v_prev/);
    expect(sql).toMatch(/'to',\s*v_status/);
  });

  it("grants EXECUTE to authenticated and nothing else", () => {
    expect(sql).toMatch(/revoke all on function public\.admin_set_company_verification\(uuid, text, text\) from public/);
    expect(sql).toMatch(/grant execute on function public\.admin_set_company_verification\(uuid, text, text\) to authenticated/);
  });

  it("introduces NO direct companies INSERT/UPDATE grant to authenticated", () => {
    expect(code).not.toMatch(
      /\bgrant\b[\s\S]{0,80}?\b(insert|update)\b[\s\S]{0,120}?\bcompanies\b[\s\S]{0,60}?\bto\s+authenticated\b/i,
    );
  });

  it("preserves the PR #250 verification trigger (does not drop/replace it)", () => {
    expect(code).not.toMatch(/drop trigger[^\n]*trg_company_verification_guard/i);
    expect(code).not.toMatch(/create (or replace )?function public\.enforce_company_verification_guard/i);
  });

  it("is additive — no destructive drops", () => {
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
  });
});

describe("Guard: the page + action are admin-gated", () => {
  const page = read(PAGE);
  const action = read(ACTION);

  it("page awaits requireSuperadmin BEFORE loading data", () => {
    expect(page).toMatch(/from\s+["']@\/lib\/auth\/superadmin["']/);
    const guardIdx = page.search(/await\s+requireSuperadmin\(/);
    const loadIdx = page.search(/listCompanyVerificationRequests\(/);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeGreaterThan(guardIdx);
    expect(page).toMatch(/data-testid="admin-company-verification"/);
  });

  it("server action re-gates via requireSuperadmin", () => {
    expect(action).toMatch(/requireSuperadmin/);
  });
});

describe("Guard: the service layer never writes companies directly", () => {
  const lib = read(LIB);

  it("writes only through the admin RPC", () => {
    expect(lib).toMatch(/\.rpc\(\s*\n?\s*["']admin_set_company_verification["']/);
    expect(lib).not.toMatch(/\.from\(["']companies["']\)[\s\S]{0,80}\.update\(/);
    expect(lib).not.toMatch(/\.from\(["']companies["']\)[\s\S]{0,80}\.upsert\(/);
  });

  it("degrades to needs-migration when the column/RPC is absent", () => {
    expect(lib).toContain("needs-migration");
    expect(lib).toMatch(/42883/);
    expect(lib).toMatch(/42703/);
  });
});

describe("Guard: the review form is honest (no fake verify control beyond RPC)", () => {
  const form = read(FORM);
  it("submits the three explicit statuses via a hidden field", () => {
    expect(form).toMatch(/name="status"/);
    for (const s of ADMIN_STATUSES) expect(form).toContain(`setStatus("${s}")`);
    // No client-side trust badge / fake verified flag.
    expect(form).not.toMatch(/markVerified|fakeVerified|trustBadge/i);
  });
});

describe("Guard: admin verification i18n is present + parity-clean (LT/EN)", () => {
  for (const loc of LOCALES) {
    const json = loadJson(`messages/${loc}.json`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cv = (json.admin as any)?.companyVerification;

    it(`${loc}: companyVerification block exists with status + actions + empty`, () => {
      expect(cv, `${loc}.admin.companyVerification missing`).toBeTruthy();
      for (const s of ["draft", ...ADMIN_STATUSES]) {
        expect(cv.status?.[s], `${loc} status.${s}`).toBeTruthy();
      }
      for (const a of ["approve", "keepUnverified", "returnToPending"]) {
        expect(cv.actions?.[a], `${loc} actions.${a}`).toBeTruthy();
      }
      expect(cv.empty, `${loc} empty`).toBeTruthy();
      expect(cv.migrationBlocker, `${loc} migrationBlocker`).toBeTruthy();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((json.admin as any)?.hub?.companyVerification, `${loc} hub link`).toBeTruthy();
    });

    it(`${loc}: subtitle states verification is manual / not automatic`, () => {
      const sub = String(cv.subtitle ?? "");
      expect(sub).not.toMatch(/\bautomatic\s+verification\b/i);
      expect(sub).toMatch(loc === "lt" ? /rankiniu|žmogus/i : /manual|human/i);
    });
  }
});
