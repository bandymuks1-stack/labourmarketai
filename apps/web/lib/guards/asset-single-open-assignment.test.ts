import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * MKT-3 — ONE asset, ONE pair of hands.
 *
 * THE DEFECT THIS PINS. `issue_asset_v1` as it shipped (20260718170000) wrote
 * an `issued` row and set `availability = 'assigned'` without asking whether
 * the asset was already out: no availability test, no open-assignment test, no
 * row lock. Two managers of the same organization were each told "issued", and
 * the same drill was owed by two people. Worse, `lib/assets/assets.ts` keeps
 * only the FIRST open assignment per asset (`if (!activeByAsset.has(...))`), so
 * the manager's screen showed one holder while both workers saw the tool in
 * their own list — the surface that could have revealed it was the surface
 * that hid it.
 *
 * WHAT PROVED THE FIX, AND WHAT THIS FILE IS FOR. The real evidence is
 * `scripts/db-proof/asset-single-open-assignment.sh`: a live PostgreSQL 16
 * cluster, the actual migration files executed verbatim, and two genuinely
 * concurrent psql sessions. It measured 2 open assignments before and 1 after,
 * with the loser BLOCKING on the row lock for the whole 2s the winner held its
 * transaction. This file cannot re-run that in CI. What it can do is make sure
 * the properties that proof depended on are still in the files it read — so
 * nobody quietly removes the lock, the index, or the ordering that makes
 * transfer legal, and leaves the proof describing a migration that no longer
 * exists.
 */

const repoRoot = join(__dirname, "..", "..", "..", "..");
const webRoot = join(__dirname, "..", "..");
const MIGRATION = "supabase/migrations/20260914120000_asset_single_open_assignment_v1.sql";
const ROLLBACK = "supabase/rollbacks/20260914120000_asset_single_open_assignment_v1.down.sql";

const migration = readFileSync(join(repoRoot, MIGRATION), "utf8");
const rollback = readFileSync(join(repoRoot, ROLLBACK), "utf8");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");

