import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards for company/agency worker-management clarity (ops cycle PR C).
 * The "role coordination not enabled" note must be driven by the
 * operations role-capability map, render honestly, and carry no fake
 * claims — so it auto-disappears only when foreman actually becomes
 * enabled, never by hard-coded optimism.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}

const FORBIDDEN = [
  "patvirtinta",
  "verified",
  "best match",
  "ai matched",
  "guaranteed",
  "fully working",
];

describe("worker-management coordination note is capability-driven", () => {
  const cases = [
    {
      page: "app/[locale]/dashboard/company/page.tsx",
      section: "components/app/company-workers-section.tsx",
      note: "company-workers-coordination-note",
    },
    {
      page: "app/[locale]/dashboard/agency/page.tsx",
      section: "components/app/agency-workers-section.tsx",
      note: "agency-workers-coordination-note",
    },
  ];

  for (const c of cases) {
    it(`${c.page} drives roleCoordinationEnabled from the capability map`, () => {
      const page = read(c.page);
      expect(page).toMatch(
        /from\s+["']@\/lib\/operations\/role-capabilities["']/,
      );
      expect(page).toMatch(
        /roleCoordinationEnabled=\{isOperationsRoleEnabled\("foreman"\)\}/,
      );
    });

    it(`${c.section} renders the not-enabled note gated on the flag`, () => {
      const src = read(c.section);
      expect(src).toMatch(/!roleCoordinationEnabled/);
      expect(src).toMatch(new RegExp(`data-testid="${c.note}"`));
      expect(src).toMatch(/labels\.coordinationHeading/);
      expect(src).toMatch(/labels\.coordinationBody/);
      expect(src).toMatch(/labels\.coordinationNextAction/);
    });
  }
});

describe("coordination copy present + honest (LT + EN, company + agency)", () => {
  for (const locale of ["lt", "en"] as const) {
    for (const role of ["company", "agency"] as const) {
      it(`${locale} roleDashboards.${role}.workers coordination keys`, () => {
        const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
          string,
          unknown
        >;
        const workers = (
          (
            (json.roleDashboards as Record<string, unknown>)[role] as Record<
              string,
              unknown
            >
          ).workers
        ) as Record<string, string>;
        expect(workers.coordinationHeading, `${locale}.${role}`).toBeTruthy();
        expect(workers.coordinationBody).toBeTruthy();
        expect(workers.coordinationNextAction).toBeTruthy();
        const flat = (
          workers.coordinationHeading +
          workers.coordinationBody +
          workers.coordinationNextAction
        ).toLowerCase();
        for (const phrase of FORBIDDEN) {
          expect(
            flat.includes(phrase),
            `${locale}.${role} coordination copy must not contain "${phrase}"`,
          ).toBe(false);
        }
        // Must say "not enabled" / "dar neįjungtas" honestly.
        expect(flat).toMatch(
          locale === "lt" ? /neįjungt/ : /not enabled/,
        );
      });
    }
  }
});

describe("worker operations role/title is bridge-driven (PR C)", () => {
  const sections = [
    "components/app/company-workers-section.tsx",
    "components/app/agency-workers-section.tsx",
  ];
  for (const s of sections) {
    it(`${s} computes per-worker context via the helper`, () => {
      const src = read(s);
      expect(src).toMatch(
        /from\s+["']@\/lib\/operations\/employment-journal-context["']/,
      );
      expect(src).toMatch(/computeEmploymentJournalContext\(/);
      expect(src).toMatch(/labels\.operations\.columnHeading/);
      expect(src).toMatch(/data-review-capability=/);
    });
  }

  const libs = [
    "lib/company/company-workers.ts",
    "lib/agency/agency-workers.ts",
  ];
  for (const l of libs) {
    it(`${l} reads bridge columns with a 42703 (column-absent) fallback`, () => {
      const src = read(l);
      expect(src).toMatch(/operations_role/);
      expect(src).toMatch(/journal_review_enabled/);
      // Graceful degrade when the owner-gated migration is not applied.
      expect(src).toMatch(/42703|UNDEFINED_COLUMN_CODE/);
    });
  }

  for (const locale of ["lt", "en"] as const) {
    for (const role of ["company", "agency"] as const) {
      it(`${locale} ${role} operations role labels present`, () => {
        const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
          string,
          unknown
        >;
        const ops = (
          (
            (json.roleDashboards as Record<string, unknown>)[role] as Record<
              string,
              unknown
            >
          ).workers as Record<string, unknown>
        ).operations as Record<string, unknown>;
        expect(ops?.columnHeading, `${locale}.${role}`).toBeTruthy();
        expect(ops?.notAssigned).toBeTruthy();
        const roleLabels = ops?.roleLabels as Record<string, string>;
        for (const k of [
          "worker",
          "foreman",
          "project_manager",
          "company_admin",
          "agency_admin",
        ]) {
          expect(roleLabels?.[k], `${locale}.${role}.${k}`).toBeTruthy();
        }
      });
    }
  }
});
