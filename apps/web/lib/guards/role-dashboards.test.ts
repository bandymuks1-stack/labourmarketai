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

      it("does not write to the DB directly (mutations go through pilot-drafts-actions)", () => {
        // The page itself is pure read + render. Mutations live in the
        // server-action wrapper used by PilotDraftForm; the page never
        // calls supabase.from(...).insert/update/delete inline.
        expect(src).not.toMatch(/\.insert\(/);
        expect(src).not.toMatch(/\.update\(/);
        expect(src).not.toMatch(/\.delete\(/);
        expect(src).not.toMatch(/\.upsert\(/);
        // The narrative-skills surface stays out of role dashboards.
        expect(src).not.toMatch(/\bsaveProfileSkillClaimsAction\b/);
      });

      it("uses the matching i18n namespace + data-testid", () => {
        expect(src).toMatch(
          new RegExp(
            `getTranslations\\(["']${i18nKey.replace(/\./g, "\\.")}["']\\)`,
          ),
        );
        expect(src).toMatch(
          new RegExp(`data-testid=["']${testid}["']`),
        );
      });

      it("renders the pilot disclaimer + profile link inline", () => {
        // PR B inlined the shell on each role page (the shared
        // RoleDashboard component was removed once each page had its
        // own draft form layout). Re-assert the per-page invariants
        // that used to live on the shared component.
        expect(src).toMatch(/pilotDisclaimer/);
        expect(src).toMatch(/href=["']\/dashboard\/profile["']/);
      });
    });
  }
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
        for (const key of ["title", "body"]) {
          // `status` (the "Ruošiama" placeholder) was removed in PR B
          // (feat/cc/pilot-draft-flows) when the form replaced the
          // placeholder; title/body remain as the form's section header.
          expect(
            firstAction[key],
            `${locale}.roleDashboards.${role}.firstAction.${key}`,
          ).toBeTruthy();
        }

        // Honesty: no fake verified/confirmed copy. The company `setup` block
        // introduces an HONEST verification ladder (draft → pending →
        // unverified → verified) — that legitimate vocabulary is asserted
        // separately below, so it is excluded from this blanket word ban.
        const rest: Record<string, unknown> = { ...(r as Record<string, unknown>) };
        delete rest.setup;
        const flat = JSON.stringify(rest).toLowerCase();
        expect(flat).not.toMatch(/\bverified\b|\bconfirmed\b/);
        expect(flat).not.toMatch(/\bpatvirtinta\b|\bpatvirtinti\b/);
        // No "match found" / "atitikimas rastas" claims — matching is
        // deferred.
        expect(flat).not.toMatch(/match found|atitikimas rastas/);
      }
    });
  }

  // The company profile-request ladder must be present AND honest: it carries
  // an explicit `unverified` + `pending_verification` state and explains that
  // full company use requires verification (it never asserts auto-verify).
  for (const locale of ["lt", "en"] as const) {
    it(`${locale}.json company.setup verification ladder is honest`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        unknown
      >;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setup = (json.roleDashboards as any)?.company?.setup;
      expect(setup, `${locale}.roleDashboards.company.setup missing`).toBeTruthy();
      const vstatus = setup.verificationStatus ?? {};
      for (const s of [
        "draft",
        "pending_verification",
        "unverified",
        "verified",
      ]) {
        expect(vstatus[s], `${locale} verificationStatus.${s}`).toBeTruthy();
      }
      // The notice states verification is required / human — not automatic.
      expect(setup.verificationNotice).toBeTruthy();
      expect(String(setup.verificationNotice)).not.toMatch(
        /\bautomatic\s+verification\b/i,
      );
    });
  }
});
