/**
 * Guards for the worker job discovery slice (feat/cc/worker-jobs-browse-v1).
 *
 *   1. The public read module relies on the user-scoped client and
 *      never imports the service-role credential.
 *   2. The read explicitly filters status='open' AND
 *      visibility='public' (defence in depth on top of the RLS
 *      policy that already does the same).
 *   3. The read caps results at READ_LIMIT_MAX so a producer flood
 *      cannot blow up the dashboard.
 *   4. The discover page calls auth.getUser() BEFORE the data fetch.
 *   5. The page + module + component carry no apply / match /
 *      verified / billing surface (honesty rule).
 *   6. i18n keys for jobDiscovery ship in LT and EN.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("Guard: job-postings-public stays user-scoped", () => {
  const src = read("lib/job-postings/job-postings-public.ts");

  it("uses the user-scoped supabase client", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/supabase\/server["']/);
  });

  it("never imports the service-role credential", () => {
    expect(src).not.toMatch(/createServiceRoleClient/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).not.toMatch(/service_role/);
  });

  it("filters status='open' AND visibility='public' in the query", () => {
    expect(src).toMatch(/\.eq\(\s*["']status["']\s*,\s*["']open["']\s*\)/);
    expect(src).toMatch(/\.eq\(\s*["']visibility["']\s*,\s*["']public["']\s*\)/);
  });

  it("caps result at READ_LIMIT_MAX", () => {
    expect(src).toMatch(/READ_LIMIT_MAX/);
    expect(src).toMatch(/Math\.min\(\s*READ_LIMIT_MAX/);
  });

  it("uses a tagged-result return shape (no thrown errors)", () => {
    expect(src).toMatch(/code:\s*["']not_authenticated["']/);
    expect(src).toMatch(/code:\s*["']permission_denied["']/);
  });

  it("does not introduce apply / match / publish / verified language", () => {
    const lower = src.toLowerCase();
    expect(lower).not.toMatch(/\bapply\(/);
    expect(lower).not.toMatch(/\bmatchcandidate\b/);
    expect(lower).not.toMatch(/\bmatchworker\b/);
    expect(lower).not.toMatch(/\bverified\b/);
  });
});

describe("Guard: discover page gates BEFORE any data fetch", () => {
  const src = read("app/[locale]/dashboard/discover/page.tsx");

  it("calls auth.getUser() before listOpenPublicJobPostings", () => {
    const authAt = src.indexOf("auth.getUser()");
    const fetchAt = src.indexOf("listOpenPublicJobPostings(");
    expect(authAt, "auth.getUser missing").toBeGreaterThan(-1);
    expect(fetchAt, "listOpenPublicJobPostings missing").toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(fetchAt);
  });

  it("imports the PublicJobPostingsList server component", () => {
    expect(src).toMatch(/PublicJobPostingsList/);
  });

  it("never wires an apply or match-action client component", () => {
    expect(src).not.toMatch(/apply/i);
    expect(src).not.toMatch(/matchCandidateAction/);
    expect(src).not.toMatch(/matchWorkerAction/);
  });
});

describe("Guard: list component is honest (no fake match / billing)", () => {
  const src = read("components/app/public-job-postings-list.tsx");

  it("does not invent placeholder cards or ranking", () => {
    const lower = src.toLowerCase();
    expect(lower).not.toMatch(/\bmatched for you\b/);
    expect(lower).not.toMatch(/\brecommended\b/);
    expect(lower).not.toMatch(/\btop pick\b/);
    expect(lower).not.toMatch(/\bsponsored\b/);
  });

  it("includes the explicit honest-note caption per posting", () => {
    expect(src).toMatch(/honestNote/);
  });
});

describe("Guard: no billing / payment / stripe surface in any of the slice files", () => {
  const files = [
    "lib/job-postings/job-postings-public.ts",
    "components/app/public-job-postings-list.tsx",
    "app/[locale]/dashboard/discover/page.tsx",
  ];
  for (const f of files) {
    it(`${f} has no billing / payment / stripe`, () => {
      const lower = read(f).toLowerCase();
      expect(lower).not.toMatch(/\bstripe\b/);
      expect(lower).not.toMatch(/\bcheckout\b/);
      expect(lower).not.toMatch(/\bsubscription\b/);
      expect(lower).not.toMatch(/\bpaywall\b/);
    });
  }
});

describe("Guard: i18n surface ships jobDiscovery in LT and EN", () => {
  for (const locale of ["lt", "en"] as const) {
    const json = JSON.parse(read(`messages/${locale}.json`)) as Record<
      string,
      unknown
    >;
    const jd = json.jobDiscovery as Record<
      string,
      Record<string, unknown>
    > | undefined;

    it(`${locale}.json has jobDiscovery.page.subtitle`, () => {
      expect(jd?.page).toBeTruthy();
      expect((jd?.page as Record<string, unknown> | undefined)?.subtitle).toBeTruthy();
    });

    it(`${locale}.json has jobDiscovery.list with required keys`, () => {
      const list = jd?.list as Record<string, unknown> | undefined;
      expect(list).toBeTruthy();
      for (const k of [
        "title",
        "body",
        "empty",
        "untitledRole",
        "project",
        "headcount",
        "salary",
        "startDate",
        "countries",
        "postedAt",
        "honestNote",
      ]) {
        expect(list?.[k], `${locale}.jobDiscovery.list.${k} missing`).toBeTruthy();
      }
    });
  }
});
