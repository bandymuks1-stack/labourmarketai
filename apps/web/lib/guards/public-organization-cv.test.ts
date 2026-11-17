import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PUBLIC_CV_HOURS_STEP,
  PUBLIC_CV_MIN_PEOPLE,
  publicCvFromRow,
} from "@/lib/organization-evidence/public-organization-cv-model";

/**
 * GUARD — the public company Living CV (register 3.36). Owner rulings
 * 2026-11-16 / 2026-11-17: aggregated data only; a minimum group of 5 people;
 * shown only while the public profile is on; no personal data; computed by a
 * narrow database function, never by service-role reads in the application.
 */
const WEB = resolve(__dirname, "../..");
const REPO = resolve(WEB, "../..");
const src = (p: string) => readFileSync(resolve(WEB, p), "utf8");
const MIGRATION = "supabase/migrations/20261117060000_public_organization_cv_v1.sql";
const ROLLBACK = "supabase/rollbacks/20261117060000_public_organization_cv_v1.down.sql";
const sql = readFileSync(resolve(REPO, MIGRATION), "utf8");

const row = (over: Record<string, unknown> = {}) => ({
  projects_running: 1,
  projects_completed: 2,
  journal_people: 6,
  journal_hours: 40,
  journal_first_month: "2026-01",
  journal_last_month: "2026-06",
  history_people: 5,
  history_day_hours: "150", // numeric arrives as a string from PostgREST
  history_first_month: "2024-12",
  history_last_month: "2025-07",
  ...over,
});

describe("public company Living CV — the application re-checks the database row", () => {
  it("k is 5 and hours are multiples of 10", () => {
    expect(PUBLIC_CV_MIN_PEOPLE).toBe(5);
    expect(PUBLIC_CV_HOURS_STEP).toBe(10);
  });

  it("a block with fewer than 5 people, or no people count, is dropped whole", () => {
    expect(publicCvFromRow(row({ journal_people: 4 }))?.journal).toBeNull();
    expect(publicCvFromRow(row({ history_people: null }))?.history).toBeNull();
    expect(publicCvFromRow(row({ journal_people: 5 }))?.journal?.people).toBe(5);
  });

  it("no passing block: nothing at all, and project counts never stand alone", () => {
    expect(publicCvFromRow(row({ journal_people: 4, history_people: 4 }))).toBeNull();
    expect(publicCvFromRow(null)).toBeNull();
    expect(publicCvFromRow(undefined)).toBeNull();
  });

  it("hours are re-rounded to 10 even if a function returned finer figures", () => {
    const cv = publicCvFromRow(row({ journal_hours: 37, history_day_hours: "152.5" }));
    expect(cv?.journal?.hours).toBe(40);
    expect(cv?.history?.dayHours).toBe(150);
  });

  it("only counts, hours and months leave: an extra column a widened function might add never passes", () => {
    const cv = publicCvFromRow(row({ worker_name: "Synthetic Person", project_title: "Synthetic project", place: "Synthetic Street 1" }));
    const keys: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
      else keys.push(path);
    };
    walk(cv, "");
    expect(keys.sort()).toEqual(
      [
        "history.dayHours",
        "history.firstMonth",
        "history.lastMonth",
        "history.people",
        "journal.firstMonth",
        "journal.hours",
        "journal.lastMonth",
        "journal.people",
        "projects.completed",
        "projects.running",
      ].sort(),
    );
    expect(JSON.stringify(cv)).not.toMatch(/Synthetic/);
  });

  it("months must look like YYYY-MM; a day-precise date is not published", () => {
    const cv = publicCvFromRow(row({ journal_first_month: "2026-01-14", history_last_month: "July" }));
    expect(cv?.journal?.firstMonth).toBeNull();
    expect(cv?.history?.lastMonth).toBeNull();
  });
});

