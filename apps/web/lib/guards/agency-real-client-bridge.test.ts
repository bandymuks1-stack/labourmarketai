import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Real two-subject agency→client bridge guard (issue #859). Pins the doctrine:
 * a REAL client company (owned by a DIFFERENT profile) owns its own
 * customer_request and is the ONLY reviewer; the agency can never be proposer +
 * need-owner + reviewer at once; every write is caller-bound + connection/share
 * gated; the migration is an owner-gated DRAFT (RED, unapplied).
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const MIG = "supabase/migrations/20260723180000_agency_real_client_bridge_v1.sql";
const migration = readRepo(MIG);
const stripSql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const code = stripSql(migration).toLowerCase();

describe("1. two real subjects — distinct agency + client companies", () => {
  it("connection carries agency_company_id AND client_company_id (real identity)", () => {
    expect(code).toMatch(/create table if not exists public\.agency_client_connections/);
    expect(code).toMatch(/agency_company_id uuid not null references public\.companies/);
    expect(code).toMatch(/client_company_id uuid references public\.companies/);
    // client cannot be the agency itself
    expect(code).toMatch(/client_company_id is null or client_company_id <> agency_company_id/);
  });
  it("the offer binds both companies + the request + the share + connection", () => {
    for (const col of ["connection_id", "request_share_id", "agency_company_id", "client_company_id", "request_id", "worker_id"]) {
      expect(code).toMatch(new RegExp(`${col}\\s+uuid`));
    }
  });
});

describe("2. consent: invite→accept→active→revoke, no email enumeration", () => {
  it("accept matches the caller's OWN jwt email (no probing others)", () => {
    expect(code).toMatch(/lower\(invited_email\) = v_email/);
    expect(code).toMatch(/auth\.jwt\(\) ->> 'email'/);
    // mismatch returns not_found (indistinguishable from non-existent)
    expect(code).toMatch(/if not found then return 'not_found'/);
  });
  it("accept requires the caller to OWN the client company + not the agency", () => {
    expect(code).toMatch(/owns_company\(p_client_company_id\)/);
    expect(code).toMatch(/same_company/);
  });
  it("connection carries an expiry and a soft revoke keeps history", () => {
    expect(code).toMatch(/expires_at\s+timestamptz not null default \(now\(\) \+ interval/);
    expect(code).toMatch(/status = 'revoked', revoked_by = v_uid, revoked_at = now\(\)/);
    // revoking also revokes active shares (no new offers after revoke)
    expect(code).toMatch(/update public\.agency_client_request_shares[\s\S]{0,120}status = 'revoked'/);
  });
});

describe("3. share: only the request owner, only with an active connection", () => {
  it("share checks connection active + client ownership + own request", () => {
    expect(code).toMatch(/connection_not_active/);
    expect(code).toMatch(/owns_company\(v_client\)/);
    expect(code).toMatch(/r\.id = p_request_id and r\.profile_id = v_uid/);
    expect(code).toMatch(/request_not_found/);
  });
});

describe("4. offer: agency-only, roster-gated, share-gated, idempotent", () => {
  it("submit derives everything from the share (client cannot forge)", () => {
    expect(code).toMatch(/from public\.agency_client_request_shares s[\s\S]{0,160}join public\.agency_client_connections c/);
    expect(code).toMatch(/s\.status = 'active'[\s\S]{0,40}c\.status = 'active'/);
    expect(code).toMatch(/share_not_active/);
    expect(code).toMatch(/company_type = 'staffing_agency'/);
    expect(code).toMatch(/cw\.status = 'active'/);
    expect(code).toMatch(/worker_not_on_roster/);
    expect(code).toMatch(/on conflict \(agency_company_id, request_id, worker_id\)/);
  });
  it("the client can never review its own offer AS the agency; withdraw is agency-only", () => {
    expect(code).toMatch(/withdraw_agency_candidate_offer_v1/);
    expect(code).toMatch(/status = 'withdrawn'[\s\S]{0,260}owns_company\(o\.agency_company_id\)/);
  });
});

describe("5. reuse canonical review — derived stage, no parallel store", () => {
  it("progress derives review stage from demand_shortlist / booking / conversations", () => {
    expect(code).toMatch(/list_agency_offer_progress_v1/);
    expect(code).toMatch(/from public\.booking_requests/);
    expect(code).toMatch(/from public\.demand_shortlist/);
    expect(code).toMatch(/from public\.conversations/);
    // NO new conversation/booking table is created by this migration
    expect(code).not.toMatch(/create table[^;]*\b(conversations|booking_requests|messages)\b/);
  });
  it("the client's own scouting surface renders the offered candidates (no second inbox)", () => {
    const scouting = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(scouting).toMatch(/listOfferedCandidatesForRequest/);
    expect(scouting).toMatch(/data-testid="scouting-agency-offers"/);
    // reuses the SAME controls keyed on (requestId, workerId)
    expect(scouting).toMatch(/RequestCommunicationButton[\s\S]{0,400}workerId=\{oc\.workerId\}/);
    expect(scouting).toMatch(/ProposeBookingButton[\s\S]{0,400}workerId=\{oc\.workerId\}/);
  });
});

describe("6. security: fail-closed, RPC-only, revoke public+anon, pinned path", () => {
  it("RLS enabled, no anon, no using(true), no direct write policies", () => {
    for (const t of ["agency_client_connections", "agency_client_request_shares", "agency_candidate_offers"]) {
      expect(code).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
    }
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
    // No direct-write POLICY (writes are RPC-only). `for insert/delete` appear
    // only in policies; a `select ... for update` row-lock is allowed.
    expect(code).not.toMatch(/for\s+insert/);
    expect(code).not.toMatch(/for\s+delete/);
    expect((code.match(/create policy/g) ?? []).length).toBe(3);
    expect((code.match(/for select/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("every function is SECURITY DEFINER with pinned search_path", () => {
    const defs = code.match(/security definer/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(11);
    expect(code).toMatch(/set search_path = public/);
  });
  it("grant hygiene: revoke from public AND anon, grant to authenticated", () => {
    expect(code).toMatch(/revoke all on function public\.%s from public/);
    expect(code).toMatch(/revoke all on function public\.%s from anon/);
    expect(code).toMatch(/grant execute on function public\.%s to authenticated/);
  });
  it("no service_role widening, no outbound", () => {
    expect(code).not.toMatch(/to service_role/);
    expect(migration).not.toMatch(/pg_net|net\.http|http_post|notify/i);
  });
});

describe("7. owner-gated DRAFT — RED, unapplied", () => {
  it("is a DRAFT with the needs-human-gate header and NO self-added approval", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
    expect(migration).not.toMatch(/^\s*--\s*@human-gate-approved/m);
    expect(migration).toMatch(/NOT an agency→REAL-CLIENT bridge|real two-subject/i);
  });
  it("a paired rollback exists and drops all 3 tables + functions", () => {
    const rb = "supabase/rollbacks/20260723180000_agency_real_client_bridge_v1.down.sql";
    expect(existsSync(join(REPO, rb))).toBe(true);
    const rollback = readRepo(rb);
    for (const o of ["agency_candidate_offers", "agency_client_request_shares", "agency_client_connections", "submit_agency_candidate_offer_v1", "accept_agency_client_connection_v1"]) {
      expect(rollback).toContain(o);
    }
  });
  it("APPLIED_LEDGER carries the Deferred entry", () => {
    const ledger = readRepo("docs/APPLIED_LEDGER.md");
    const d = ledger.indexOf("## Deferred");
    expect(d).toBeGreaterThan(-1);
    // Search the DEFERRED SLICE, not the whole file by first occurrence.
    //
    // The old assertion was `indexOf(name) > indexOf("## Deferred")`, which
    // silently required that the migration be mentioned NOWHERE earlier in the
    // ledger. The 2026-08-07 reconciliation added a placement note above the
    // Deferred list (this migration is applied in production and recorded
    // inside a heading that says "NOT applied" — see
    // docs/audits/APPLIED_LEDGER_FULL_RECONCILIATION_2026-08.md §3.1), and the
    // guard failed on a doc note rather than on any change of substance.
    //
    // What this guard actually means is "the Deferred list carries the entry",
    // so it now checks exactly that. Mentions elsewhere are free.
    expect(ledger.slice(d)).toContain("20260723180000_agency_real_client_bridge");
  });
});

describe("8. app layer degrades honestly", () => {
  it("read + actions map missing schema to needs-migration", () => {
    expect(read("lib/agency/bridge-read.ts")).toMatch(/needs-migration/);
    expect(read("lib/agency/bridge-actions.ts")).toMatch(/needs-migration/);
    expect(read("components/app/agency-bridge-section.tsx")).toMatch(/data-testid="agency-bridge-gated"/);
    expect(read("components/app/client-agency-bridge-section.tsx")).toMatch(/data-testid="client-bridge-gated"/);
  });
});
