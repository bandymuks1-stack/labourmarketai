/**
 * Guards for the Job Postings v1 slice (feat/job-postings-v1).
 *
 *   1. Migration 0023 grants the right table privileges to
 *      `authenticated` (and only to `authenticated`) — never to
 *      service_role.
 *   2. The service module sanitises every input, never bypasses
 *      RLS via the service-role client.
 *   3. The action wrapper is a thin pass-through that revalidates
 *      the dashboard path on success.
 *   4. The dashboard page calls `requireRoleOrRedirect("company")`
 *      BEFORE any DB read.
 *   5. The new section has no "matching" / "verified" / "shared by
 *      default" affordances, and never names Stripe / billing.
 *   6. The i18n surface ships both LT and EN with the expected
 *      keys.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Guard: 0023 migration grants are explicit to authenticated only", () => {
  const sql = read("../../supabase/migrations/0023_job_postings_grants.sql");

  it("grants SELECT on companies to authenticated", () => {
    expect(sql).toMatch(
      /grant\s+select\s+on\s+public\.companies\s+to\s+authenticated/i,
    );
  });

  it("grants SELECT + INSERT + UPDATE on projects to authenticated", () => {
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update\s+on\s+public\.projects\s+to\s+authenticated/i,
    );
  });

  it("grants full CRUD on job_demands to authenticated", () => {
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.job_demands\s+to\s+authenticated/i,
    );
  });

  it("does not grant anything to service_role", () => {
    expect(sql).not.toMatch(/grant[\s\S]*?\bto\s+service_role\b/i);
  });

  it("does not alter or drop any existing RLS policy", () => {
    expect(sql).not.toMatch(/drop\s+policy/i);
    expect(sql).not.toMatch(/alter\s+policy/i);
    // No table-level changes either.
    expect(sql).not.toMatch(/alter\s+table\s+public\.(companies|projects|job_demands)/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/drop\s+column/i);
  });
});

describe("Guard: job-postings service module stays owner-scoped", () => {
  const src = read("lib/job-postings/job-postings.ts");

  it("uses the user-scoped supabase client (createClient from server.ts)", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/supabase\/server["']/);
  });

  it("never imports or names the service-role client", () => {
    expect(src).not.toMatch(/createServiceRoleClient/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).not.toMatch(/service_role/);
  });

  it("resolves company_id from auth.uid(), not from caller input", () => {
    expect(src).toMatch(/resolveOwnCompanyId/);
    expect(src).toMatch(/\.eq\(\s*["']profile_id["']\s*,\s*userId\s*\)/);
  });

  it("validates roleTitle as required and caps string length", () => {
    expect(src).toMatch(/ROLE_TITLE_MAX/);
    expect(src).toMatch(/code:\s*["']invalid_input["']/);
  });

  it("clamps headcount + salary to bounded ranges", () => {
    expect(src).toMatch(/HEADCOUNT_MIN/);
    expect(src).toMatch(/HEADCOUNT_MAX/);
    expect(src).toMatch(/SALARY_MIN_EUR/);
    expect(src).toMatch(/SALARY_MAX_EUR/);
  });

  it("filters preferred countries to ISO-3166-1 two-letter codes only", () => {
    expect(src).toMatch(/COUNTRY_CODE_PATTERN/);
    expect(src).toMatch(/PREFERRED_COUNTRIES_MAX/);
  });

  it("maps RLS / permission-denied errors to a tagged code", () => {
    expect(src).toMatch(/mapPermissionError/);
    expect(src).toMatch(/code:\s*["']permission_denied["']/);
  });

  it("inserts job_demand with default status='open' (no 'filled' / 'closed' on create)", () => {
    expect(src).toMatch(/status:\s*["']open["']/);
    expect(src).not.toMatch(/status:\s*["']filled["']/);
  });

  it("never claims matching / verified / shared / publish behaviour", () => {
    const lower = src.toLowerCase();
    expect(lower).not.toMatch(/\bmatch\(/);
    expect(lower).not.toMatch(/\bverify\(/);
    expect(lower).not.toMatch(/\bshare\(/);
    expect(lower).not.toMatch(/\bpublish\(/);
  });
});

describe("Guard: job-postings server-action wrapper is a thin pass-through", () => {
  const src = read("lib/job-postings/job-postings-actions.ts");

  it("declares 'use server' as the file directive", () => {
    expect(src.trimStart()).toMatch(/^"use server"/);
  });

  it("re-exports only create + update-status (no delete / share / publish)", () => {
    expect(src).toMatch(/createJobPostingAction/);
    expect(src).toMatch(/updateJobPostingStatusAction/);
    expect(src).not.toMatch(/shareJobPostingAction/);
    expect(src).not.toMatch(/publishJobPostingAction/);
  });

  it("revalidates the company dashboard path on success only", () => {
    expect(src).toMatch(/revalidatePath\(`\/\$\{locale\}\/dashboard\/company`\)/);
  });
});

describe("Guard: company dashboard gates BEFORE any job-postings fetch", () => {
  const src = read("app/[locale]/dashboard/company/page.tsx");

  it("requireRoleOrRedirect precedes listJobPostingsForOwnCompany", () => {
    const requireAt = src.indexOf("requireRoleOrRedirect");
    const fetchAt = src.indexOf("listJobPostingsForOwnCompany(");
    expect(requireAt, "requireRoleOrRedirect missing").toBeGreaterThan(-1);
    expect(fetchAt, "listJobPostingsForOwnCompany missing").toBeGreaterThan(-1);
    expect(
      requireAt,
      "requireRoleOrRedirect must precede listJobPostingsForOwnCompany",
    ).toBeLessThan(fetchAt);
  });

  it("renders the new section + keeps the pilot-draft first-action section", () => {
    expect(src).toMatch(/company-dashboard-job-postings/);
    expect(src).toMatch(/company-dashboard-first-action/);
  });

  it("imports the new components", () => {
    expect(src).toMatch(/JobPostingForm/);
    expect(src).toMatch(/JobPostingsList/);
  });
});

describe("Guard: no fake-match / billing surface in the new files", () => {
  const files = [
    "lib/job-postings/job-postings.ts",
    "lib/job-postings/job-postings-actions.ts",
    "lib/job-postings/types.ts",
    "components/app/job-posting-form.tsx",
    "components/app/job-postings-list.tsx",
    "app/[locale]/dashboard/company/page.tsx",
  ];

  for (const f of files) {
    it(`${f} has no billing / payment / fake-match surface`, () => {
      const lower = read(f).toLowerCase();
      expect(lower).not.toMatch(/\bstripe\b/);
      expect(lower).not.toMatch(/\bcheckout\b/);
      expect(lower).not.toMatch(/\bsubscription\b/);
      expect(lower).not.toMatch(/\bmatchcandidate\b/);
      expect(lower).not.toMatch(/\bmatchworker\b/);
      expect(lower).not.toMatch(/\/api\/match\b/);
      expect(lower).not.toMatch(/\bverified\b/);
    });
  }
});

describe("Guard: i18n surface ships jobPostings in LT and EN", () => {
  for (const locale of ["lt", "en"] as const) {
    const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
      string,
      unknown
    >;
    const jp = json.jobPostings as
      | Record<string, Record<string, unknown>>
      | undefined;

    it(`${locale}.json has jobPostings.list with required keys`, () => {
      expect(jp, `${locale}.jobPostings missing`).toBeTruthy();
      const list = jp?.list as Record<string, unknown> | undefined;
      expect(list, `${locale}.jobPostings.list missing`).toBeTruthy();
      for (const k of [
        "title",
        "body",
        "empty",
        "headcount",
        "salary",
        "startDate",
        "countries",
      ]) {
        expect(list?.[k], `${locale}.jobPostings.list.${k} missing`).toBeTruthy();
      }
      // status enum keys
      const status = list?.status as Record<string, unknown> | undefined;
      for (const k of ["open", "paused", "filled", "closed"]) {
        expect(status?.[k], `${locale}.jobPostings.list.status.${k} missing`).toBeTruthy();
      }
    });

    it(`${locale}.json has jobPostings.form with required keys`, () => {
      const form = jp?.form as Record<string, unknown> | undefined;
      expect(form, `${locale}.jobPostings.form missing`).toBeTruthy();
      for (const k of [
        "openCreate",
        "submitButton",
        "submitting",
        "submitError",
        "createdNotice",
      ]) {
        expect(form?.[k], `${locale}.jobPostings.form.${k} missing`).toBeTruthy();
      }
      const field = form?.field as Record<string, Record<string, unknown>> | undefined;
      for (const k of [
        "roleTitle",
        "projectTitle",
        "headcount",
        "salary",
        "countries",
        "startDate",
        "housing",
        "visibility",
      ]) {
        expect(field?.[k], `${locale}.jobPostings.form.field.${k} missing`).toBeTruthy();
      }
    });
  }
});
