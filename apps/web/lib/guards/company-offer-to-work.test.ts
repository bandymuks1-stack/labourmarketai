import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  confirmableTerms,
  parseOfferProgress,
  startWorkBlockers,
  type OfferTermsVersion,
} from "@/lib/market/team-offer-model";

/**
 * COMPANY OFFER TO WORK (owner decision 2026-11-22, item 2).
 *
 * need -> company offer -> the client's preliminary yes -> terms -> BOTH
 * direct parties confirm the same version -> the project is created -> work
 * starts. A preliminary yes is not a contract; nobody consents for anyone;
 * the client sees only its direct partner; the crew — never the whole
 * company — reaches the project. Pinned here and walked end to end by
 * tests/e2e/company-offer-to-work-isolated.spec.ts.
 */
const ROOT = join(__dirname, "..", "..", "..", "..");
const WEB = join(ROOT, "apps", "web");
const read = (p: string) => readFileSync(p, "utf8");
const UP = read(join(ROOT, "supabase/migrations/20261122200000_company_offer_to_work_v1.sql"));
const DOWN = read(join(ROOT, "supabase/rollbacks/20261122200000_company_offer_to_work_v1.down.sql"));
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

function fnBlock(sql: string, name: string): string {
  const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;\\n`);
  const m = sql.match(re);
  expect(m, `${name} not found`).toBeTruthy();
  return m![0];
}

const NEW_FNS = [
  "propose_team_demand_offer_terms_v2",
  "list_team_demand_offer_terms_v2",
  "confirm_team_demand_offer_terms_v1",
  "name_team_demand_offer_unit_v1",
  "team_demand_offer_progress_v1",
  "hand_off_team_demand_offer_v2",
];

describe("migration: additive, nothing existing is replaced", () => {
  it("defines only the six new functions; no v1 function, policy or grant on a table changes", () => {
    const defined = [...code(UP).matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(defined.sort()).toEqual([...NEW_FNS].sort());
    expect(code(UP)).not.toMatch(/\b(create|drop|alter) policy\b/i);
    expect(code(UP)).not.toMatch(/grant\s+(select|insert|update|delete)/i);
    expect(code(UP)).not.toMatch(/\b(update|delete from)\s+public\.team_demand_offers\b(?![\s\S]*?where id = o\.id)/i);
  });

  it("adds nullable columns only", () => {
    for (const col of ["unit_team_org_id", "place_text", "supplier_confirmed_at", "supplier_confirmed_by", "receiver_confirmed_at", "receiver_confirmed_by"]) {
      expect(UP).toMatch(new RegExp(`add column if not exists ${col} `));
    }
    for (const line of code(UP).split("\n").filter((l) => /add column if not exists/.test(l))) {
      expect(line, "a new column is nullable").not.toMatch(/not null/i);
    }
  });

  it("every function is SECURITY DEFINER, search_path pinned, refuses a NULL caller, signed-in only", () => {
    for (const fn of NEW_FNS) {
      const b = fnBlock(UP, fn);
      expect(b, fn).toMatch(/security definer/);
      expect(b, fn).toMatch(/set search_path = public/);
      expect(b, fn).toMatch(/raise exception 'Not authenticated' using errcode = '42501'/);
      expect(UP, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`));
      expect(UP, fn).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`));
      expect(UP, fn).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`));
    }
  });

  it("the two new person references are in the erasure registry (set null)", () => {
    expect(UP).toMatch(/'team_demand_offer_terms', 'supplier_confirmed_by', 'profiles', 'set null', 'set_null'/);
    expect(UP).toMatch(/'team_demand_offer_terms', 'receiver_confirmed_by', 'profiles', 'set null', 'set_null'/);
  });
});

describe("a preliminary yes is not an agreement: both sides confirm, each for itself", () => {
  const confirm = () => fnBlock(UP, "confirm_team_demand_offer_terms_v1");

  it("confirmation exists only after the client's preliminary yes", () => {
    expect(confirm()).toMatch(/if o\.status <> 'accepted' then\s+raise exception 'offer_not_accepted'/);
  });
  it("only the LATEST version, and only the one on the caller's screen", () => {
    expect(confirm()).toMatch(/order by t\.version desc\s+limit 1/);
    expect(confirm()).toMatch(/v_terms\.version is distinct from p_expected_version then\s+raise exception 'terms_changed'/);
  });
  it("a party writes only its own side's confirmation; agreed = both on that version", () => {
    expect(confirm()).toMatch(/if v_side = 'supplier' then\s+update public\.team_demand_offer_terms\s+set supplier_confirmed_at = now\(\), supplier_confirmed_by = uid/);
    expect(confirm()).toMatch(/set receiver_confirmed_at = now\(\), receiver_confirmed_by = uid/);
    expect(confirm()).toMatch(/t\.supplier_confirmed_at is not null and t\.receiver_confirmed_at is not null/);
  });
  it("terms can still be proposed after the yes (a new version starts unconfirmed)", () => {
    expect(fnBlock(UP, "propose_team_demand_offer_terms_v2")).toMatch(/if o\.status not in \('offered', 'accepted'\) then/);
  });
  it("the terms reader names a side, never a person", () => {
    const list = fnBlock(UP, "list_team_demand_offer_terms_v2");
    expect(list).not.toMatch(/proposed_by|confirmed_by\b|profiles|full_name/);
  });
});

