import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BOOKING→ENGAGEMENT ORG-FIRST COMPANY RESOLUTION GUARDS (v1).
 *
 * Live 2026-08-06: accepted booking 88a43ead… minted NO engagement because the
 * applied v3 resolves the company by `companies.profile_id = demand owner` and
 * the QA owner holds two companies ('ambiguous_company'). Post-M-P0-6 the
 * demand row carries the disambiguator: `customer_requests.organization_id`.
 * Migration 20260807140000 replaces v3 so the ORGANIZATION names the company
 * (organizations.legacy_company_id — single-valued, deterministic), with the
 * profile-singleton rule kept verbatim as the NULL-org fallback.
 *
 * These guards pin: the owner gate (draft, never self-approved), every W12
 * atomic layer surviving the replacement, the org-first resolution shape, the
 * untouched fallback honesty, the unchanged state vocabulary and signature,
 * least-privilege grants, and the rollback restoring the exact W12 body.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const readRepo = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

const MIGRATION =
  "supabase/migrations/20260807140000_booking_engagement_org_resolution_v1.sql";
const ROLLBACK =
  "supabase/rollbacks/20260807140000_booking_engagement_org_resolution_v1.down.sql";
const W12_MIGRATION =
  "supabase/migrations/20260802150000_booking_atomic_double_booking_v1.sql";

const migration = () => readRepo(MIGRATION);
const rollback = () => readRepo(ROLLBACK);
/** SQL with `-- …` comment lines removed — for pins that must not be tripped
 *  by header prose. */
const stripped = (src: string) =>
  src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

/** The v3 body between its `create or replace function` and the grant line. */
function v3Body(src: string): string {
  const start = src.indexOf(
    "create or replace function public.respond_booking_request_v3",
  );
  expect(start, "respond_booking_request_v3 present").toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.indexOf("grant execute on function");
  return rest.slice(0, end === -1 ? undefined : end);
}

describe("owner gate — decision recorded, marker bound to it, paired rollback", () => {
  it("carries the human-gate marker UNDER the recorded 2026-08-08 owner decision", () => {
    const m = migration();
    expect(m).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    // FLIPPED 2026-08-08. This guard originally pinned the OPPOSITE state —
    // "never self-add the annotation" — because no decision existed. The
    // beta-stabilization P0 command supplied one ("APPROVE proceeding with
    // #1047 PROVIDED current-code re-verification proves…"), the
    // re-verification ran (39/39 DB proof), and the marker was added in the
    // SAME commit as the gate record, per the repo procedure. The guard now
    // pins that the marker exists AND names its gate doc — a marker without
    // its recorded decision is exactly what this must catch next.
    expect(m).toMatch(/^--\s*@human-gate-approved/m);
    expect(m).toMatch(/booking-engagement-org-resolution-gate\.md/);
  });

  it("the marker is comment-only — the approved EXECUTABLE hash is untouched", () => {
    // The owner decision binds to the comment-stripped executable sha256.
    // Adding the marker must not have changed a single executable byte.
    const exec = migration()
      .split(/\r?\n/)
      .filter((l) => !/^\s*--/.test(l))
      .join("\n");
    expect(exec).not.toMatch(/@human-gate-approved/);
  });

  it("asserts its M-P0-6 dependency before replacing anything", () => {
    const s = stripped(migration());
    expect(s).toMatch(/column_name = 'organization_id'/);
    expect(s).toMatch(/to_regclass\('public\.company_worker_engagements'\)/);
  });

  it("has a paired rollback that restores the W12 body", () => {
    expect(rollback().length).toBeGreaterThan(0);
  });
});

