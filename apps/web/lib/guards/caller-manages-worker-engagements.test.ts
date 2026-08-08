import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CALLER_MANAGES_WORKER × BOOKING ENGAGEMENTS GUARDS (A1, v1).
 *
 * Beta foundation audit 2026-08-08, P1 defect A1: `caller_manages_worker`
 * checks `company_workers` + `agency_workers` only, so an employer holding an
 * ACTIVE `company_worker_engagements` row (the canonical #1047 row minted when
 * a worker accepts a booking) is BLIND to that worker's absence requests —
 * /dashboard/absences "Requests to review" stays empty and the review RPC
 * refuses. Migration 20260808150000 adds the engagement branch.
 *
 * Scoping that fix surfaced a SECOND, unreported regression, confirmed by
 * catalog read against production on 2026-08-08: W11's 20260804120000 re-issued
 * `assign_worker_to_project` from the pre-engagement body and silently dropped
 * the `caller_has_booking_engagement_for_project` OR-branch that 20260723120000
 * had added, leaving that helper with ZERO callers. The same migration restores
 * it — and MUST, because widening `caller_manages_worker` alone would let an
 * engagement with one company reach a SIBLING company's project through
 * `can_manage_project`, breaking the 2026-07-23 owner decision that an
 * engagement makes a worker assignable ONLY to that company's own projects.
 *
 * These guards pin: the owner gate (draft, never self-approved), the exact
 * shape and narrowness of the new engagement branch, the roster rule surviving
 * verbatim under its new name, the assign gate keeping its project binding via
 * `by_roster` rather than the widened predicate, the W11 completed-project
 * guard surviving, least-privilege grants, the absence of any schema/policy/DML
 * change, the paired rollback restoring both pre-change bodies, and the
 * existence of the executable DB proof.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const MIGRATION =
  "supabase/migrations/20260808150000_caller_manages_worker_engagements_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260808150000_caller_manages_worker_engagements_v1.down.sql";
const PROOF = "scripts/db-proof/a1-caller-manages-worker-engagements.sh";

const migration = () => readRepo(MIGRATION);
const rollback = () => readRepo(ROLLBACK);

/** SQL with `-- …` comment lines removed — so pins cannot be satisfied by
 *  header prose that merely *describes* the property. */
const stripped = (src: string) =>
  src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

