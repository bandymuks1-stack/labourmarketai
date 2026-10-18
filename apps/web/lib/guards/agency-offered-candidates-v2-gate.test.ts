import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GUARD -- list_agency_offered_candidates_for_request_v2 connection/share gate
 * (20261003100000_list_agency_offered_candidates_v2_connection_gate_v1).
 *
 * THE DEFECT. v1 was gated on `connection.status = 'active' and share.status =
 * 'active'` by 20260901052300; v2 (20260903101000, the one bridge-read.ts
 * prefers) was written without that gate, so a client kept reading candidate
 * worker_ids after the connection was revoked or the request unshared.
 *
 * Static, secret-free, no database. The behavioural proof is
 * scripts/db-proof/agency-offered-candidates-v2-gate.sh on a real PostgreSQL 16.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const NAME = "20261003100000_list_agency_offered_candidates_v2_connection_gate_v1";
const lf = (s: string) => s.replace(/\r\n/g, "\n");
const read = (...p: string[]) => lf(readFileSync(join(REPO, ...p), "utf8"));
const UP = read("supabase", "migrations", `${NAME}.sql`);
const DOWN = read("supabase", "rollbacks", `${NAME}.down.sql`);
const V1_FIX = read("supabase", "migrations", "20260901052300_agency_disclosure_revocation_v1.sql");
const code = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/\s--\s.*$|^\s*--.*$/, ""))
    .join("\n");
const flat = (s: string) => code(s).replace(/\s+/g, " ").trim();

describe("agency offered candidates v2 gate -- the fix", () => {
  it("is annotated for the human gate and filename follows the 14-digit convention", () => {
    expect(UP).toMatch(/^-- @human-gate-approved/m);
    expect(NAME).toMatch(/^\d{14}_[a-z0-9_]+$/);
  });

  it("redefines ONLY v2, with the same signature, SECURITY DEFINER, STABLE, search_path", () => {
    const c = flat(UP);
    expect(c.match(/create or replace function/gi)?.length).toBe(1);
    expect(c).toContain("create or replace function public.list_agency_offered_candidates_for_request_v2(p_request_id uuid)");
    expect(c).toMatch(/language sql stable security definer set search_path = public/);
    expect(c).toMatch(
      /returns table \( offer_id uuid, worker_id uuid, agency_name text, note text, offer_status text, booking_id uuid, decided_at timestamptz, created_at timestamptz \)/,
    );
  });

  it("carries the SAME gate predicates as v1 (active connection AND active share)", () => {
    const c = flat(UP);
    expect(c).toContain("join public.agency_client_request_shares s on s.id = o.request_share_id");
    expect(c).toContain("join public.agency_client_connections c on c.id = o.connection_id");
    expect(c).toContain("c.status = 'active'");
    expect(c).toContain("s.status = 'active'");
    // and v1's gate (the reference semantics) has not drifted from these
    const v1 = flat(V1_FIX);
    expect(v1).toContain("c.status = 'active'");
    expect(v1).toContain("s.status = 'active'");
  });

  it("keeps the caller-owns-the-demand predicate, the withdrawn filter and the ordering", () => {
    const c = flat(UP);
    expect(c).toContain("r.profile_id = auth.uid()");
    expect(c).toContain("o.status <> 'withdrawn'");
    expect(c).toContain("order by (o.status = 'offered') desc, o.created_at desc limit 100");
  });

  it("re-asserts the ACL: authenticated only, never anon/public", () => {
    const c = flat(UP);
    expect(c).toContain("revoke execute on function public.list_agency_offered_candidates_for_request_v2(uuid) from public, anon");
    expect(c).toContain("grant execute on function public.list_agency_offered_candidates_for_request_v2(uuid) to authenticated");
    expect(c).not.toMatch(/grant [^;]* to (anon|public)\b/i);
  });

  it("drops nothing and writes no rows (history/audit untouched)", () => {
    const c = flat(UP);
    expect(c).not.toMatch(/\bdrop\s+(table|column|function|policy|constraint)\b/i);
    expect(c).not.toMatch(/\b(delete\s+from|truncate|insert\s+into|update\s+public\.)\b/i);
    expect(c).not.toMatch(/\balter\s+table\b/i);
    expect(c).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });
});

describe("agency offered candidates v2 gate -- rollback", () => {
  it("restores the exact ungated pre-image with the same ACL", () => {
    const c = flat(DOWN);
    expect(c).toContain("create or replace function public.list_agency_offered_candidates_for_request_v2(p_request_id uuid)");
    expect(c).not.toContain("agency_client_connections");
    expect(c).not.toContain("request_share_id");
    expect(c).toContain("o.status <> 'withdrawn'");
    expect(c).toContain("grant execute on function public.list_agency_offered_candidates_for_request_v2(uuid) to authenticated");
  });
});
