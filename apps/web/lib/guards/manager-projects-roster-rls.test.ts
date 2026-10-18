import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the manager RLS widening is exactly the owner-approved scope
 * (2026-09-24): projects SELECT / INSERT / UPDATE and company_workers SELECT
 * gain `OR manages_organization(...)` — the existing SECURITY DEFINER helper
 * `can_manage_project(...)` already uses. Pinned negatively too: no DELETE, no
 * other table, no grant, no new function, no role change; the rollback
 * restores the exact expressions production held.
 */
const root = resolve(__dirname, "..", "..");
const repo = resolve(root, "..", "..");
const readRepo = (rel: string) => readFileSync(resolve(repo, rel), "utf8");
const code = (src: string) => src.replace(/^\s*--.*$/gm, "");
const flat = (src: string) => code(src).replace(/\s+/g, " ").trim();

const NAME = "20260924140000_manager_projects_roster_rls_v1";

describe("Guard: manager_projects_roster_rls_v1 migration", () => {
  const sql = flat(readRepo(`supabase/migrations/${NAME}.sql`));

  it("alters exactly four policies — and projects_delete is not one of them", () => {
    const altered = [...sql.matchAll(/alter policy (\w+) on public\.(\w+)/g)].map((m) => `${m[2]}.${m[1]}`);
    expect(altered.sort()).toEqual([
      "company_workers.company_workers_select",
      "projects.projects_insert",
      "projects.projects_select",
      "projects.projects_update",
    ]);
    expect(sql).not.toMatch(/projects_delete/);
  });

  it("each keeps its current arms and adds only manages_organization", () => {
    expect(sql).toContain(
      "alter policy projects_select on public.projects using ( owns_company(company_id) or is_admin() or is_assigned_to_project(id) or public.manages_organization(organization_id) );",
    );
    expect(sql).toContain(
      "alter policy projects_insert on public.projects with check ( owns_company(company_id) or is_admin() or public.manages_organization(organization_id) );",
    );
    expect(sql).toContain(
      "alter policy projects_update on public.projects using ( owns_company(company_id) or is_admin() or public.manages_organization(organization_id) ) with check ( owns_company(company_id) or is_admin() or public.manages_organization(organization_id) );",
    );
    expect(sql).toContain(
      "alter policy company_workers_select on public.company_workers using ( owns_company(company_id) or owns_worker(worker_id) or is_admin() or exists ( select 1 from public.organizations o where o.legacy_company_id = company_workers.company_id and public.manages_organization(o.id) ) );",
    );
  });

  it("no grant, no new function, no role change, no data change", () => {
    expect(sql).not.toMatch(/\b(grant|revoke|create (or replace )?function|security definer|create policy|drop policy|alter role|set role)\b/i);
    expect(sql).not.toMatch(/\b(insert into|update public\.|delete from|truncate)\b/i);
  });

  it("the rollback restores the exact production expressions", () => {
    const down = flat(readRepo(`supabase/rollbacks/${NAME}.down.sql`));
    expect(down).toBe(
      [
        "alter policy projects_select on public.projects using (owns_company(company_id) or is_admin() or is_assigned_to_project(id));",
        "alter policy projects_insert on public.projects with check (owns_company(company_id) or is_admin());",
        "alter policy projects_update on public.projects using (owns_company(company_id) or is_admin()) with check (owns_company(company_id) or is_admin());",
        "alter policy company_workers_select on public.company_workers using (owns_company(company_id) or owns_worker(worker_id) or is_admin());",
      ].join(" "),
    );
  });

  it("it is the only migration that widens these policies (no second permission model)", () => {
    const dir = resolve(repo, "supabase", "migrations");
    const touching = readdirSync(dir).filter((f) =>
      /alter policy (projects_(select|insert|update)|company_workers_select)\b/i.test(code(readFileSync(resolve(dir, f), "utf8"))),
    );
    expect(touching).toEqual([`${NAME}.sql`]);
  });
});
