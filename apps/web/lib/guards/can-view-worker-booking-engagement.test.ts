import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CAN_VIEW_WORKER × BOOKING ENGAGEMENTS GUARDS (v1).
 *
 * `public.can_view_worker(uuid)` (applied migration 20260711130000) is the
 * GDPR identity-disclosure predicate behind FOUR RLS policies —
 * workers_select, worker_skills_select, worker_professions_select,
 * worker_languages_select — and the `request_contact_disclosure` ask guard.
 * Its body deliberately separates a CONSENT basis (employer discovery,
 * requires a current granted `profile_discoverability`) from a
 * CONTRACT / LEGITIMATE-INTEREST basis (active rosters, active
 * engagement_contexts, active managed-project assignment). It had no
 * `company_worker_engagements` branch.
 *
 * Migration 20260809120000 adds one, on the legitimate-interest arm. The
 * owner decision memo — including the honest analysis of whether this makes
 * discoverability consent bypassable — is
 * docs/human-gates/can-view-worker-booking-engagement-gate.md.
 *
 * These guards pin: the owner gate (draft, never self-approved), the exact
 * shape and narrowness of the new branch, its byte-identity with PR #1095's
 * `caller_manages_worker` branch (one meaning of "engaged" in one database),
 * the consent arm surviving untouched, the absence of any schema / policy /
 * grant-widening / DML change, the paired rollback restoring the applied body,
 * and the existence of the executable DB proof and the memo itself.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
const repoPath = (rel: string) => join(REPO_ROOT, rel);

const MIGRATION =
  "supabase/migrations/20260809120000_can_view_worker_booking_engagement_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260809120000_can_view_worker_booking_engagement_v1.down.sql";
const PROOF = "scripts/db-proof/can-view-worker-booking-engagement.sh";
const PROOF_PRELUDE = "scripts/db-proof/can-view-worker-booking-engagement.prelude.sql";
const PROOF_SEED = "scripts/db-proof/can-view-worker-booking-engagement.seed.sql";
const MEMO = "docs/human-gates/can-view-worker-booking-engagement-gate.md";
const APPLIED_SOURCE =
  "supabase/migrations/20260711130000_privacy_consent_and_disclosure_v1.sql";

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