describe("public company Living CV — the read path holds no service role", () => {
  const reader = src("lib/organization-evidence/public-organization-cv.ts");

  it("calls the one database function with the anonymous key, and reads no table", () => {
    expect(reader).toContain('rpc("get_public_organization_cv_v1"');
    expect(reader).toContain("requireSupabaseClientEnv()");
    expect(reader).not.toMatch(/supabase\/admin|createAdminClient|SERVICE_ROLE|serviceRoleKey/);
    expect(reader).not.toMatch(/\.from\(/);
  });

  it("one database call per organization per few minutes: the page gets only the cached export", () => {
    expect(reader).toMatch(/export const readPublicOrganizationCv = unstable_cache\(\s*readPublicOrganizationCvUncached,/);
    expect(reader).not.toMatch(/export\s+(async\s+)?function\s+readPublicOrganizationCvUncached/);
    const seconds = Number(/PUBLIC_CV_REVALIDATE_SECONDS = (\d+)/.exec(reader)?.[1]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(600);
    // A cached function may not read the request: the client carries no cookie.
    expect(reader).toMatch(/persistSession: false/);
    expect(reader).not.toMatch(/@\/lib\/supabase\/server|cookies\(\)/);
  });

  it("the public page renders it only through the component", () => {
    const page = src("app/[locale]/business/[slug]/page.tsx");
    expect(page).toContain("<PublicOrganizationCv organizationId={profile.id}");
    expect(page).not.toMatch(/readPublicOrganizationCv|get_public_organization_cv_v1/);
    const component = src("components/app/organization/public-organization-cv.tsx");
    expect(component).toContain('import { readPublicOrganizationCv } from "@/lib/organization-evidence/public-organization-cv";');
  });

  it("switching the profile on says that these totals go public (consent)", () => {
    const panel = src("components/app/business-public-profile-panel.tsx");
    expect(panel).toContain('t("cv.enableHint")');
    const en = JSON.parse(src("messages/en.json")).businessProfile.cv.enableHint as string;
    expect(en).toMatch(/at least 5 people/);
    expect(en).toMatch(/Never names/);
  });
});

describe("public company Living CV — the database function keeps the owner's rules", () => {
  it("is SECURITY DEFINER with a fixed search_path, STABLE, and gated on the organization's own opt-in", () => {
    expect(sql).toMatch(/security definer\s+set search_path = public, pg_temp/);
    expect(sql).toMatch(/\bstable\b/);
    expect(sql).toMatch(/select o\.public_profile_enabled\s+into v_enabled/);
    expect(sql).toMatch(/if v_enabled is distinct from true then\s+return;/);
  });

  it("applies k >= 5 and the 10 h step inside the database", () => {
    expect(sql).toMatch(/c_min_people constant integer := 5;/);
    expect(sql).toMatch(/c_hours_step constant numeric := 10;/);
    expect(sql).toMatch(/if not v_j_pass and not v_h_pass then\s+return;/);
  });

  it("returns numbers and months only: no id, name, title, place or text column", () => {
    const shape = /returns table \(([\s\S]*?)\)\s*language/.exec(sql)?.[1] ?? "";
    const cols = shape.split(",").map((c) => c.trim().split(/\s+/));
    expect(cols.map(([n]) => n)).toEqual([
      "projects_running",
      "projects_completed",
      "journal_people",
      "journal_hours",
      "journal_first_month",
      "journal_last_month",
      "history_people",
      "history_day_hours",
      "history_first_month",
      "history_last_month",
    ]);
    for (const [, type] of cols) expect(["integer", "numeric", "text"]).toContain(type);
    for (const [n, type] of cols) if (type === "text") expect(n).toMatch(/_month$/);
  });

  it("applies #3421's education rule verbatim, and counts only projects a passing block points at", () => {
    const education = /rt\.category <> 'education'\s*\)\s*or \(ec\.status = 'active' and ec\.journal_review_enabled is true\)/g;
    expect(sql.match(education)?.length).toBe(2); // the journal contexts AND the linked projects
    expect(sql).toMatch(/where v_j_pass\s+and ec\.organization_id = p_organization_id/);
    expect(sql).toMatch(/where v_h_pass\s+and r\.organization_id = p_organization_id/);
    expect(sql).toMatch(/p\.record_state is distinct from 'duplicate'/);
  });

  it("is callable by visitors, not by PUBLIC, and changes no data", () => {
    expect(sql).toMatch(/revoke all on function public\.get_public_organization_cv_v1\(p_organization_id uuid\) from public;/);
    expect(sql).toMatch(/grant execute on function public\.get_public_organization_cv_v1\(p_organization_id uuid\) to anon, authenticated;/);
    const body = /as \$\$([\s\S]*?)\$\$;/.exec(sql)?.[1] ?? "";
    expect(body).not.toMatch(/\b(insert|update|delete|truncate|execute)\b/i);
  });

  it("has a rollback that drops exactly this function", () => {
    expect(existsSync(resolve(REPO, ROLLBACK))).toBe(true);
    expect(readFileSync(resolve(REPO, ROLLBACK), "utf8")).toMatch(
      /drop function if exists public\.get_public_organization_cv_v1\(uuid\);/,
    );
  });
});