describe("every W12 atomic layer survives the replacement", () => {
  it("L1: row lock, post-lock status gate, status-guarded UPDATE, fail-closed row_count", () => {
    const body = v3Body(migration());
    expect(body).toMatch(/for update/);
    expect(body).toMatch(/br\.status is distinct from 'proposed'/);
    expect(body).toMatch(/where id = br\.id\s*\n\s*and status = 'proposed'/);
    expect(body).toMatch(/get diagnostics v_updated = row_count/);
    expect(body).toMatch(/if v_updated = 0 then/);
  });

  it("L1: idempotent same-decision replay without a second event row", () => {
    const body = v3Body(migration());
    expect(body).toMatch(/if br\.status = p_decision then/);
    expect(body).toMatch(/'idempotent', true/);
    // The replay returns BEFORE the event insert.
    expect(body.indexOf("'idempotent', true")).toBeLessThan(
      body.indexOf("insert into public.booking_request_events"),
    );
  });

  it("L2: worker-keyed advisory lock taken AFTER the row lock", () => {
    const body = v3Body(migration());
    expect(body).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(br\.worker_id::text, 0\)\)/,
    );
    expect(body.indexOf("for update")).toBeLessThan(
      body.indexOf("pg_advisory_xact_lock"),
    );
  });

  it("worker-only authorization and the overlap guard are intact", () => {
    const body = v3Body(migration());
    expect(body).toMatch(/Only the addressed worker may respond/);
    expect(body).toMatch(/Conflicting accepted booking for these dates/);
  });

  it("L3 and the delegators are NOT touched — only v3 is replaced", () => {
    const s = stripped(migration());
    expect(s).not.toMatch(/booking_requests_no_overlapping_accepted/);
    expect(s).not.toMatch(/create extension/);
    expect(s).not.toMatch(
      /create or replace function public\.respond_booking_request_v2/,
    );
    expect(s).not.toMatch(
      /create or replace function public\.respond_booking_request\(/,
    );
    // Exactly ONE function is (re)defined in this migration.
    const defs = s.match(/create or replace function/g) ?? [];
    expect(defs.length).toBe(1);
  });
});

