/**
 * Source-level guards for the controlled real-user pilot readiness
 * sprint (feat/cc/pilot-readiness-superadmin).
 *
 * The superadmin gate, the admin panel pages, and the grant script
 * all have invariants that must hold regardless of which Supabase
 * project the test happens to point at. These guards check the
 * SOURCE FILES — they prove the right code paths are wired without
 * running against production.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: server-side superadmin gate", () => {
  const helper = read("lib/auth/superadmin.ts");

  it("declares server-only", () => {
    expect(helper).toMatch(/import\s+["']server-only["']/);
  });

  it("isSuperadmin checks profiles.active_role === 'admin'", () => {
    // Accept both `profile.active_role` (after non-null guard) and
    // `profile?.active_role` (optional-chained) phrasings.
    expect(helper).toMatch(/profile\??\.active_role\s*===\s*["']admin["']/);
  });

  it("requireSuperadmin redirects non-admins server-side", () => {
    // Must use next/navigation redirect, not a client-side throw.
    expect(helper).toMatch(/from\s+["']next\/navigation["']/);
    expect(helper).toMatch(/redirect\(`\/\$\{locale\}\/auth\/login`\)/);
    expect(helper).toMatch(/redirect\(`\/\$\{locale\}\/dashboard`\)/);
  });

  it("requireSuperadmin runs BEFORE rendering admin pages", () => {
    // Spot-check the two admin pages call requireSuperadmin in their
    // body (and import it from the helper module).
    const page = read("app/[locale]/dashboard/admin/page.tsx");
    expect(page).toMatch(
      /from\s+["']@\/lib\/auth\/superadmin["']/,
    );
    expect(page).toMatch(/await\s+requireSuperadmin\(\s*locale\s*\)/);

    const userPage = read(
      "app/[locale]/dashboard/admin/users/[id]/page.tsx",
    );
    expect(userPage).toMatch(
      /from\s+["']@\/lib\/auth\/superadmin["']/,
    );
    expect(userPage).toMatch(/await\s+requireSuperadmin\(\s*locale\s*\)/);
  });

  it("admin pages do NOT use service-role to bypass RLS", () => {
    // The admin reads go through the regular user-scoped createClient
    // from `@/lib/supabase/server`; admin reads succeed because the
    // `is_admin()` RLS helper grants them. Importing createAdminClient
    // here would bypass RLS and is forbidden by this sprint's spec.
    const page = read("app/[locale]/dashboard/admin/page.tsx");
    const userPage = read(
      "app/[locale]/dashboard/admin/users/[id]/page.tsx",
    );
    for (const file of [page, userPage]) {
      expect(file).not.toMatch(/createAdminClient/);
      expect(file).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });
});

describe("Guard: grant-superadmin script safety posture", () => {
  const script = read("scripts/admin-grant-superadmin.ts");

  it("defaults to dry-run when no mode flag is passed", () => {
    expect(script).toMatch(/args\.dryRun\s*=\s*true/);
    // The default-to-dry-run logic must run after parseArgs.
    expect(script).toMatch(
      /if\s*\(\s*!args\.apply\s*&&\s*!args\.dryRun\s*\)\s*\{[\s\S]*?args\.dryRun\s*=\s*true/,
    );
  });

  it("requires BOTH --apply AND --i-understand-this-mutates-production to mutate", () => {
    expect(script).toMatch(
      /if\s*\(\s*args\.apply\s*&&\s*!args\.understand\s*\)\s*\{[\s\S]*?abort/,
    );
  });

  it("emits structured audit JSON for every action", () => {
    expect(script).toMatch(/function\s+audit\(/);
    expect(script).toMatch(/script:\s*["']admin-grant-superadmin["']/);
    // Catalogue of action strings the script reports. They can live
    // inside ternaries or as direct literals — we just need each
    // canonical action verb to appear somewhere in the file.
    for (const action of [
      "dry-run.would-grant",
      "dry-run.noop",
      "apply.granted",
      "apply.failed",
      "apply.noop",
    ]) {
      expect(script, `audit action ${action} missing`).toContain(action);
    }
  });

  it("never logs the service-role key", () => {
    // The script reads SUPABASE_SERVICE_ROLE_KEY but must not include
    // it in any audit() / console.log call. Conservative substring
    // check — any literal mention in a log call would be flagged.
    const codeOnly = script
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).not.toMatch(/console\.log\([^)]*serviceRoleKey/);
    expect(codeOnly).not.toMatch(/audit\(\{[^}]*serviceRoleKey/);
  });

  it("looks up target by email and is idempotent on already-admin rows", () => {
    expect(script).toMatch(/\.eq\(["']email["'],\s*args\.email\)/);
    expect(script).toMatch(/alreadyAdmin\s*=\s*profile\.active_role\s*===\s*["']admin["']/);
  });

  it("is wired as the `admin:grant-superadmin` package script", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["admin:grant-superadmin"]).toBe(
      "tsx scripts/admin-grant-superadmin.ts",
    );
  });
});

describe("Guard: manual-add capability uses the existing save path", () => {
  const section = read(
    "components/app/capability-profile-section.tsx",
  );

  it("uses the same saveProfileSkillClaimsAction (no parallel write path)", () => {
    expect(section).toMatch(/saveProfileSkillClaimsAction/);
    expect(section).toMatch(
      /from\s+["']@\/lib\/profile\/profile-skill-claims-actions["']/,
    );
  });

  it("never writes to workers / bio from this surface", () => {
    expect(section).not.toMatch(/\bfrom\(["']workers["']\)/);
    expect(section).not.toMatch(/\bworkers\.bio\b/);
  });

  it("renders an input + button gated by required testids for e2e", () => {
    expect(section).toMatch(
      /data-testid=["']capability-profile-manual-add["']/,
    );
    expect(section).toMatch(
      /data-testid=["']capability-profile-manual-input["']/,
    );
    expect(section).toMatch(
      /data-testid=["']capability-profile-manual-add-button["']/,
    );
  });

  it("calls router.refresh() after a successful add so the server-rendered list updates", () => {
    expect(section).toMatch(
      /saveProfileSkillClaimsAction\s*\([\s\S]{0,200}router\.refresh\(\)/,
    );
  });
});

describe("Guard: admin i18n surfaces honest labels (no fake verification)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.admin keys exist and don't claim fake verification`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const admin = json.admin as Record<string, unknown>;
      expect(admin, `${locale}.admin namespace missing`).toBeTruthy();
      // Required user-visible keys.
      expect(admin.title).toBeTruthy();
      expect(admin.subtitle).toBeTruthy();

      // No fake-verified wording anywhere in the admin copy. The
      // panel describes pilot state honestly — it does not say a
      // user's claims are "verified", "confirmed", or "patvirtinta".
      // EXCEPTIONS: `companyVerification` is the legitimate company-
      // verification review surface (admin verifies a COMPANY); its ladder
      // vocabulary is asserted honest separately below. `matching` is the
      // Phase 3.2 workbench surfacing the REAL skill ladder (worker_skills
      // verified=true = manager-confirmed loop) + the request status ladder;
      // its declared-vs-confirmed honesty is asserted below and in
      // matching-workbench.test.ts.
      // `market` (S4) is excluded for the same reason as `matching`: it
      // surfaces the REAL skill ladder (workers with manager-confirmed
      // skills are counted NEXT TO the total, never alone) — its honest
      // pairing is asserted below.
      // `league` (TASK 07.4) is excluded for the same reason: its
      // "with confirmed skills" count is the REAL worker_skills
      // verified=true ladder, rendered next to the raw team-size count;
      // honesty is asserted in t07-league.test.ts.
      const adminSansVerify: Record<string, unknown> = { ...admin };
      delete adminSansVerify.companyVerification;
      delete adminSansVerify.matching;
      delete adminSansVerify.market;
      delete adminSansVerify.league;
      const flat = JSON.stringify(adminSansVerify).toLowerCase();
      expect(flat).not.toMatch(/\bverified\b|\bconfirmed\b/);
      expect(flat).not.toMatch(/\bpatvirtinta\b|\bpatvirtinti\b/);

      // The matching workbench keeps the declared/confirmed distinction
      // explicit — "confirmed" is allowed there ONLY because the declared
      // counterpart is rendered next to it and the match is human-recorded.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const matching = admin.matching as any;
      expect(matching?.supply?.skillsDeclared, `${locale} matching declared label`).toBeTruthy();
      expect(matching?.supply?.skillsConfirmed, `${locale} matching confirmed label`).toBeTruthy();
      expect(matching?.humanNote, `${locale} matching human note`).toBeTruthy();

      // S4 market view honest pairing: the confirmed-skills sub-count label
      // exists ONLY next to the total-workers label + the real-counts method
      // note (no standalone "verified" claim).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const market = admin.market as any;
      expect(market?.supply?.workers, `${locale} market workers label`).toBeTruthy();
      expect(market?.supply?.confirmed, `${locale} market confirmed label`).toBeTruthy();
      expect(market?.methodNote, `${locale} market method note`).toBeTruthy();

      // The company verification ladder is honest: explicit unverified +
      // pending states, no automatic-verification claim.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cv = admin.companyVerification as any;
      expect(cv?.status?.unverified, `${locale} cv.status.unverified`).toBeTruthy();
      expect(cv?.status?.pending_verification, `${locale} cv.pending`).toBeTruthy();
      expect(String(cv?.subtitle ?? "")).not.toMatch(/\bautomatic\s+verification\b/i);
    });
  }
});
