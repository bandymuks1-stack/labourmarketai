/**
 * Source-level guards for feat/cc/pilot-role-dashboards.
 *
 * Pilot doctrine the role dashboards encode:
 *
 *   1. Each role dashboard is server-side gated on the user holding
 *      the matching role in `profile_roles` (NOT just `active_role`
 *      — role choice is an entry point, not a prison).
 *   2. No dashboard makes fake matching, fake verification, or fake
 *      AI claims. The first-action card is honest about being a
 *      placeholder until the draft-persistence slice lands.
 *   3. Nothing on these pages writes to the DB in this PR. They are
 *      pure read + informational shells.
 *   4. LT + EN copy explicitly rejects "verified" / "confirmed" /
 *      "patvirtinta" wording in this flow.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

describe("Guard: requireRoleOrRedirect helper is correct", () => {
  const src = read("lib/auth/require-role.ts");

  it("is server-only", () => {
    expect(src).toMatch(/import\s+["']server-only["']/);
  });

  it("redirects unauthenticated users to login", () => {
    expect(src).toMatch(/redirect\(`\/\$\{locale\}\/auth\/login`\)/);
  });

  it("redirects users WITHOUT the expected role to /dashboard (not 403)", () => {
    // Role choice is not a prison — users without the role should be
    // sent to the overview where the role switcher can help, not get
    // a hard error page.
    expect(src).toMatch(
      /heldRoles\.has\(expectedRole\)/,
    );
    expect(src).toMatch(/redirect\(`\/\$\{locale\}\/dashboard`\)/);
  });

  it("reads role from profile_roles, NOT profiles.active_role", () => {
    // The CODE must reference profile_roles. The DOCSTRING explains
    // active_role for context; strip comments before the negative
    // assertion so the doc reference doesn't false-trigger.
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*\n/g, "");
    expect(codeOnly).toMatch(/\.from\(["']profile_roles["']\)/);
    expect(codeOnly).not.toMatch(/active_role/);
  });
});

describe("Guard: each role dashboard calls the gate FIRST", () => {
  const cases = [
    {
      route: "app/[locale]/dashboard/company/page.tsx",
      role: "company",
      i18nKey: "roleDashboards.company",
      testid: "company-dashboard",
    },
    {
      route: "app/[locale]/dashboard/agency/page.tsx",
      role: "agency",
      i18nKey: "roleDashboards.agency",
      testid: "agency-dashboard",
    },
    {
      route: "app/[locale]/dashboard/buyer/page.tsx",
      role: "customer",
      i18nKey: "roleDashboards.buyer",
      testid: "buyer-dashboard",
    },
  ];

  for (const { route, role, i18nKey, testid } of cases) {
    describe(route, () => {
      const src = read(route);

      it("imports + calls requireRoleOrRedirect with the matching role slug", () => {
        expect(src).toMatch(
          /from\s+["']@\/lib\/auth\/require-role["']/,
        );
        const re = new RegExp(
          `await\\s+requireRoleOrRedirect\\(\\s*locale\\s*,\\s*["']${role}["']\\s*\\)`,
        );
        expect(src).toMatch(re);
      });

      it("does not import the service-role admin client", () => {
        expect(src).not.toMatch(/createAdminClient/);
        expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      });

      it("does not write to the DB", () => {
        // The role dashboards are pure read/render. Mutations live in
        // the deferred drafts-persistence PR.
        expect(src).not.toMatch(/\.insert\(/);
        expect(src).not.toMatch(/\.update\(/);
        expect(src).not.toMatch(/\.delete\(/);
        expect(src).not.toMatch(/\.upsert\(/);
        expect(src).not.toMatch(/\bsaveProfileSkillClaimsAction\b/);
      });

      it("passes the matching i18n namespace + testId to RoleDashboard", () => {
        expect(src).toMatch(
          new RegExp(
            `getTranslations\\(["']${i18nKey.replace(/\./g, "\\.")}["']\\)`,
          ),
        );
        expect(src).toMatch(
          new RegExp(`testId=["']${testid}["']`),
        );
      });
    });
  }
});

describe("Guard: shared RoleDashboard renders the pilot disclaimer + no fake matching", () => {
  const src = read("components/app/role-dashboard.tsx");

  it("renders the pilot disclaimer slot", () => {
    expect(src).toMatch(/pilotDisclaimer/);
    expect(src).toMatch(/pilot-disclaimer/);
  });

  it("renders the first-action slot with a status label", () => {
    expect(src).toMatch(/firstActionTitle/);
    expect(src).toMatch(/firstActionBody/);
    expect(src).toMatch(/firstActionStatus/);
  });

  it("links back to /dashboard/profile (the universal capability surface)", () => {
    expect(src).toMatch(/href=["']\/dashboard\/profile["']/);
  });
});

describe("Guard: roleDashboards i18n is honest (LT + EN)", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json roleDashboards.* keys present + no fake matching/verified copy`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      const ns = json.roleDashboards as
        | Record<string, Record<string, unknown>>
        | undefined;
      expect(ns, `${locale}.roleDashboards namespace missing`).toBeTruthy();

      for (const role of ["company", "agency", "buyer"] as const) {
        const r = ns![role];
        expect(r, `${locale}.roleDashboards.${role} missing`).toBeTruthy();
        // Required keys.
        for (const key of [
          "eyebrow",
          "title",
          "subtitle",
          "pilotDisclaimer",
          "profileLink",
        ]) {
          expect(r[key], `${locale}.roleDashboards.${role}.${key}`).toBeTruthy();
        }
        const firstAction = r.firstAction as Record<string, string>;
        for (const key of ["title", "body", "status"]) {
          expect(
            firstAction[key],
            `${locale}.roleDashboards.${role}.firstAction.${key}`,
          ).toBeTruthy();
        }

        // Honesty: no fake verified/confirmed copy.
        const flat = JSON.stringify(r).toLowerCase();
        expect(flat).not.toMatch(/\bverified\b|\bconfirmed\b/);
        expect(flat).not.toMatch(/\bpatvirtinta\b|\bpatvirtinti\b/);
        // No "match found" / "atitikimas rastas" claims — matching is
        // deferred.
        expect(flat).not.toMatch(/match found|atitikimas rastas/);
      }
    });
  }
});