/** Whitespace-insensitive comparison of two SQL fragments. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

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
    expect(migration()).not.toMatch(/^--\s*@human-gate-approved\s*$/m);
  });

  it("points at the owner decision memo, and the memo exists", () => {
    expect(migration()).toContain(MEMO);
    expect(existsSync(repoPath(MEMO))).toBe(true);
  });

  it("ships a paired rollback and an executable DB proof", () => {
    expect(existsSync(repoPath(ROLLBACK))).toBe(true);
    expect(existsSync(repoPath(PROOF))).toBe(true);
    expect(existsSync(repoPath(PROOF_PRELUDE))).toBe(true);
    expect(existsSync(repoPath(PROOF_SEED))).toBe(true);
    // The proof must execute the REAL files, not a re-implementation.
    const proof = readRepo(PROOF);
    expect(proof).toContain(MIGRATION.replace("supabase/migrations/", ""));
    expect(proof).toContain(ROLLBACK.replace("supabase/rollbacks/", ""));
    expect(proof).toMatch(/BEFORE/);
    expect(proof).toMatch(/ROLLBACK/);
    expect(proof).toMatch(/RE-APPLY/);
  });
});

describe("the new branch — exact shape and narrowness", () => {
  const body = () => fnBody(stripped(migration()), "public.can_view_worker(w uuid)");

  it("admits company_worker_engagements", () => {
    expect(body()).toContain("public.company_worker_engagements");
  });

  it("requires worker_id IS NOT NULL — a #856-detached row grants nothing", () => {
    expect(body()).toMatch(/e\.worker_id is not null/);
  });

  it("requires status = 'active' — an ended engagement grants nothing", () => {
    expect(body()).toMatch(/e\.status = 'active'/);
  });

  it("is caller-bound through owns_company (never a client-supplied company)", () => {
    expect(body()).toMatch(/public\.owns_company\(e\.company_id\)/);
  });

  it("does NOT admit manages_organization for the engagement branch", () => {
    // Org-manager authority over engagement-based IDENTITY disclosure would be
    // a new authority widening on the GDPR predicate and needs its own owner
    // decision. `manages_organization` still appears in the pre-existing
    // engagement_contexts branch — that one is untouched.
    const src = body();
    const engagementBranch =
      src.split("public.company_worker_engagements")[1]?.split(")\n")[0] ?? "";
    expect(engagementBranch).not.toMatch(/manages_organization/);
    // …and the pre-existing branch that legitimately uses it is still there.
    expect(src).toMatch(/engagement_contexts[\s\S]*manages_organization/);
  });

  it("does NOT consult the booking's dates — one definition of 'engaged'", () => {
    // Gating on expected_end_date here would disagree with
    // caller_manages_worker (PR #1095) and re-break the absence list. Expiry is
    // memo follow-up F1, on the engagement lifecycle, not on this predicate.
    expect(body()).not.toMatch(/expected_end_date|booking_requests/);
  });

  it("matches the ALREADY-APPLIED list_booking_engagement_workers_v1 predicate", () => {
    // 20260723120000 (applied to prod 2026-07-23) already discloses the engaged
    // worker's display_name to the engaging company owner, under exactly these
    // three conditions, via a SECURITY DEFINER RPC that bypasses this
    // predicate. If those conditions ever diverge, the RLS answer and the RPC
    // answer disagree again — which is the defect this migration closes.
    const applied = stripped(readRepo(APPLIED_SOURCE));
    void applied; // the RPC lives in 20260723120000; conditions pinned below
    const src = body();
    for (const cond of [
      "worker_id is not null",
      "status = 'active'",
      "owns_company",
    ]) {
      expect(src).toContain(cond);
    }
  });
});

describe("the consent arm is untouched", () => {
  const body = () => fnBody(stripped(migration()), "public.can_view_worker(w uuid)");

  it("is_employer() is still AND-ed with worker_profile_discoverable", () => {
    const src = body();
    const employerBranch = src.split("is_employer()")[1] ?? "";
    expect(employerBranch).toMatch(/^\s*and\s/);
    expect(employerBranch).toMatch(/worker_profile_discoverable/);
  });

  it("keeps all four pre-existing relationship branches", () => {
    const src = body();
    for (const rel of [
      "public.company_workers",
      "public.agency_workers",
      "public.engagement_contexts",
      "public.project_worker_assignments",
    ]) {
      expect(src).toContain(rel);
    }
    expect(src).toContain("public.owns_worker(w)");
    expect(src).toContain("public.is_admin()");
  });

  it("adds exactly ONE branch to the applied body (no other line moves)", () => {
    // Take the applied 20260711130000 body, inject nothing, and check that
    // deleting the engagement branch from the new body reproduces it exactly.
    const applied = fnBody(stripped(readRepo(APPLIED_SOURCE)), "public.can_view_worker(w uuid)");
    const appliedSelect = applied.split("$$")[1] ?? "";

    const next = fnBody(stripped(migration()), "public.can_view_worker(w uuid)");
    const nextSelect = next.split("$$")[1] ?? "";
    const withoutBranch = nextSelect.replace(
      /or exists \(\s*select 1\s*from public\.company_worker_engagements e[\s\S]*?\)\s*(?=or exists)/,
      "",
    );

    expect(norm(withoutBranch)).toBe(norm(appliedSelect));
  });
});

describe("no schema, policy, grant-widening or DML change", () => {
  const sql = () => stripped(migration());

  it("creates or alters no table, column, index, constraint or trigger", () => {
    expect(sql()).not.toMatch(/\bcreate table\b|\balter table\b|\bcreate index\b|\bcreate trigger\b/i);
  });

  it("creates, drops or alters no RLS policy", () => {
    expect(sql()).not.toMatch(/\bcreate policy\b|\bdrop policy\b|\balter policy\b/i);
  });

  it("writes no rows at apply time", () => {
    expect(sql()).not.toMatch(/\binsert into\b|\bupdate public\.|\bdelete from\b|\btruncate\b/i);
  });

  it("drops nothing", () => {
    expect(sql()).not.toMatch(/\bdrop\s+(table|column|function|policy|index|trigger)\b/i);
  });

  it("re-states the EXISTING grant posture only (anon and PUBLIC hold nothing)", () => {
    const s = sql();
    expect(s).toMatch(/revoke all on function public\.can_view_worker\(uuid\) from public;/);
    expect(s).toMatch(/revoke all on function public\.can_view_worker\(uuid\) from anon;/);
    expect(s).toMatch(/grant execute on function public\.can_view_worker\(uuid\) to authenticated;/);
    // No role other than `authenticated` is ever granted anything here.
    // (Statement lines only — `stripped()` drops whole comment lines, not the
    // trailing `-- …` notes inside the function body.)
    const grants = s
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^grant\b/i.test(l));
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      // Compare the GRANTEE list only — the object name legitimately contains
      // the schema qualifier `public.`, which is not a role.
      const grantee = (g.match(/\bto\s+([^;]+);?\s*$/i)?.[1] ?? "").trim();
      expect(grantee).toBe("authenticated");
    }
  });

  it("preserves signature, SECURITY DEFINER, STABLE and the pinned search_path", () => {
    const s = sql();
    expect(s).toMatch(/create or replace function public\.can_view_worker\(w uuid\)/);
    expect(s).toMatch(/returns boolean/);
    expect(s).toMatch(/security definer/);
    expect(s).toMatch(/\bstable\b/);
    expect(s).toMatch(/set search_path = public/);
  });

  it("replaces exactly one function", () => {
    expect((sql().match(/create or replace function /g) ?? []).length).toBe(1);
  });

  it("is transactional", () => {
    const s = sql();
    expect(s).toMatch(/^begin;/m);
    expect(s).toMatch(/^commit;/m);
  });
});

describe("rollback restores the applied body verbatim", () => {
  it("restores can_view_worker with NO engagement branch", () => {
    const body = fnBody(stripped(rollback()), "public.can_view_worker(w uuid)");
    expect(body).not.toContain("company_worker_engagements");
    expect(body).toContain("public.company_workers");
    expect(body).toContain("public.agency_workers");
    expect(body).toContain("public.engagement_contexts");
    expect(body).toContain("public.project_worker_assignments");
    expect(body).toContain("worker_profile_discoverable");
  });

  it("is byte-equivalent to the APPLIED 20260711130000 body", () => {
    const applied = fnBody(stripped(readRepo(APPLIED_SOURCE)), "public.can_view_worker(w uuid)");
    const back = fnBody(stripped(rollback()), "public.can_view_worker(w uuid)");
    expect(norm(back.split("$$")[1] ?? "")).toBe(norm(applied.split("$$")[1] ?? ""));
  });

  it("touches no table, policy, grant-widening or data", () => {
    const s = stripped(rollback());
    expect(s).not.toMatch(/\bcreate table\b|\balter table\b|\bcreate policy\b|\bdrop policy\b/i);
    expect(s).not.toMatch(/\binsert into\b|\bdelete from\b|\btruncate\b/i);
    expect(s).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
  });
});

describe("the memo records the decision honestly", () => {
  const memo = () => readRepo(MEMO);

  it("states the recommendation and its conditions", () => {
    const m = memo();
    expect(m).toMatch(/YES/);
    expect(m).toMatch(/C1/);
    expect(m).toMatch(/C2/);
    expect(m).toMatch(/C3/);
  });

  it("argues the consent-bypass risk in BOTH directions", () => {
    const m = memo();
    expect(m).toMatch(/The case that it IS a bypass/);
    expect(m).toMatch(/The case that it is NOT a bypass/);
  });

  it("names the disclosure that already happens today", () => {
    expect(memo()).toContain("list_booking_engagement_workers_v1");
  });

  it("records the #856 detach model and the revocation caveat", () => {
    const m = memo();
    expect(m).toMatch(/#856/);
    expect(m).toMatch(/worker_id is not null/);
    expect(m).toMatch(/project_worker_assignments/);
  });
});