/** Executable SQL only — a rule the file merely TALKS about is not a rule. */
function code(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** The body of one `create or replace function public.<name>` in the file. */
function bodyOf(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is not defined in this file`).toBeGreaterThanOrEqual(0);
  const from = sql.slice(start);
  const end = from.indexOf("end; $$;");
  expect(end, `${name} has no terminated body`).toBeGreaterThan(0);
  return code(from.slice(0, end));
}

describe("the database itself refuses a second open assignment", () => {
  it("a partial unique index pins one OPEN assignment per asset", () => {
    const c = code(migration);
    expect(c).toMatch(/create unique index if not exists\s+asset_assignments_one_open_per_asset/i);
    expect(c).toMatch(/on public\.asset_assignments \(asset_id\)/i);
    // The predicate is the whole point: closed states may repeat freely, so an
    // asset can accumulate a history and still never be out twice.
    expect(c).toMatch(/where status in \('issued',\s*'acknowledged'\)/i);
  });

  it("the index is the guarantee, so it must not be scoped to a single writer", () => {
    // A guarantee that only holds for one RPC is not a guarantee. If this ever
    // grows a `where issued_by = ...` or similar, a service-role job or a
    // repair script walks straight through it.
    const idx = code(migration).slice(
      code(migration).indexOf("create unique index"),
      code(migration).indexOf(";", code(migration).indexOf("create unique index")),
    );
    expect(idx).not.toMatch(/issued_by|auth\.uid|project_id|worker_id/i);
  });
});

describe("every lifecycle RPC takes the asset row lock before it decides", () => {
  for (const fn of ["issue_asset_v1", "transfer_asset_assignment_v1", "return_asset_v1"]) {
    it(`${fn} locks the asset row`, () => {
      expect(bodyOf(migration, fn)).toMatch(/from public\.assets where id = \S+ for update/i);
    });
  }

  it("issue reads the open set AFTER the lock, not before it", () => {
    // Checking first and locking second is the classic version of this bug:
    // both transactions read "nothing open", then both write.
    const body = bodyOf(migration, "issue_asset_v1");
    const lock = body.indexOf("for update");
    const openCheck = body.indexOf("status in ('issued','acknowledged')");
    expect(lock).toBeGreaterThan(0);
    expect(openCheck, "issue must test the open set").toBeGreaterThan(0);
    expect(openCheck).toBeGreaterThan(lock);
  });

  it("transfer and return re-read the status after the lock", () => {
    // A concurrent return may have closed the assignment while we waited.
    for (const fn of ["transfer_asset_assignment_v1", "return_asset_v1"]) {
      const body = bodyOf(migration, fn);
      const lock = body.indexOf("for update");
      const statusRead = body.indexOf("select status", lock);
      expect(statusRead, `${fn} must re-read status after the lock`).toBeGreaterThan(lock);
    }
  });

  it("issue refuses an asset that is already out, and one that is not issuable", () => {
    const body = bodyOf(migration, "issue_asset_v1");
    expect(body).toMatch(/already issued/i);
    expect(body).toMatch(/v_availability in \('maintenance','retired'\)/i);
  });

  it("transfer closes the outgoing assignment BEFORE opening the incoming one", () => {
    // Reversed, every transfer would violate the unique index. This ordering
    // is load-bearing, not stylistic.
    const body = bodyOf(migration, "transfer_asset_assignment_v1");
    const close = body.indexOf("set status = 'transferred'");
    const open = body.indexOf("insert into public.asset_assignments");
    expect(close).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(close);
  });

  it("return records the condition but never resurrects a withdrawn asset", () => {
    const body = bodyOf(migration, "return_asset_v1");
    expect(body).toMatch(/condition = p_condition_at_return/);
    expect(body).toMatch(/case when availability = 'assigned' then 'available' else availability end/i);
  });
});

describe("the migration changes correctness only — never authority", () => {
  it("all three RPCs still gate on caller_manages_asset", () => {
    for (const fn of ["issue_asset_v1", "transfer_asset_assignment_v1", "return_asset_v1"]) {
      expect(bodyOf(migration, fn)).toMatch(/public\.caller_manages_asset\(/);
    }
  });

  it("no grant, no policy, no drop of anything that holds data", () => {
    const c = code(migration);
    expect(c).not.toMatch(/\bgrant\b/i);
    expect(c).not.toMatch(/\bpolicy\b/i);
    expect(c).not.toMatch(/drop (table|column|function)/i);
    expect(c).not.toMatch(/\bto anon\b/i);
  });

  it("the only privilege statements narrow anon, and never touch authenticated", () => {
    // The three revokes exist because `create or replace` keeps production's
    // ACLs but a database REBUILT from the chain does not: the Supabase
    // bootstrap grants anon EXECUTE on every function created after the
    // 20260722160000 closure. Restating the revoke is the difference between
    // a reproducible chain and one that reopens three manager-gated write
    // RPCs to anonymous callers on a fresh reset. What it must never do is
    // take EXECUTE away from the roles the product runs as.
    const statements = code(migration)
      .split(";")
      .map((x) => x.replace(/\s+/g, " ").trim().toLowerCase())
      .filter((x) => /\brevoke\b/.test(x));
    expect(statements).toHaveLength(3);
    for (const stmt of statements) {
      expect(stmt, `revoke must name anon: ${stmt}`).toMatch(/from [^;]*\banon\b/);
      expect(stmt, `revoke must not touch authenticated: ${stmt}`).not.toMatch(/\bauthenticated\b/);
      expect(stmt, `revoke must not touch service_role: ${stmt}`).not.toMatch(/\bservice_role\b/);
    }
  });

  it("the RPCs keep the SECURITY DEFINER + pinned search_path posture", () => {
    expect((migration.match(/security definer set search_path = public/gi) ?? []).length).toBe(3);
  });

  it("the signatures pinned in secdef-revoke-scope are unchanged", () => {
    // `create or replace` preserves the existing EXECUTE grants only while the
    // ARGUMENT LIST is identical; change one argument and Postgres creates a
    // NEW function with no grants, silently breaking the product for every
    // authenticated caller.
    const scope = read("lib/security/secdef-revoke-scope.ts");
    for (const sig of [
      "issue_asset_v1(p_asset_id uuid, p_project_id uuid, p_worker_id uuid, p_condition_at_issue text, p_note text)",
      "transfer_asset_assignment_v1(p_assignment_id uuid, p_new_project_id uuid, p_new_worker_id uuid, p_note text)",
      "return_asset_v1(p_assignment_id uuid, p_condition_at_return text, p_note text)",
    ]) {
      expect(scope, `secdef scope must still carry ${sig}`).toContain(sig);
      const [name, args] = [sig.slice(0, sig.indexOf("(")), sig.slice(sig.indexOf("(") + 1, -1)];
      const declared = bodyOf(migration, name);
      for (const arg of args.split(", ")) {
        const [param, type] = arg.split(" ");
        expect(declared, `${name} must still declare ${param} ${type}`).toMatch(
          new RegExp(`${param}\\s+${type}`, "i"),
        );
      }
    }
  });

  it("carries the human-gate acknowledgement it is classified under", () => {
    expect(migration).toMatch(/^-- @human-gate-approved/m);
  });
});

describe("the change is reversible, and the reverse is honest about what it does", () => {
  it("ships a paired rollback", () => {
    expect(existsSync(join(repoRoot, ROLLBACK))).toBe(true);
  });

  it("the rollback drops the index and restores all three bodies", () => {
    const c = code(rollback);
    expect(c).toMatch(/drop index if exists public\.asset_assignments_one_open_per_asset/i);
    for (const fn of ["issue_asset_v1", "transfer_asset_assignment_v1", "return_asset_v1"]) {
      expect(c).toContain(`create or replace function public.${fn}(`);
    }
    // Restored means restored: the reverse must NOT keep the lock.
    expect(c).not.toMatch(/for update/i);
  });

  it("the rollback says out loud that it re-opens the defect", () => {
    expect(rollback).toMatch(/re-?opens? the defect/i);
  });
});

describe("the product tells the truth about a refusal", () => {
  const actions = read("lib/assets/assets-actions.ts");

  it("a refusal is not reported as 'something went wrong'", () => {
    // "Something went wrong. Please try again." would tell a manager to retry
    // the one action that must not succeed.
    expect(actions).toMatch(/already_issued/);
    expect(actions).toMatch(/not_issuable/);
    expect(actions).toMatch(/asset_assignments_one_open_per_asset/);
  });

  it("the already-issued branch is tested before the generic invalid branch", () => {
    const already = actions.indexOf('code: "already_issued"');
    const invalid = actions.indexOf('code: "invalid"', actions.indexOf("function mapError"));
    expect(already).toBeGreaterThan(0);
    expect(already).toBeLessThan(invalid);
  });

  for (const loc of ["en", "lt", "ru", "nl", "de"]) {
    it(`${loc} can say each refusal in its own words`, () => {
      const outcome = JSON.parse(read(`messages/${loc}.json`)).assets?.outcome ?? {};
      for (const key of ["already_issued", "not_issuable", "not_found"]) {
        expect(outcome[key], `${loc}.assets.outcome.${key}`).toBeTruthy();
      }
      // The panel renders `t(\`outcome.${code}\`)` — a missing key would put a
      // translation key in front of a person.
      expect(outcome.already_issued).not.toMatch(/^assets\./);
    });
  }
});

