import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseOfferCandidate } from "@/lib/market/team-offer-model";

/**
 * AGENCY CANDIDATES ON AN OPEN NEED (owner decision 2026-11-22, item 3).
 *
 * An agency proposes specific workers with no earlier link to the client;
 * the client reads a pseudonym and professional facts only; the name is shown
 * only after the client chooses the person AND the person accepts the booking
 * (the existing relation rule); contacts, documents and confidential data are
 * never shown; an agency never sees another agency's offers; the client deals
 * with the agency only (decision 0033). Walked end to end by
 * tests/e2e/agency-open-need-candidates-isolated.spec.ts.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const WEB = join(ROOT, "apps", "web");
const read = (p: string) => readFileSync(p, "utf8");
const UP = read(join(ROOT, "supabase/migrations/20261122210000_agency_open_need_candidates_v1.sql"));
const DOWN = read(join(ROOT, "supabase/rollbacks/20261122210000_agency_open_need_candidates_v1.down.sql"));
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

function fnBlock(name: string): string {
  const m = UP.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;\\n`));
  expect(m, `${name} not found`).toBeTruthy();
  return m![0];
}
const PUBLIC_FNS = ["add_offer_candidate_v1", "withdraw_offer_candidate_v1", "list_offer_candidates_v1", "select_offer_candidate_v1"];

describe("migration: additive and RPC-only", () => {
  it("replaces no existing function; defines exactly the internal helper and four RPCs", () => {
    const defined = [...code(UP).matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]).sort();
    expect(defined).toEqual(["offer_agency_company_v1", ...PUBLIC_FNS].sort());
    expect(code(UP)).not.toMatch(/\b(create|drop|alter) policy\b/i);
  });
  it("the table is RPC-only: RLS forced, no policy, nothing granted", () => {
    expect(UP).toMatch(/alter table public\.team_demand_offer_candidates force row level security;/);
    expect(UP).toMatch(/revoke all on public\.team_demand_offer_candidates from public, anon, authenticated;/);
    expect(code(UP)).not.toMatch(/grant\s+(select|insert|update|delete)/i);
  });
  it("four RPCs for signed-in callers; the helper for nobody", () => {
    for (const fn of PUBLIC_FNS) {
      expect(fnBlock(fn), fn).toMatch(/security definer/);
      expect(fnBlock(fn), fn).toMatch(/raise exception 'Not authenticated' using errcode = '42501'/);
      expect(UP).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`));
      expect(UP).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    }
    expect(UP).toMatch(/revoke all on function public\.offer_agency_company_v1\(uuid\) from authenticated;/);
    expect(code(UP)).not.toMatch(/grant execute on function public\.offer_agency_company_v1/);
  });
  it("is an agency by the ONE capability rule (ORG-2), never a company_type comparison", () => {
    expect(fnBlock("offer_agency_company_v1")).toMatch(/public\.company_acts_as_agency\(o\.legacy_company_id\)/);
    expect(code(UP)).not.toMatch(/company_type\s*=\s*'staffing_agency'/);
  });
});

describe("the agency proposes only its own people, on its own offer", () => {
  it("only the supplier side of a company offer made by an agency", () => {
    const add = fnBlock("add_offer_candidate_v1");
    expect(add).toMatch(/team_offer_party_side_v1\(o\.id\) is distinct from 'supplier'/);
    expect(add).toMatch(/raise exception 'not_an_agency_offer'/);
  });
  it("only a worker on that agency's ACTIVE roster; at most 10 open candidates", () => {
    const add = fnBlock("add_offer_candidate_v1");
    expect(add).toMatch(/cw\.company_id = v_agency and cw\.worker_id = p_worker_id and cw\.status = 'active'/);
    expect(add).toMatch(/>= 10 then\s+raise exception 'candidate_limit_reached'/);
  });
});

describe("the client reads a pseudonym and facts — never identity", () => {
  const list = () => fnBlock("list_offer_candidates_v1");
  it("the client's label is a pseudonym; only the supplier reads its own roster name", () => {
    expect(list()).toMatch(/case when v_side = 'supplier'\s+then coalesce\(nullif\(btrim\(w\.display_name\), ''\)/);
    expect(list()).toMatch(/else 'Candidate ' \|\| upper\(left\(replace\(k\.id::text, '-', ''\), 6\)\) end/);
  });
  it("returns no worker id, profile, contact, photo, bio, headline or document", () => {
    const ret = list().match(/returns table \(([\s\S]*?)\)\s*language/)![1]!;
    for (const col of ["worker_id", "profile", "email", "phone", "avatar", "photo", "bio", "headline", "document", "full_name"]) {
      expect(ret, col).not.toMatch(new RegExp(col, "i"));
    }
    expect(list()).not.toMatch(/w\.bio|w\.headline|profiles|avatar|email|phone|worker_documents/);
  });
  it("either party only; an agency never reads another agency's offer", () => {
    expect(list()).toMatch(/v_side := public\.team_offer_party_side_v1\(p_offer_id\);\s+if v_side is null then\s+return;/);
  });
});

describe("the client's choice reuses the existing chain; the worker decides", () => {
  const sel = () => fnBlock("select_offer_candidate_v1");
  it("only the need's receiver chooses, only an open candidate on an open need", () => {
    expect(sel()).toMatch(/team_offer_party_side_v1\(c\.offer_id\) is distinct from 'receiver'/);
    expect(sel()).toMatch(/raise exception 'candidate_not_open'/);
    expect(sel()).toMatch(/if r\.status <> 'submitted' then\s+raise exception 'demand_closed'/);
  });
  it("the existing connection / share / candidate offer, as the AGENCY's own (decision 0033)", () => {
    expect(sel()).toMatch(/from public\.agency_client_connections ac\s+where ac\.agency_company_id = v_agency and ac\.client_company_id = v_client and ac\.status = 'active'/);
    expect(sel()).toMatch(/insert into public\.agency_client_request_shares \(connection_id, request_id, status, shared_by\)/);
    expect(sel()).toMatch(/insert into public\.agency_candidate_offers\s+\(connection_id, request_share_id, agency_company_id, client_company_id, request_id, worker_id, status, note, created_by\)/);
  });
  it("the EXISTING accept path proposes the booking; nothing accepts for the worker", () => {
    expect(sel()).toMatch(/v_booking := public\.respond_agency_candidate_offer_v1\(v_aco, 'accepted', v_note\);/);
    expect(code(UP)).not.toMatch(/respond_booking_request|update public\.booking_requests|insert into public\.booking_requests/);
    expect(code(UP)).not.toMatch(/insert into public\.engagement_contexts/);
  });
  it("the name rule is not touched (it stays caller_has_worker_relation_v1)", () => {
    expect(code(UP)).not.toMatch(/conversation_counterpart_identities|caller_has_worker_relation_v1/);
  });
});

describe("rollback and privacy", () => {
  it("refuses while any candidate exists; drops only what was added", () => {
    expect(DOWN).toMatch(/offer candidates exist - forward-fix/);
    expect(DOWN).toMatch(/drop table if exists public\.team_demand_offer_candidates;/);
    expect(DOWN).not.toMatch(/create or replace function/);
  });
  it("the person references are in the erasure registry and the worker's export", () => {
    expect(UP).toMatch(/'team_demand_offer_candidates', 'worker_id', 'workers', 'cascade', 'allow_cascade'/);
    expect(UP).toMatch(/'team_demand_offer_candidates', 'added_by', 'profiles', 'set null', 'set_null'/);
    expect(UP).toMatch(/'team_demand_offer_candidates', 'selected_by', 'profiles', 'set null', 'set_null'/);
    expect(read(join(WEB, "lib/privacy/personal-relations.ts"))).toMatch(/\{ table: "team_demand_offer_candidates", key: "worker_id" \}/);
  });
});

describe("model", () => {
  it("parses facts and drops anything unknown; never carries a worker id", () => {
    const c = parseOfferCandidate({
      candidate_id: "k", label: "Candidate ABC123", status: "offered", experience_years: 7, work_country: "LT",
      availability: "available", languages: [{ lang: "lt", level: "C2" }, { nope: 1 }], skills: [{ slug: "welding", confirmed: true }],
      worker_id: "w-should-not-pass", email: "x@y.z",
    });
    expect(c).toMatchObject({ label: "Candidate ABC123", experienceYears: 7, languages: [{ lang: "lt", level: "C2" }], skills: [{ slug: "welding", confirmed: true }] });
    expect(JSON.stringify(c)).not.toMatch(/w-should-not-pass|x@y\.z/);
  });
});
