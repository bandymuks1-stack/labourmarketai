import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The assigned worker can read their project; nobody else gains anything.
 *
 * W11 audit P0-2 + P1-2, closed by ONE policy replacement. `projects_select`
 * has been, since `0001_initial_schema.sql`:
 *
 *     owns_company(company_id) OR is_admin() OR (status = 'live' AND auth.uid() IS NOT NULL)
 *
 * Two defects in one line:
 *
 *  - **P0-2** no assigned-worker branch, and every app-created project is
 *    `draft` with no write path to change it. The worker's own project is
 *    filtered out before the app sees it, so their calendar's project band is
 *    permanently empty and project↔booking conflict detection can never fire.
 *    A worker assigned to overlapping dates is told their schedule is clean.
 *  - **P1-2** the third branch is scoped to no company, organization or
 *    assignment — it is "any signed-in person, any tenant". Latent only
 *    because nothing can set `status = 'live'`, which makes it a trap armed
 *    for the first PR that adds a lifecycle write path.
 *
 * This guard is STATIC: it pins the migration's SQL, because the migration is
 * owner-gated and unapplied, so there is no database to query. When the gate
 * opens, the post-apply verification in the gate document is what proves the
 * live catalog — this file proves the intent shipped correctly.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(
  REPO,
  "supabase",
  "migrations",
  "20260803090000_project_assigned_worker_read_v1.sql",
);
const ROLLBACK = join(
  REPO,
  "supabase",
  "rollbacks",
  "20260803090000_project_assigned_worker_read_v1.down.sql",
);

const sql = readFileSync(MIGRATION, "utf8");
const down = readFileSync(ROLLBACK, "utf8");
/** Comments carry the reasoning; the assertions below must hit real SQL. */
const code = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ");

describe("the migration ships with its rollback", () => {
  it("both files exist and are paired by timestamp", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(ROLLBACK)).toBe(true);
  });

  it("the rollback restores the ORIGINAL policy, not an approximation", () => {
    expect(down).toMatch(/status\s*=\s*'live'\s+and\s+auth\.uid\(\)\s+is\s+not\s+null/);
    expect(down).toMatch(/drop function if exists public\.is_assigned_to_project/);
  });

  it("the rollback says what rolling back re-opens", () => {
    // A rollback that reads as "safe default" invites someone to run it
    // casually. The pre-migration state is the AUDITED one.
    expect(down).toMatch(/P1-2/);
    expect(down).toMatch(/P0-2/);
  });
});

describe("the new read branch is tied to a real active assignment", () => {
  it("the helper joins assignment → worker → the calling profile", () => {
    expect(code).toMatch(/create or replace function public\.is_assigned_to_project/);
    expect(code).toMatch(/from public\.project_worker_assignments/);
    expect(code).toMatch(/join public\.workers/);
    expect(code).toMatch(/w\.profile_id = auth\.uid\(\)/);
  });

  it("an ENDED assignment does not keep the project readable", () => {
    // `status = 'active'` is the whole difference between "is on this project"
    // and "was once on this project".
    expect(code).toMatch(/a\.status = 'active'/);
  });

  it("the helper revokes anon BY NAME, not just PUBLIC", () => {
    // Caught by `secdef-local-reset-reproducibility` on the first draft of this
    // migration, which revoked only PUBLIC. This function is created after the
    // 20260722160000 anon-reach closure, so that closure cannot reach it, and
    // the environment's default privileges leave it anon-reachable unless anon
    // is named. That is exactly the 2026-07-22 P0 shape: a default EXECUTE
    // grant no migration diff reveals, visible only in the catalog.
    expect(code).toMatch(
      /revoke all on function public\.is_assigned_to_project\(uuid\) from anon/,
    );
  });

  it("the helper is default-closed: no PUBLIC execute", () => {
    expect(code).toMatch(
      /revoke all on function public\.is_assigned_to_project\(uuid\) from public/,
    );
    expect(code).toMatch(
      /grant execute on function public\.is_assigned_to_project\(uuid\) to authenticated/,
    );
    expect(code).not.toMatch(/grant execute on function public\.is_assigned_to_project\(uuid\) to (public|anon)/);
  });

  it("it is SECURITY DEFINER with a pinned search_path", () => {
    expect(code).toMatch(
      /is_assigned_to_project[\s\S]{0,200}security definer set search_path = public/,
    );
  });
});

describe("the tenant-blind `live` branch is gone", () => {
  it("projects_select no longer grants read by status alone", () => {
    const policy = code.slice(code.indexOf("create policy projects_select"));
    expect(
      policy,
      "the any-authenticated-user `live` branch survived the replacement",
    ).not.toMatch(/status\s*=\s*'live'/);
  });

  it("the policy is exactly owner OR admin OR assigned", () => {
    const policy = code.slice(
      code.indexOf("create policy projects_select"),
      code.indexOf("create policy projects_select") + 400,
    );
    expect(policy).toMatch(/public\.owns_company\(company_id\)/);
    expect(policy).toMatch(/public\.is_admin\(\)/);
    expect(policy).toMatch(/public\.is_assigned_to_project\(id\)/);
  });

  it("write policies are NOT touched — this slice is read scope only", () => {
    // Widening read is the whole change. A worker must not gain manage,
    // budget, member or finance rights, and the safest proof is that the
    // migration never mentions those policies at all.
    expect(code).not.toMatch(/create policy projects_insert/);
    expect(code).not.toMatch(/create policy projects_update/);
    expect(code).not.toMatch(/create policy projects_delete/);
  });

  it("no other table, policy or function is altered", () => {
    // Blast radius, asserted rather than asserted-in-prose.
    const created = [...code.matchAll(/create policy (\w+)/g)].map((m) => m[1]);
    expect(created).toEqual(["projects_select"]);
    const funcs = [...code.matchAll(/create or replace function public\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(funcs).toEqual(["is_assigned_to_project"]);
    expect(code).not.toMatch(/alter table/i);
    expect(code).not.toMatch(/\bdrop table\b/i);
    expect(code).not.toMatch(/\b(insert into|update |delete from)\b/i);
  });
});

describe("the slice stayed narrow", () => {
  it("manages_organization is NOT added to projects_select (that is P0-3)", () => {
    // Audit slice 3. Wider change, own reasoning, own PR — and mixing it in
    // here would make this migration's blast radius impossible to state.
    const policy = code.slice(code.indexOf("create policy projects_select"));
    expect(policy).not.toMatch(/manages_organization/);
  });

  it("no project lifecycle write path is introduced (that is slice 1)", () => {
    expect(code).not.toMatch(/set_project_status/);
    expect(code).not.toMatch(/update_project_details/);
  });
});

describe("the gate is declared, not assumed", () => {
  it("the migration states its human gate and points at the document", () => {
    expect(sql).toMatch(/HUMAN GATE/);
    expect(sql).toMatch(/docs\/human-gates\/project-assigned-worker-read-gate\.md/);
  });

  it("the gate document exists", () => {
    expect(
      existsSync(
        join(REPO, "docs", "human-gates", "project-assigned-worker-read-gate.md"),
      ),
    ).toBe(true);
  });
});