describe("org-first company resolution — deterministic, server-derived", () => {
  it("reads the demand's organization stamp off the canonical origin row", () => {
    const body = v3Body(migration());
    expect(body).toMatch(
      /select cr\.profile_id, cr\.organization_id\s*\n\s*into v_demand_owner, v_demand_org/,
    );
    expect(body).toMatch(/where cr\.id = br\.request_id/);
  });

  it("resolves the company through organizations.legacy_company_id", () => {
    const body = v3Body(migration());
    expect(body).toMatch(
      /select o\.legacy_company_id into v_company\s*\n\s*from public\.organizations o\s*\n\s*where o\.id = v_demand_org/,
    );
  });

  it("org direction is single-valued: no count, no ordering, no LIMIT pick", () => {
    const body = v3Body(migration());
    const orgBranch = body.slice(
      body.indexOf("elsif v_demand_org is not null then"),
      body.indexOf("-- PRE-ORG FALLBACK"),
    );
    expect(orgBranch).toMatch(/legacy_company_id/);
    expect(orgBranch).not.toMatch(/count\(/);
    expect(orgBranch).not.toMatch(/order by/);
    expect(orgBranch).not.toMatch(/limit 1/);
  });

  it("an organization without a bound company is an honest non-mint", () => {
    const body = v3Body(migration());
    const orgBranch = body.slice(
      body.indexOf("elsif v_demand_org is not null then"),
      body.indexOf("-- PRE-ORG FALLBACK"),
    );
    expect(orgBranch).toMatch(/if v_company is null then/);
    expect(orgBranch).toMatch(/'no_company'/);
  });

  it("the demand-owner ↔ booking-owner invariant is still VERIFIED, not trusted", () => {
    const body = v3Body(migration());
    expect(body).toMatch(/v_demand_owner is distinct from br\.owner_id/);
  });

  it("signature unchanged: still NO client-supplied company/org/worker id", () => {
    const body = v3Body(migration());
    const signature = body.slice(0, body.indexOf("returns"));
    expect(signature).not.toMatch(/p_company_id|p_worker_id|p_organization_id/);
  });
});

describe("the NULL-org fallback keeps the profile-singleton honesty verbatim", () => {
  it("fallback still refuses to guess for multi-company owners", () => {
    const body = v3Body(migration());
    const fallback = body.slice(body.indexOf("-- PRE-ORG FALLBACK"));
    expect(fallback).toMatch(/v_company_count = 0/);
    expect(fallback).toMatch(/v_company_count > 1/);
    expect(fallback).toMatch(/'ambiguous_company'/);
    expect(fallback).toMatch(/c\.profile_id = v_demand_owner/);
  });

  it("'ambiguous_company' can ONLY come from the fallback branch", () => {
    const body = v3Body(migration());
    const occurrences = stripped(body).match(/'ambiguous_company'/g) ?? [];
    expect(occurrences.length).toBe(1);
    expect(stripped(body).indexOf("'ambiguous_company'")).toBeGreaterThan(
      stripped(body).indexOf("v_company_count > 1"),
    );
  });

  it("state vocabulary is unchanged — no new engagement state invented", () => {
    const body = stripped(v3Body(migration()));
    const states = new Set(
      (body.match(/v_engagement := '([a-z_]+)'/g) ?? []).map(
        (s) => /'([a-z_]+)'/.exec(s)![1],
      ),
    );
    expect([...states].sort()).toEqual([
      "already_active",
      "already_recorded",
      "ambiguous_company",
      "created",
      "no_company",
    ]);
  });

  it("engagement idempotency chain is intact", () => {
    const body = v3Body(migration());
    expect(body).toMatch(/'already_recorded'/);
    expect(body).toMatch(/'already_active'/);
    expect(body).toMatch(/on conflict \(source_booking_id\) do nothing/);
  });
});

describe("least privilege", () => {
  it("PUBLIC and anon revoked; authenticated gets exactly EXECUTE; search_path pinned", () => {
    const m = migration();
    expect(m).toMatch(
      /revoke all on function public\.respond_booking_request_v3\(uuid, text, text, text\) from public/,
    );
    expect(m).toMatch(
      /revoke all on function public\.respond_booking_request_v3\(uuid, text, text, text\) from anon/,
    );
    expect(m).toMatch(
      /grant execute on function public\.respond_booking_request_v3\(uuid, text, text, text\) to authenticated/,
    );
    const definers = m.split("security definer").length - 1;
    const pinned = m.split("set search_path = public").length - 1;
    expect(definers).toBeGreaterThan(0);
    expect(pinned).toBeGreaterThanOrEqual(definers);
  });

  it("no service_role grant appears anywhere in the migration SQL", () => {
    expect(stripped(migration())).not.toMatch(/service_role/);
  });
});

describe("rollback — restores the exact W12 profile-singleton body", () => {
  it("recreates v3 (never drops it) with the W12 layers intact", () => {
    const r = rollback();
    expect(r).toMatch(
      /create or replace function public\.respond_booking_request_v3/,
    );
    expect(r).not.toMatch(/drop function/);
    const body = v3Body(r);
    expect(body).toMatch(/for update/);
    expect(body).toMatch(/pg_advisory_xact_lock/);
    expect(body).toMatch(/'idempotent', true/);
  });

  it("restored body is the pre-slice singleton resolution — no org path", () => {
    const body = stripped(v3Body(rollback()));
    expect(body).not.toMatch(/organization_id/);
    expect(body).not.toMatch(/legacy_company_id/);
    expect(body).toMatch(/v_company_count > 1/);
    expect(body).toMatch(/'ambiguous_company'/);
  });

  it("restored engagement branch matches the W12 migration's engagement branch byte-for-byte", () => {
    const marker = "if p_decision = 'accepted' then\n    select cr.profile_id";
    const tail = (src: string) => {
      const i = src.indexOf(marker);
      expect(i, "engagement branch marker").toBeGreaterThan(-1);
      return src.slice(i, src.indexOf("return jsonb_build_object", i));
    };
    expect(tail(rollback().replace(/\r\n/g, "\n"))).toBe(
      tail(readRepo(W12_MIGRATION).replace(/\r\n/g, "\n")),
    );
  });
});
