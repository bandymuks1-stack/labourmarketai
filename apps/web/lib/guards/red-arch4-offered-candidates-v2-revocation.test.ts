import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ARCH-4 (2026-09-20 launch-completion audit): an agency's candidate
 * disclosure must not outlive the relationship that authorized it — through
 * the function the app ACTUALLY calls.
 *
 * WHAT WAS VERIFIED ON THIS HEAD: 20260901052300 closed the L1 class for
 * `list_agency_offered_candidates_for_request_v1` (active connection + active
 * share joins). 20260903101000 then created `..._v2`, which
 * lib/agency/bridge-read.ts PREFERS, without those joins. Revoke / unshare
 * withdraw only 'offered' rows, so 'accepted' / 'declined' offers (agency
 * note + worker_id) stay readable by a severed client through v2.
 *
 * THE FIX IS RED (SECURITY DEFINER replace) and lives in
 * supabase/migrations/20260920121000_agency_offered_candidates_v2_revocation_v1.sql,
 * applied only after the owner's approval. This guard pins what is true
 * regardless of apply state:
 *   1. the migration is the minimum: ONE function body (v2), the same two
 *      joins and two active predicates v1 carries, same signature, same
 *      RETURNS TABLE column list, same ownership predicate, order and limit;
 *   2. it touches NO grant, policy, table, row or the v1 function;
 *   3. its rollback restores the 20260903101000 v2 definition VERBATIM;
 *   4. the consumer contract bridge-read.ts maps stays byte-equal and the
 *      app keeps preferring v2 (so the fix lands where the read happens).
 *
 * THE HOSTILE CONTRACT (to run live, rolled back, after apply):
 *   FAIL  client reads v2 for a request whose connection is 'revoked'
 *         → zero rows, including its 'accepted' / 'declined' offers
 *   FAIL  client reads v2 after unshare_request_v1 (share 'revoked') → zero rows
 *   PASS  client reads v2 with connection + share 'active' → offered,
 *         accepted and declined rows, offered first, newest first
 *   PASS  a non-owner of the demand reads v2 → zero rows (unchanged)
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "apps", "web");
const MIG_NAME = "20260920121000_agency_offered_candidates_v2_revocation_v1";
const MIGRATION = join(REPO, "supabase", "migrations", `${MIG_NAME}.sql`);
const ROLLBACK = join(REPO, "supabase", "rollbacks", `${MIG_NAME}.down.sql`);
const ORIGIN_V2 = join(
  REPO,
  "supabase",
  "migrations",
  "20260903101000_agency_candidate_offer_decision_v1.sql",
);
const V1_FIX = join(
  REPO,
  "supabase",
  "migrations",
  "20260901052300_agency_disclosure_revocation_v1.sql",
);

// EOL-normalized reads: a Windows working copy may hold the frozen files as
// CRLF while a fresh file is LF; CI is LF throughout.
const readText = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const ws = (s: string) => s.replace(/\s+/g, " ").trim();

const FN = "list_agency_offered_candidates_for_request_v2";

/** The `create or replace function public.<fn>(` … `$$;` block in `sql`. */
function fnBlock(sql: string, fn: string): string {
  const start = sql.indexOf(`create or replace function public.${fn}(`);
  expect(start, `${fn} definition not found`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end, `${fn} body terminator not found`).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

const returnsTable = (block: string) =>
  ws(strip(block).match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i)?.[1] ?? "");

