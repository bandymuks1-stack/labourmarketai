import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Agency disclosure-revocation guard (audit 2026-09-01, L1). Pins the fix for
 * the confidentiality defect in the applied bridge migration 20260723180000:
 * after an agency severed a client connection, the client PERMANENTLY retained
 * the agency's candidate worker_ids + notes (list RPC filtered only
 * o.status='offered'; revoke never withdrew offers; the offers SELECT policy
 * granted the client owner unconditional read).
 *
 * The fix migration 20260901052300 is an OWNER-GATED DRAFT (RED,
 * needs-human-gate). This guard is static file-content pinning only — it does
 * not touch a database.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const MIG = "supabase/migrations/20260901052300_agency_disclosure_revocation_v1.sql";
const DOWN = "supabase/rollbacks/20260901052300_agency_disclosure_revocation_v1.down.sql";
const stripSql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("1. package shape — owner-gated draft with paired rollback", () => {
  it("migration + rollback files exist", () => {
    expect(existsSync(join(REPO, MIG))).toBe(true);
    expect(existsSync(join(REPO, DOWN))).toBe(true);
  });
  it("migration is a RED-class draft: needs-human-gate header + annotation", () => {
    const raw = readRepo(MIG);
    expect(raw).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    expect(raw).toMatch(/^\s*--\s*@human-gate-approved\b/m);
  });
});

describe("2. L1 fix — disclosure must not survive revocation", () => {
  const code = stripSql(readRepo(MIG)).toLowerCase();

  it("client-facing candidate list requires an ACTIVE connection AND share", () => {
    const fn = code.slice(
      code.indexOf("list_agency_offered_candidates_for_request_v1"),
      code.indexOf("list_agency_offer_progress_v1"),
    );
    expect(fn).toMatch(/join public\.agency_client_request_shares s on s\.id = o\.request_share_id/);
    expect(fn).toMatch(/join public\.agency_client_connections c on c\.id = o\.connection_id/);
    expect(fn).toMatch(/c\.status = 'active'/);
    expect(fn).toMatch(/s\.status = 'active'/);
    // still offered-only and still caller-owns-the-demand bound
    expect(fn).toMatch(/o\.status = 'offered'/);
    expect(fn).toMatch(/r\.profile_id = auth\.uid\(\)/);
  });

  it("agency-facing progress list carries the same active-connection/share gates", () => {
    const fn = code.slice(
      code.indexOf("list_agency_offer_progress_v1"),
      code.indexOf("revoke_agency_client_connection_v1"),
    );
    expect(fn).toMatch(/join public\.agency_client_request_shares s on s\.id = o\.request_share_id/);
    expect(fn).toMatch(/join public\.agency_client_connections c on c\.id = o\.connection_id/);
    expect(fn).toMatch(/c\.status = 'active'/);
    expect(fn).toMatch(/s\.status = 'active'/);
    expect(fn).toMatch(/owns_company\(o\.agency_company_id\)/);
  });

  it("revoke cascades to offers: 'offered' → 'withdrawn' on the revoked connection", () => {
    expect(code).toMatch(
      /update public\.agency_candidate_offers\s+set status = 'withdrawn', withdrawn_by = v_uid, withdrawn_at = now\(\), updated_at = now\(\)\s+where connection_id = p_connection_id and status = 'offered'/,
    );
    // the pre-existing share cascade is preserved
    expect(code).toMatch(
      /update public\.agency_client_request_shares\s+set status = 'revoked'/,
    );
  });

  it("offers SELECT policy: client arm gated on an active connection; agency arm unchanged", () => {
    const pol = code.slice(code.indexOf("create policy agency_candidate_offers_select"));
    expect(pol).toMatch(/owns_company\(agency_company_id\)/);
    expect(pol).toMatch(
      /owns_company\(client_company_id\)\s+and exists \(select 1 from public\.agency_client_connections c\s+where c\.id = connection_id and c\.status = 'active'\)/,
    );
    expect(pol).toMatch(/is_admin\(\)/);
  });

  it("no loosening: no using(true), no anon, function surface stays authenticated-only", () => {
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
    expect(code).toMatch(/revoke all on function public\.list_agency_offered_candidates_for_request_v1\(uuid\) from anon/);
    expect(code).toMatch(/revoke all on function public\.revoke_agency_client_connection_v1\(uuid\) from public/);
    expect(code).toMatch(/grant execute on function public\.list_agency_offer_progress_v1\(\) to authenticated/);
  });
});

describe("3. rollback restores the exact prior (defective) definitions", () => {
  const down = stripSql(readRepo(DOWN)).toLowerCase();

  it("recreates all three functions and the original policy", () => {
    for (const fn of [
      "list_agency_offered_candidates_for_request_v1",
      "list_agency_offer_progress_v1",
      "revoke_agency_client_connection_v1",
    ]) {
      expect(down).toMatch(new RegExp(`create or replace function public\\.${fn}`));
    }
    expect(down).toMatch(/create policy agency_candidate_offers_select/);
  });

  it("restored candidate list is the ORIGINAL body (no active-connection joins)", () => {
    const fn = down.slice(
      down.indexOf("list_agency_offered_candidates_for_request_v1"),
      down.indexOf("list_agency_offer_progress_v1"),
    );
    expect(fn).not.toMatch(/join public\.agency_client_connections/);
    expect(fn).not.toMatch(/c\.status = 'active'/);
    expect(fn).toMatch(/o\.status = 'offered'/);
  });

  it("restored revoke has NO offer-withdrawal cascade (the original)", () => {
    expect(down).not.toMatch(/update public\.agency_candidate_offers/);
    expect(down).toMatch(/update public\.agency_client_request_shares/);
  });

  it("restored policy is the ORIGINAL unconditional client-owner arm", () => {
    const pol = down.slice(down.indexOf("create policy agency_candidate_offers_select"));
    expect(pol).toMatch(/owns_company\(client_company_id\)/);
    expect(pol).not.toMatch(/exists \(select 1 from public\.agency_client_connections/);
  });
});

describe("4. return-shape compatibility with the consuming app layer", () => {
  it("both list functions keep the exact column contract bridge-read.ts maps", () => {
    const code = stripSql(readRepo(MIG)).toLowerCase();
    expect(code).toMatch(
      /list_agency_offered_candidates_for_request_v1\(p_request_id uuid\)\s+returns table \(\s+offer_id\s+uuid,\s+worker_id\s+uuid,\s+agency_name\s+text,\s+note\s+text,\s+created_at\s+timestamptz\s+\)/,
    );
    expect(code).toMatch(
      /list_agency_offer_progress_v1\(\)\s+returns table \(\s+offer_id\s+uuid,\s+request_id\s+uuid,\s+worker_id\s+uuid,\s+offer_status\s+text,\s+review_stage\s+text,\s+created_at\s+timestamptz\s+\)/,
    );
  });
  it("the audit record exists and names L1/L2/L3", () => {
    const audit = readRepo("docs/audits/agency-confidentiality-audit-2026-09-01.md");
    expect(audit).toMatch(/L1/);
    expect(audit).toMatch(/L2/);
    expect(audit).toMatch(/L3/);
    expect(audit).toMatch(/20260901052300_agency_disclosure_revocation_v1/);
  });
});
