import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-3 (2026-09-19 completion audit): project facts — title, city, country,
 * start and end dates — get their ONE write path.
 *
 * WHAT WAS TRUE: after creation nothing could write these columns. On
 * production every project has country NULL and no dates, so the calendar's
 * project band, the operations "dates" chip and the booking-overlap check
 * could never work. A direct client UPDATE was tried and reverted: admin
 * writes must be gated RPCs, and the owner-scoped UPDATE policy would exclude
 * the organization managers `can_manage_project` admits.
 *
 * THE WRITE IS RED (new SECURITY DEFINER function) and lives in
 * supabase/migrations/20260919130000_update_project_facts_v1.sql, applied
 * only after the owner's approval. Dry-run on production inside an aborted
 * transaction (2026-09-19): stranger → not_found (anti-oracle); country
 * "Lithuania" → invalid/country; end < start → invalid_dates; 1-char title →
 * invalid; owner write → updated/changed=true with country LT, dates set and
 * granularity 'city'; same write again → updated/changed=false; completed
 * project → completed_read_only. Function and row confirmed absent/untouched
 * afterwards.
 *
 * This guard pins what is true regardless of apply state:
 *   1. the migration creates ONE function gated by the EXISTING
 *      can_manage_project, validates before it reads, refuses a completed
 *      project after authorization, keeps granularity truthful, and touches
 *      no other column / table / policy;
 *   2. the rollback drops exactly that function;
 *   3. the application writes ONLY through the RPC, re-validates every field,
 *      and degrades to the honest needs_migration notice until applied;
 *   4. the form pre-fills only stored values and is absent on a completed
 *      project; copy exists in every active locale.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");
const FILE = "20260919130000_update_project_facts_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${FILE}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${FILE}.down.sql`);
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("R-3 migration — one gated write for the project facts", () => {
  const raw = readFileSync(MIGRATION, "utf8");
  const sql = strip(raw);

  it("carries the human-gate annotation (RED, never auto-merged)", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/m);
  });

  it("creates exactly ONE function and changes no table, policy or row", () => {
    const defs = sql.match(/create or replace function public\.([a-z_0-9]+)/gi) ?? [];
    expect(defs).toEqual(["create or replace function public.update_project_facts_v1"]);
    expect(sql).not.toMatch(/create policy|drop policy|alter table|create table|delete from/i);
    // The only UPDATE is the projects row inside the function; the only
    // INSERT is the audit row.
    expect(sql.match(/update public\./gi)).toEqual(["update public."]);
    expect(sql).toMatch(/update public\.projects/);
    expect(sql.match(/insert into public\./gi)).toEqual(["insert into public."]);
    expect(sql).toMatch(/insert into public\.audit_logs/);
  });

  it("is gated by the EXISTING can_manage_project with the anti-oracle shape", () => {
    expect(sql).toMatch(/if not \(public\.can_manage_project\(p_project_id\) or public\.is_admin\(\)\) then/);
    expect(sql).toMatch(/if public\.is_assigned_to_project\(p_project_id\) then/);
    expect(sql).toMatch(/'outcome', 'not_authorized'/);
    expect(sql).toMatch(/'outcome', 'not_found'/);
    // No second authority model.
    expect(sql).not.toMatch(/owns_company|manages_organization|company_memberships/);
  });

  it("validates BEFORE it reads or locks, and refuses end < start", () => {
    const validationAt = sql.indexOf("'field', 'title'");
    const lockAt = sql.indexOf("for update");
    expect(validationAt).toBeGreaterThan(0);
    expect(validationAt).toBeLessThan(lockAt);
    expect(sql).toMatch(/v_country !~ '\^\[A-Z\]\{2\}\$'/);
    expect(sql).toMatch(/p_end_date < p_start_date/);
    expect(sql).toMatch(/'outcome', 'invalid_dates'/);
  });

  it("a completed project is read-only, checked AFTER authorization (no status probe)", () => {
    const authAt = sql.indexOf("can_manage_project(p_project_id)");
    const completedAt = sql.indexOf("'completed_read_only'");
    expect(completedAt).toBeGreaterThan(authAt);
  });

  it("keeps location precision truthful and never invents a coordinate or confirms a location", () => {
    expect(sql).toMatch(/case when v_city is not null then 'city' else 'country' end/);
    expect(sql).not.toMatch(/location_confirmed\s*=|latitude|longitude|geocode/i);
    // Status, visibility and every other column stay untouched.
    const setClause = sql.slice(sql.indexOf("update public.projects"), sql.indexOf("where id = p_project_id"));
    expect(setClause).not.toMatch(/status\s*=|visibility_level|responsible_profile_id|housing_provided|organization_id|company_id/);
  });

  it("is idempotent — the same facts produce no write and no audit row", () => {
    expect(sql).toMatch(/'outcome', 'updated', 'changed', false/);
    const idempotentAt = sql.indexOf("'changed', false");
    const updateAt = sql.indexOf("update public.projects");
    expect(idempotentAt).toBeLessThan(updateAt);
  });

  it("keeps the privilege floor: authenticated only", () => {
    expect(sql).toMatch(/revoke all on function public\.update_project_facts_v1\(uuid, text, text, text, date, date\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.update_project_facts_v1\(uuid, text, text, text, date, date\) to authenticated/);
    expect(sql).not.toMatch(/grant[^;]*\bto (anon|public)\b/i);
  });

  it("is reversible: the rollback drops exactly that function", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = strip(readFileSync(ROLLBACK, "utf8"));
    expect(down).toMatch(/drop function if exists public\.update_project_facts_v1\(uuid, text, text, text, date, date\)/);
    expect(down).not.toMatch(/update public|delete from|alter table|create policy/i);
  });
});