/** The body of one `create or replace function` block, up to the next one. */
function fnBody(src: string, signature: string): string {
  const start = src.indexOf(`create or replace function ${signature}`);
  expect(start, `${signature} present`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.indexOf("create or replace function ");
  return rest.slice(0, next === -1 ? undefined : next);
}

describe("owner gate — draft, never self-approved, paired rollback", () => {
  it("carries the DRAFT needs-human-gate header and the never-db-push rule", () => {
    const m = migration();
    expect(m).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    expect(m).toMatch(/Apply ONLY via Supabase MCP apply_migration/);
    expect(m).toMatch(/Never `db push`/);
  });

  it("does NOT carry `@human-gate-approved` — no owner decision exists yet", () => {
    // The agent must never self-approve. migration-safety CI going RED on this
    // file is the intended, honest state until the owner reviews it. If a
    // decision is later given, replace this assertion with one naming the
    // decision (the repo convention is that the rule MOVES, never disappears).
    //
    // This is the REAL gate's own pattern, copied from
    // .github/scripts/migration-safety.mjs (`const ANNOTATION`), not a
    // convenience approximation: the marker only counts as given when it
    // OPENS a comment line. The header's prose mention of the marker (in the
    // sentence explaining why it is deliberately absent) must NOT read as an
    // approval — and under the real gate it does not.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    expect(migration()).not.toMatch(ANNOTATION);
    // …and the prose mention really is present, so the assertion above is
    // proving the line-anchoring, not merely the absence of the string.
    expect(migration()).toContain("@human-gate-approved");
  });

  it("ships a paired rollback that the migration points at", () => {
    expect(migration()).toMatch(
      /20260808150000_caller_manages_worker_engagements_v1\.down\.sql/,
    );
    expect(rollback()).toMatch(
      /ROLLBACK for 20260808150000_caller_manages_worker_engagements_v1\.sql/,
    );
  });

  it("ships the executable DB proof that runs both files verbatim", () => {
    const proof = readRepo(PROOF);
    expect(proof).toContain(
      "supabase/migrations/20260808150000_caller_manages_worker_engagements_v1.sql",
    );
    expect(proof).toContain(
      "supabase/rollbacks/20260808150000_caller_manages_worker_engagements_v1.down.sql",
    );
    // The proof must actually measure the sibling-company isolation, not just
    // the happy path — that is the property most easily lost by a later edit.
    expect(proof).toMatch(/ISOLATION HELD: assign to a SIBLING company/);
    expect(proof).toMatch(/A1 REPRODUCED/);
  });
});

describe("the A1 fix — caller_manages_worker learns about engagements", () => {
  it("delegates the roster rule instead of duplicating it", () => {
    const body = fnBody(
      stripped(migration()),
      "public.caller_manages_worker(p_worker_id uuid)",
    );
    expect(body).toContain(
      "public.caller_manages_worker_by_roster(p_worker_id)",
    );
    // Exactly one copy of the roster rule may exist in the database: the
    // extracted helper. The general predicate must not re-inline it.
    expect(body).not.toContain("public.company_workers");
    expect(body).not.toContain("public.agency_workers");
  });

  it("admits ONLY active, attached engagements of a company the caller owns", () => {
    const body = fnBody(
      stripped(migration()),
      "public.caller_manages_worker(p_worker_id uuid)",
    );
    expect(body).toContain("public.company_worker_engagements");
    // Caller-bound ownership — the same authority level as the roster branch.
    expect(body).toContain("public.owns_company(e.company_id)");
    // An ENDED engagement grants nothing.
    expect(body).toMatch(/e\.status\s*=\s*'active'/);
    // A GDPR-detached audit row (worker_id NULL) grants nothing.
    expect(body).toMatch(/e\.worker_id is not null/);
  });

  it("does NOT admit org managers — that would be a new authority widening", () => {
    // `manages_organization` is a strictly wider authority than
    // `owns_company` (it admits managers/external managers of the org, not
    // just the company owner). Admitting it here would go beyond the defect
    // the audit found and needs its own owner decision.
    const body = fnBody(
      stripped(migration()),
      "public.caller_manages_worker(p_worker_id uuid)",
    );
    expect(body).not.toContain("manages_organization");
  });

  it("keeps the signature, definer posture and least-privilege grants", () => {
    const s = stripped(migration());
    for (const fn of [
      "public.caller_manages_worker(uuid)",
      "public.caller_manages_worker_by_roster(uuid)",
    ]) {
      expect(s).toContain(`revoke all on function ${fn} from public;`);
      expect(s).toContain(`revoke all on function ${fn} from anon;`);
      expect(s).toContain(`grant execute on function ${fn} to authenticated;`);
    }
    // Three definer functions, each with search_path pinned.
    expect(s.match(/security definer/g) ?? []).toHaveLength(3);
    expect(s.match(/set search_path = public/g) ?? []).toHaveLength(3);
  });
});

describe("the roster rule survives verbatim under its new name", () => {
  it("caller_manages_worker_by_roster is the 20260609120000 body, unchanged", () => {
    const body = fnBody(
      stripped(migration()),
      "public.caller_manages_worker_by_roster(p_worker_id uuid)",
    );
    expect(body).toMatch(
      /from public\.company_workers cw[\s\S]*cw\.status = 'active'[\s\S]*public\.owns_company\(cw\.company_id\)/,
    );
    expect(body).toMatch(
      /from public\.agency_workers aw[\s\S]*aw\.status = 'active'[\s\S]*public\.owns_agency\(aw\.agency_id\)/,
    );
    // The roster helper must NOT know about engagements — it is the "narrow"
    // half of the split, and call sites depend on that.
    expect(body).not.toContain("company_worker_engagements");
  });
});

describe("assign_worker_to_project — bridge restored, binding pinned", () => {
  const assignBody = () =>
    fnBody(stripped(migration()), "public.assign_worker_to_project(");

  it("restores the engagement OR-branch W11's 20260804120000 dropped", () => {
    expect(assignBody()).toContain(
      "public.caller_has_booking_engagement_for_project(w_id, pid)",
    );
  });

  it("gates on by_roster, NOT the widened caller_manages_worker", () => {
    const body = assignBody();
    expect(body).toContain("public.caller_manages_worker_by_roster(w_id)");
    // THE load-bearing assertion. If this ever reads `caller_manages_worker`,
    // an engagement with one company silently reaches every SIBLING company's
    // projects through can_manage_project — breaking the 2026-07-23 owner
    // decision that an engagement makes a worker assignable ONLY to that
    // company's own projects.
    expect(body).not.toMatch(/public\.caller_manages_worker\(w_id\)/);
  });

  it("keeps both gates: project authority AND worker authority", () => {
    expect(assignBody()).toContain("public.can_manage_project(pid)");
  });

  it("preserves the W11 completed-project guard, checked AFTER authorization", () => {
    const body = assignBody();
    expect(body).toContain("Project is completed");
    expect(body.indexOf("Not authorized to assign this worker")).toBeLessThan(
      body.indexOf("Project is completed"),
    );
  });
});

describe("blast radius — function bodies only", () => {
  it("creates no table, column, index, constraint, trigger or policy", () => {
    const s = stripped(migration());
    expect(s).not.toMatch(/create table/i);
    expect(s).not.toMatch(/alter table/i);
    expect(s).not.toMatch(/create (unique )?index/i);
    expect(s).not.toMatch(/create policy/i);
    expect(s).not.toMatch(/drop policy/i);
    expect(s).not.toMatch(/create trigger/i);
  });

  it("performs no DML at apply time", () => {
    // The three replaced bodies contain an INSERT (assign_worker_to_project's
    // own assignment write), so the check is that no statement-level DML sits
    // OUTSIDE a function body — i.e. the migration itself writes no row.
    const s = stripped(migration());
    const outsideFunctions = s.split(/\$\$/).filter((_, i) => i % 2 === 0);
    for (const chunk of outsideFunctions) {
      expect(chunk).not.toMatch(/^\s*(insert|update|delete|truncate)\s/im);
    }
  });

  it("is wrapped in a single transaction", () => {
    const s = stripped(migration());
    expect(s.trimStart().startsWith("begin;")).toBe(true);
    expect(s.trimEnd().endsWith("commit;")).toBe(true);
  });
});

describe("rollback restores the exact pre-change state", () => {
  it("restores the roster-only caller_manages_worker body", () => {
    const body = fnBody(
      stripped(rollback()),
      "public.caller_manages_worker(p_worker_id uuid)",
    );
    expect(body).toContain("public.company_workers cw");
    expect(body).toContain("public.agency_workers aw");
    expect(body).not.toContain("company_worker_engagements");
  });

  it("restores the APPLIED 20260804120000 assign body (without the branch)", () => {
    const body = fnBody(
      stripped(rollback()),
      "public.assign_worker_to_project(",
    );
    expect(body).toContain("public.caller_manages_worker(w_id)");
    expect(body).not.toContain("caller_has_booking_engagement_for_project");
    // The W11 guard must come back too — the rollback restores prod, not 0609.
    expect(body).toContain("Project is completed");
  });

  it("drops the helper AFTER restoring the function that calls it", () => {
    const s = stripped(rollback());
    const restore = s.indexOf("create or replace function public.assign_worker_to_project(");
    const drop = s.indexOf("drop function if exists public.caller_manages_worker_by_roster(uuid)");
    expect(restore).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(-1);
    // Dropping first would fail on dependency or leave the assign RPC raising
    // 42883 for every caller.
    expect(drop).toBeGreaterThan(restore);
  });

  it("states honestly that running it restores BOTH defects", () => {
    // Comment prose is line-wrapped, so collapse whitespace before matching —
    // otherwise this guard would silently pass/fail on reflowing alone.
    const r = rollback().replace(/\s*\n\s*--\s*/g, " ").replace(/\s+/g, " ");
    expect(r).toMatch(/A1: an employer holding an active accepted-booking engagement is blind to that worker's absence requests again/);
    expect(r).toMatch(/caller_has_booking_engagement_for_project` returns to ZERO callers/);
  });
});