describe("ARCH-4 migration — the minimum read-gate correction on v2", () => {
  const raw = readText(MIGRATION);
  const sql = strip(raw);

  it("carries the human-gate annotation on line 1 and the DRAFT sentence (RED, never auto-merged)", () => {
    expect(raw.startsWith("-- @human-gate-approved")).toBe(true);
    expect(raw).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
  });

  it("replaces exactly ONE function — v2 — STABLE SECURITY DEFINER with a pinned search_path; v1 untouched", () => {
    expect((sql.match(/create or replace function/gi) ?? []).length).toBe(1);
    expect(sql).toMatch(new RegExp(`create or replace function public\\.${FN}\\(p_request_id uuid\\)`));
    expect(sql).toMatch(/language sql\s+stable\s+security definer\s+set search_path = public/);
    expect(sql).not.toMatch(/list_agency_offered_candidates_for_request_v1\s*\(/);
    expect(sql).not.toMatch(/list_agency_offer_progress_v1|revoke_agency_client_connection_v1|unshare_request_v1|respond_agency_candidate_offer_v1/);
  });

  it("requires an ACTIVE connection AND an ACTIVE share — exactly the v1 rule", () => {
    const block = strip(fnBlock(raw, FN));
    expect(block).toMatch(/join public\.agency_client_request_shares s on s\.id = o\.request_share_id/);
    expect(block).toMatch(/join public\.agency_client_connections c on c\.id = o\.connection_id/);
    expect(block).toMatch(/and c\.status = 'active'/);
    expect(block).toMatch(/and s\.status = 'active'/);
    // Uniform rule: no booking_id carve-out (the open owner option, implemented as NO).
    expect(block).not.toMatch(/booking_id is not null/);
    // The v1 fix carries the same two joins + two predicates (one rule, two functions).
    const v1 = strip(fnBlock(readText(V1_FIX), "list_agency_offered_candidates_for_request_v1"));
    for (const clause of [
      "join public.agency_client_request_shares s on s.id = o.request_share_id",
      "join public.agency_client_connections c on c.id = o.connection_id",
      "c.status = 'active'",
      "s.status = 'active'",
    ]) {
      expect(ws(v1)).toContain(clause);
      expect(ws(block)).toContain(clause);
    }
  });

  it("keeps everything else of the live v2: decided rows included, owner-of-demand bound, same order and limit", () => {
    const block = ws(strip(fnBlock(raw, FN)));
    expect(block).toContain("and o.status <> 'withdrawn'");
    expect(block).toContain("where r.id = o.request_id and r.profile_id = auth.uid()");
    expect(block).toContain("order by (o.status = 'offered') desc, o.created_at desc limit 100;");
    expect(block).toContain(
      "select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note, o.status, o.booking_id, o.decided_at, o.created_at",
    );
  });

  it("keeps the RETURNS TABLE column list byte-equal to the 20260903101000 v2", () => {
    const mine = returnsTable(fnBlock(raw, FN));
    const origin = returnsTable(fnBlock(readText(ORIGIN_V2), FN));
    expect(mine).toBe(origin);
    expect(mine).toBe(
      "offer_id uuid, worker_id uuid, agency_name text, note text, offer_status text, booking_id uuid, decided_at timestamptz, created_at timestamptz",
    );
  });

  it("re-asserts the IDENTICAL v2 ACL (authenticated only) and touches no other grant, policy, table, trigger or row", () => {
    // Exactly the two ACL statements 20260903101000 set — fail-closed hygiene
    // (secdef-local-reset-reproducibility requires the named anon revoke), no
    // widening, no narrowing, nothing for any other function.
    const grants = sql.match(/\bgrant\b[^;]*;/gi) ?? [];
    const revokes = sql.match(/\brevoke\b[^;]*;/gi) ?? [];
    expect(grants.map(ws)).toEqual([
      `grant execute on function public.${FN}(uuid) to authenticated;`,
    ]);
    expect(revokes.map(ws)).toEqual([
      `revoke execute on function public.${FN}(uuid) from public, anon;`,
    ]);
    const origin = strip(readText(ORIGIN_V2));
    expect(ws(origin)).toContain(`grant execute on function public.${FN}(uuid) to authenticated;`);
    expect(ws(origin)).toContain(`revoke execute on function public.${FN}(uuid) from public, anon;`);
    expect(sql).not.toMatch(/create policy|alter policy|drop policy|alter table|create table|drop table|create index|drop index|create trigger|insert into|update public\.|delete from|truncate|drop function/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)|\bto\s+anon\b|\bto\s+public\b/i);
  });
});

describe("ARCH-4 rollback — restores the 20260903101000 v2 definition verbatim", () => {
  it("exists, contains the origin CREATE OR REPLACE block byte-for-byte, and touches no privilege", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const down = readText(ROLLBACK);
    const originBlock = fnBlock(readText(ORIGIN_V2), FN);
    expect(originBlock).not.toMatch(/agency_client_connections/);
    expect(down).toContain(originBlock);
    expect((strip(down).match(/create or replace function/gi) ?? []).length).toBe(1);
    expect(strip(down)).not.toMatch(/\bgrant\b|\brevoke\b|drop policy|create policy|alter table|drop function/i);
    expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });
});

describe("ARCH-4 consumer contract — bridge-read.ts", () => {
  const src = readFileSync(join(WEB, "lib", "agency", "bridge-read.ts"), "utf8");

  it("prefers v2 and falls back to v1 only when v2 is absent — so the gate must live on v2", () => {
    const fn = src.slice(src.indexOf("export async function listOfferedCandidatesForRequest"));
    expect(fn).toContain(`"${FN}"`);
    expect(fn.indexOf(`"${FN}"`)).toBeLessThan(fn.indexOf('"list_agency_offered_candidates_for_request_v1"'));
    expect(fn).toMatch(/if \(!isMissingRpcCode\(v2\.error\.code\)\) return \[\];/);
  });

  it("maps exactly the eight v2 columns the migration returns", () => {
    const fn = src.slice(src.indexOf("export async function listOfferedCandidatesForRequest"));
    for (const col of ["offer_id", "worker_id", "agency_name", "note", "created_at", "offer_status", "booking_id", "decided_at"]) {
      expect(fn, `bridge-read.ts must read r.${col}`).toMatch(new RegExp(`r\\.${col}\\b`));
    }
    // Nothing beyond the contract is read (no column the function does not return).
    const reads = [...fn.matchAll(/\br\.([a-z_]+)\b/g)].map((m) => m[1]);
    expect(new Set(reads)).toEqual(
      new Set(["offer_id", "worker_id", "agency_name", "note", "created_at", "offer_status", "booking_id", "decided_at"]),
    );
  });
});