describe("R-3 application — the write goes ONLY through the RPC and degrades honestly", () => {
  const actions = read("lib/projects/project-admin-actions.ts");
  const form = read("components/app/project-facts-form.tsx");
  const page = read("app/[locale]/dashboard/projects/[id]/operations/page.tsx");

  it("setProjectFactsAction calls update_project_facts_v1 and never writes the table", () => {
    expect(actions).toMatch(/export async function setProjectFactsAction\(formData: FormData\)/);
    expect(actions).toMatch(/\.rpc\("update_project_facts_v1", \{/);
    expect(actions).not.toMatch(/\.from\("projects"\)/);
  });

  it("re-validates every field server-side before the RPC (title, city, ISO country, real days, order)", () => {
    const fn = actions.slice(actions.indexOf("export async function setProjectFactsAction"));
    expect(fn).toMatch(/title\.length < PROJECT_TITLE_MIN \|\| title\.length > PROJECT_TITLE_MAX/);
    expect(fn).toMatch(/city\.length > PROJECT_CITY_MAX/);
    expect(fn).toMatch(/!isIsoCountry\(countryRaw\)/);
    expect(fn).toMatch(/readIsoDay\(formData\.get\("startDate"\)\)/);
    expect(fn).toMatch(/endDate < startDate\) finish\(locale, projectId, "invalid_dates"\)/);
    // Validation precedes the RPC call.
    expect(fn.indexOf("invalid_dates")).toBeLessThan(fn.indexOf('.rpc("update_project_facts_v1"'));
  });

  it("maps a missing function to the honest needs_migration notice and every RPC outcome to its own notice", () => {
    const fn = actions.slice(actions.indexOf("export async function setProjectFactsAction"));
    expect(fn).toMatch(/MIGRATION_MISSING\.has\(error\.code \?\? ""\)/);
    for (const o of ["updated", "invalid", "invalid_dates", "completed_read_only", "not_authorized", "not_found"]) {
      expect(fn, o).toMatch(new RegExp(`outcome === "${o}"\\) finish\\(locale, projectId, "${o}"\\)`));
    }
    // Both new notices are accepted by the page and rendered from copy.
    expect(page).toMatch(/"invalid_dates",\s*"completed_read_only",/);
  });

  it("the form is mounted in the manage strip, pre-fills stored values only and is absent when completed", () => {
    expect(page).toMatch(/<ProjectFactsForm locale=\{locale\} projectId=\{id\} project=\{ops\.project\} \/>/);
    expect(form).toMatch(/action=\{setProjectFactsAction\}/);
    expect(form).toMatch(/if \(project\.status === "completed"\)/);
    expect(form).toMatch(/data-testid="ops-manage-facts-readonly"/);
    for (const f of ["title", "city", "country", "startDate", "endDate"]) {
      expect(form, f).toMatch(new RegExp(`defaultValue=\\{project\\.${f} \\?\\? ""\\}`));
    }
    expect(form).toMatch(/ALL_ISO_COUNTRIES\.map/);
    expect(form).not.toMatch(/latitude|longitude|geocod/i);
    expect(form).not.toMatch(/"use client"/);
  });

  it("copy exists in every active locale for the form and both new notices", () => {
    for (const loc of ["en", "lt", "ru", "nl", "de"]) {
      const json = JSON.parse(read(`messages/${loc}.json`));
      const manage = json.projectOps.manage;
      for (const k of ["title", "city", "country", "countryNone", "startDate", "endDate", "save", "hint", "completedReadOnly"]) {
        expect(typeof manage.facts[k], `${loc}.facts.${k}`).toBe("string");
        expect(manage.facts[k].trim().length, `${loc}.facts.${k}`).toBeGreaterThan(0);
      }
      for (const k of ["invalid_dates", "completed_read_only"]) {
        expect(typeof manage.notice[k], `${loc}.notice.${k}`).toBe("string");
        expect(manage.notice[k].trim().length, `${loc}.notice.${k}`).toBeGreaterThan(0);
      }
    }
  });
});