describe("the crew, never the whole company, reaches the project", () => {
  const hand = () => fnBlock(UP, "hand_off_team_demand_offer_v2");

  it("a company offer needs agreed terms AND a named crew; the crew is the assigned unit", () => {
    expect(hand()).toMatch(/raise exception 'terms_not_agreed'/);
    expect(hand()).toMatch(/raise exception 'unit_not_named'/);
    expect(hand()).toMatch(/v_unit := o\.unit_team_org_id;/);
    expect(hand()).toMatch(/values \(v_unit, p_project_id, p_work_object_id, p_task_id, uid\)/);
  });
  it("a brigade offer is handed off exactly as before (its own unit)", () => {
    expect(hand()).toMatch(/if o\.offer_kind = 'team' then\s+v_unit := o\.team_org_id;/);
  });
  it("the crew must be one of the offering organization's OWN brigades, with a member", () => {
    const name = fnBlock(UP, "name_team_demand_offer_unit_v1");
    expect(name).toMatch(/team_offer_party_side_v1\(o\.id\) is distinct from 'supplier'/);
    expect(name).toMatch(/u\.organization_type = 'team'/);
    expect(name).toMatch(/u\.owner_profile_id is not distinct from v_owner/);
    expect(name).toMatch(/raise exception 'unit_has_no_members'/);
    expect(hand()).toMatch(/u\.owner_profile_id = v_owner/);
  });
  it("only the need's owner hands off, onto its own project", () => {
    expect(hand()).toMatch(/not public\.team_offer_receiver_v1\(o\.request_id\)/);
    expect(hand()).toMatch(/raise exception 'project_not_of_demand_owner'/);
  });
  it("the progress reader counts the crew, never lists its members", () => {
    const p = fnBlock(UP, "team_demand_offer_progress_v1");
    expect(p).toMatch(/count\(\*\)::integer from public\.engagement_contexts/);
    expect(p).not.toMatch(/profile_id\s*,|full_name|profiles p/);
  });
});

describe("rollback", () => {
  it("refuses while any agreement, place or crew exists; drops only what the migration added", () => {
    expect(DOWN).toMatch(/named crews exist - forward-fix/);
    expect(DOWN).toMatch(/confirmed terms or places exist - forward-fix/);
    for (const fn of NEW_FNS) expect(DOWN).toMatch(new RegExp(`drop function if exists public\\.${fn}\\(`));
    expect(DOWN).not.toMatch(/create or replace function/);
  });
});

describe("the app", () => {
  const svc = read(join(WEB, "lib/company/team-offer.ts"));
  const actions = read(join(WEB, "lib/company/team-offer-actions.ts"));

  it("reads and writes v2 first, v1 only while v2 is missing", () => {
    expect(svc).toMatch(/rpc\("hand_off_team_demand_offer_v2", args\);\s+if \(error && missingFn\(error\)\) \{\s+\(\{ data, error \} = await asAny\(ctx\.supabase\)\.rpc\("hand_off_team_demand_offer_v1", args\)\);/);
    expect(svc).toMatch(/readRows\("list_team_demand_offer_terms_v2"[\s\S]*?readRows\("list_team_demand_offer_terms_v1"/);
    expect(svc).toMatch(/rpc\("propose_team_demand_offer_terms_v2"[\s\S]*?rpc\("propose_team_demand_offer_terms_v1", v1Args\)/);
  });
  it("starting the work creates ONE project through the shared core and gate, and removes it on a refusal", () => {
    expect(actions).toMatch(/hasOrganizationCapability\(company\.role, "manage-projects"\)/);
    expect(actions).toMatch(/insertProjectForCompany\(supabase, company\.companyId, \{ title, city: null \}\)/);
    expect(actions).toMatch(/if \(handed\.status !== "ok"\) \{\s+await rollbackCreatedProject\(supabase, created\.id\);/);
  });
  it("no copy calls a confirmation a signature or a contract", () => {
    for (const l of ["en", "lt", "ru", "nl", "de", "pl", "sv"]) {
      const ns = (JSON.parse(read(join(WEB, "messages", `${l}.json`))) as { teamDemandOffer: { terms: { confirmNote: string } } }).teamDemandOffer;
      expect(ns.terms.confirmNote.length, l).toBeGreaterThan(20);
    }
    const en = (JSON.parse(read(join(WEB, "messages", "en.json"))) as { teamDemandOffer: { terms: { confirmNote: string } } }).teamDemandOffer;
    expect(en.terms.confirmNote).toMatch(/not a signature and does not create a contract/);
  });
});

describe("model", () => {
  const v = (over: Partial<OfferTermsVersion>): OfferTermsVersion => ({
    version: 1, proposedSide: "supplier", mine: true, capacity: null, rateText: null, startDate: null,
    endDate: null, scopeText: null, conditionsText: null, placeText: null, status: "proposed",
    createdAt: "", decidedAt: null, supplierConfirmed: false, receiverConfirmed: false, confirmedByMe: false, ...over,
  });
  it("only the newest open or accepted version is confirmable", () => {
    expect(confirmableTerms([v({ version: 2 }), v({ version: 1, status: "superseded" })])?.version).toBe(2);
    expect(confirmableTerms([v({ version: 3, status: "declined" })])).toBeNull();
    expect(confirmableTerms([])).toBeNull();
  });
  it("a company offer can start only when agreed and the crew is named; a brigade has no blocker", () => {
    const base = parseOfferProgress({ my_side: "receiver", offer_kind: "organization", status: "accepted", unit_named: false, agreed: false })!;
    expect(startWorkBlockers(base)).toEqual(["terms_not_agreed", "unit_not_named"]);
    expect(startWorkBlockers({ ...base, agreed: true, unitNamed: true })).toEqual([]);
    expect(startWorkBlockers({ ...base, offerKind: "team" })).toEqual([]);
  });
});
