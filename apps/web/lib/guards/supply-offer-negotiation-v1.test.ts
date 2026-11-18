import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  answerableTerms,
  normalizeTermsInput,
  offerRefusalOf,
  parseReceivedOffer,
  parseTermsVersion,
} from "@/lib/market/team-offer-model";

/**
 * Supply offer negotiation (20261011200000, owner P0 2026-10-11): one offer
 * relation, versioned terms, the other side answers, agreement is in
 * principle only. These pins keep the migration's boundary and the app's
 * reading of it from drifting apart.
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const MIG = readFileSync(join(REPO, "supabase/migrations/20261011200000_supply_offer_negotiation_v1.sql"), "utf8");
const DOWN = readFileSync(join(REPO, "supabase/rollbacks/20261011200000_supply_offer_negotiation_v1.down.sql"), "utf8");
const BASE = readFileSync(join(REPO, "supabase/migrations/20261007150000_team_demand_offer_v1.sql"), "utf8");

describe("migration boundary", () => {
  it("extends team_demand_offers — no second offer table", () => {
    expect(MIG).toMatch(/alter table public\.team_demand_offers\s+add column if not exists offer_kind/);
    expect(MIG).not.toMatch(/create table[^;]*\b(supply_offers|company_offers|org_offers)\b/i);
  });

  it("terms are RPC-only: RLS on, every table grant revoked, no policy", () => {
    expect(MIG).toMatch(/alter table public\.team_demand_offer_terms enable row level security/);
    expect(MIG).toMatch(/revoke all on public\.team_demand_offer_terms from public, anon, authenticated/);
    expect(MIG).not.toMatch(/create policy[^;]*team_demand_offer_terms/i);
    expect(MIG).not.toMatch(/grant [^;]*on public\.team_demand_offer_terms/i);
  });

  it("the party predicate is internal (no EXECUTE for anyone)", () => {
    expect(MIG).toMatch(/revoke all on function public\.team_offer_party_side_v1\(uuid\) from public, anon, authenticated/);
    expect(MIG).not.toMatch(/grant execute on function public\.team_offer_party_side_v1/);
  });

  it("every new callable function revokes anon and grants authenticated only", () => {
    for (const sig of [
      "propose_team_demand_offer_terms_v1(uuid, integer, text, date, date, text, text)",
      "list_team_demand_offer_terms_v1(uuid)",
      "list_team_offers_for_request_v2(uuid)",
    ]) {
      expect(MIG).toContain(`revoke all on function public.${sig} from public, anon;`);
      expect(MIG).toContain(`grant execute on function public.${sig} to authenticated;`);
    }
  });

  it("the terms listing carries no profile id", () => {
    const fn = MIG.slice(MIG.indexOf("function public.list_team_demand_offer_terms_v1"));
    const returns = fn.slice(0, fn.indexOf("language plpgsql"));
    expect(returns).not.toMatch(/proposed_by|decided_by|profile/);
  });

  it("a brigade is still at least two people; only an organization offer may be smaller", () => {
    expect(MIG).toMatch(/check \(offer_kind <> 'team' or member_count_at_offer >= 2\)/);
    expect(MIG).toMatch(/if v_kind = 'team' and v_members < 2 then/);
  });

  it("an organization offer is never assigned as a unit", () => {
    expect(MIG).toMatch(/if o\.offer_kind <> 'team' then\s+raise exception 'organization_offer_not_a_unit'/);
  });

  it("a party never accepts its own proposal", () => {
    expect(MIG).toMatch(/raise exception 'terms_await_other_side'/);
    expect(MIG).toMatch(/v_terms\.proposed_side <> 'receiver'/);
  });

  it("an organization cannot offer against its own need", () => {
    expect((MIG.match(/cr\.organization_id is distinct from p_team_org_id/g) ?? []).length).toBe(2);
  });

  it("the rollback refuses real history and restores the E6 bodies verbatim", () => {
    expect(DOWN).toMatch(/team_demand_offer_terms has rows - forward-fix/);
    expect(DOWN).toMatch(/organization offers exist - forward-fix/);
    for (const name of [
      "list_open_demand_for_team_offer_v1",
      "offer_team_to_demand_v1",
      "list_team_demand_offers_for_team_v1",
      "respond_team_demand_offer_v1",
      "hand_off_team_demand_offer_v1",
    ]) {
      const re = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;\\n`);
      const original = BASE.match(re)?.[0];
      expect(original, name).toBeTruthy();
      expect(DOWN, `${name} restored verbatim`).toContain(original!);
    }
  });
});

describe("app reading", () => {
  it("v1 rows (no offer_kind) read as brigades", () => {
    const row = parseReceivedOffer({ offer_id: "a", team_org_id: "b", status: "offered" });
    expect(row?.offerKind).toBe("team");
    expect(parseReceivedOffer({ offer_id: "a", team_org_id: "b", status: "offered", offer_kind: "organization" })?.offerKind).toBe(
      "organization",
    );
  });

  it("parses a terms version and refuses a malformed one", () => {
    const v = parseTermsVersion({ version: 2, proposed_side: "receiver", mine: false, capacity: 4, rate_text: "30 €/h", status: "proposed", created_at: "x" });
    expect(v).toMatchObject({ version: 2, proposedSide: "receiver", mine: false, capacity: 4, rateText: "30 €/h" });
    expect(parseTermsVersion({ version: 1, proposed_side: "someone", status: "proposed" })).toBeNull();
    expect(parseTermsVersion({ version: 1, proposed_side: "supplier", status: "signed" })).toBeNull();
  });

  it("only the OTHER side's open version is answerable", () => {
    const mk = (mine: boolean, status: "proposed" | "superseded") =>
      parseTermsVersion({ version: 1, proposed_side: "supplier", mine, status, created_at: "x" })!;
    expect(answerableTerms([mk(false, "proposed")])?.version).toBe(1);
    expect(answerableTerms([mk(true, "proposed")])).toBeNull();
    expect(answerableTerms([mk(false, "superseded")])).toBeNull();
  });

  it("normalizes form terms and rejects an empty set", () => {
    expect(normalizeTermsInput({ capacity: "", rateText: "  ", startDate: "", scopeText: "" })).toBeNull();
    expect(normalizeTermsInput({ capacity: "4", startDate: "2026-11-02", endDate: "nope" })).toEqual({
      capacity: 4,
      rateText: null,
      startDate: "2026-11-02",
      endDate: null,
      scopeText: null,
      conditionsText: null,
    });
    expect(normalizeTermsInput({ capacity: "0" })).toBeNull();
    expect(normalizeTermsInput({ capacity: "501", rateText: "x" })?.capacity).toBeNull();
  });

  it("maps the new stable refusal words", () => {
    for (const w of ["terms_empty", "terms_invalid", "terms_limit_reached", "terms_await_other_side", "organization_offer_not_a_unit"] as const) {
      expect(offerRefusalOf({ code: "22023", message: w })).toBe(w);
    }
  });
});