describe("the live proof exists and reads the real files", () => {
  it("the db-proof script is present and executable-shaped", () => {
    const sh = readFileSync(join(repoRoot, "scripts/db-proof/asset-single-open-assignment.sh"), "utf8");
    expect(sh).toMatch(/^#!\/usr\/bin\/env bash/);
    // It must run the migration itself, not a copy of it.
    expect(sh).toContain(MIGRATION.replace("supabase/migrations/", ""));
    expect(sh).toContain("20260718170000_assets_logistics.sql");
    expect(sh).toContain(ROLLBACK.replace("supabase/rollbacks/", ""));
    // Two sessions, one holding a transaction open — the thing that makes it
    // a race and not a sequence.
    expect(sh).toMatch(/pg_sleep/);
    expect(sh).toMatch(/issue_hold/);
  });

  it("its actor helper wraps SET LOCAL in a transaction", () => {
    // Measured failure while writing this proof: `set local` outside a
    // transaction is a no-op, `auth.uid()` returns null, and every RPC then
    // refuses with "not authorized" — which reads exactly like a PASSING
    // authority check while proving nothing at all.
    const sh = readFileSync(join(repoRoot, "scripts/db-proof/asset-single-open-assignment.sh"), "utf8");
    const helper = sh.slice(sh.indexOf("as_uid() {"), sh.indexOf("race() {"));
    expect(helper).toMatch(/begin;[\s\S]*set local app\.uid[\s\S]*commit;/);
  });
});
