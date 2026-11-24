import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-1 (2026-09-19 completion audit, HIGH): a roster relationship may only
 * come into being through the person's own acceptance.
 *
 * WHAT WAS PROVEN ON PRODUCTION (rolled back): as the real owner of a real
 * company, `insert into company_workers (company_id, worker_id, status)
 * values (own, <any discoverable worker>, 'active')` was ADMITTED — rows=1.
 * The forged row then reads as a two-sided fact in `caller_manages_worker`
 * (project assignment), the roster branch of `can_view_worker` (private
 * row visible without discoverability consent) and the agency offer roster
 * check.
 *
 * THE FIX IS RED (grant + policy change) and lives in
 * supabase/migrations/20260919100000_roster_writes_rpc_only_v1.sql, applied
 * only after the owner's approval. This guard pins THREE things that are
 * true regardless of apply state:
 *   1. the migration is the minimum: revoke direct writes, drop the two
 *      FOR ALL write policies, touch NO select policy, NO function, NO row;
 *   2. its rollback restores exactly what it removed;
 *   3. the application never wrote these tables with the caller's client —
 *      every writer is a SECURITY DEFINER RPC — so the change cannot break
 *      a legitimate path.
 *
 * THE HOSTILE CONTRACT (to run live, rolled back, after apply):
 *   FAIL  owner inserts arbitrary active company_workers row      → 42501
 *   FAIL  agency owner inserts arbitrary active agency_workers row → 42501
 *   FAIL  owner updates an existing row's status/worker directly   → 42501
 *   PASS  invite_company_worker → accept_company_worker_invitation (as the
 *         worker) → row exists → assign_company_worker_role by the owner
 *   PASS  every read policy unchanged (owner, the worker, admin)
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATION = join(REPO, "supabase", "migrations", "20260919100000_roster_writes_rpc_only_v1.sql");
const ROLLBACK = join(REPO, "supabase", "rollbacks", "20260919100000_roster_writes_rpc_only_v1.down.sql");
const WEB = join(REPO, "apps", "web");

const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("R-1 migration — the minimum authority correction", () => {
  const sql = strip(readFileSync(MIGRATION, "utf8"));
  const raw = readFileSync(MIGRATION, "utf8");

  it("carries the human-gate annotation (RED, never auto-merged)", () => {
    expect(raw).toMatch(/^--\s*@human-gate-approved/m);
  });

  it("revokes direct writes from the API role on BOTH roster tables", () => {
    expect(sql).toMatch(/revoke\s+insert,\s*update,\s*delete\s+on\s+public\.company_workers\s+from\s+authenticated/i);
    expect(sql).toMatch(/revoke\s+insert,\s*update,\s*delete\s+on\s+public\.agency_workers\s+from\s+authenticated/i);
  });

  it("drops exactly the two FOR ALL write policies and nothing else", () => {
    expect(sql).toMatch(/drop policy if exists company_workers_write on public\.company_workers/i);
    expect(sql).toMatch(/drop policy if exists agency_workers_write on public\.agency_workers/i);
    const drops = sql.match(/drop policy/gi) ?? [];
    expect(drops).toHaveLength(2);
    expect(sql).not.toMatch(/_select/i);
    expect(sql).not.toMatch(/create policy|create or replace function|alter table|update public|delete from|insert into/i);
    expect(sql).not.toMatch(/grant\s/i);
  });

  it("is reversible: the rollback restores both policies and both grants verbatim", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = strip(readFileSync(ROLLBACK, "utf8"));
    expect(down).toMatch(/create policy company_workers_write on public\.company_workers for all/i);
    expect(down).toMatch(/using \(public\.owns_company\(company_id\) or public\.is_admin\(\)\)/i);
    expect(down).toMatch(/create policy agency_workers_write on public\.agency_workers for all/i);
    expect(down).toMatch(/using \(public\.owns_agency\(agency_id\) or public\.is_admin\(\)\)/i);
    expect(down).toMatch(/grant insert, update, delete on public\.company_workers to authenticated/i);
    expect(down).toMatch(/grant insert, update, delete on public\.agency_workers to authenticated/i);
  });
});

describe("no legitimate path writes the roster tables with the caller's own client", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(join(WEB, "lib"));
  walk(join(WEB, "app"));
  walk(join(WEB, "components"));

  it("every insert/update/delete on company_workers or agency_workers is a SECURITY DEFINER RPC", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8").replace(/\s+/g, " ");
      for (const table of ["company_workers", "agency_workers"]) {
        const re = new RegExp(`\\.from\\("${table}"\\)[^;]{0,200}?\\.(insert|update|upsert|delete)\\(`, "g");
        if (re.test(src)) offenders.push(`${f.replace(WEB, "")} → ${table}`);
      }
    }
    expect(offenders, "a direct roster write would be refused once R-1 applies — route it through the accept/assign RPCs").toEqual([]);
  });

  it("the accept RPCs are the writers, and they require the caller to BE the invited worker", () => {
    const accept = readFileSync(
      join(REPO, "supabase", "migrations", "0036_accept_worker_invitation_rpc.sql"),
      "utf8",
    );
    expect(accept).toMatch(/create or replace function public\.accept_company_worker_invitation/);
    expect(accept).toMatch(/security definer/);
    expect(accept).toMatch(/lower\(i\.invited_email\) = lower\(v_email\)/);
    expect(accept).toMatch(/insert into public\.company_workers \(company_id, worker_id, status\)/);
    expect(accept).toMatch(/create or replace function public\.accept_agency_worker_invitation/);
  });
});
