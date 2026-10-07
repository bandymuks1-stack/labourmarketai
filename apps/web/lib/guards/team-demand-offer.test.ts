import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CANONICAL_APP_RPCS } from "@/lib/security/canonical-authenticated-rpcs";

/**
 * E6 - OFFERING A TEAM AGAINST A DEMAND: static guards.
 *
 * The live proof is scripts/db-proof/team-demand-offer.sh on a throwaway
 * PostgreSQL (126 checks). These pin the SHAPE that proof depends on, so a later
 * edit cannot quietly reintroduce what the owner ruled out: a member disclosed by
 * the offer itself, a write that bypasses the RPCs, an anon path, a second
 * assignment model, or a payment/confirmation gate.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r/g, "");
const MIG = read(join(REPO, "supabase", "migrations", "20261007150000_team_demand_offer_v1.sql"));
const DOWN = read(join(REPO, "supabase", "rollbacks", "20261007150000_team_demand_offer_v1.down.sql"));
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const SQL = code(MIG);

const FNS = [
  "list_open_demand_for_team_offer_v1",
  "offer_team_to_demand_v1",
  "withdraw_team_demand_offer_v1",
  "list_team_demand_offers_for_team_v1",
  "list_team_offers_for_request_v1",
  "respond_team_demand_offer_v1",
  "hand_off_team_demand_offer_v1",
];

/** The body of one function, up to its `$$;` terminator. */
function body(name: string): string {
  const start = SQL.indexOf(`function public.${name}(`);
  expect(start, `function ${name} missing`).toBeGreaterThan(-1);
  const end = SQL.indexOf("$$;", SQL.indexOf("as $$", start) + 5);
  return SQL.slice(start, end);
}

describe("1. the migration is additive, RPC-only and closed to anon", () => {
  it("defines the table once and every function as SECURITY DEFINER with a pinned search_path", () => {
    expect(SQL.match(/create table if not exists public\.team_demand_offers/g)).toHaveLength(1);
    for (const f of [...FNS, "team_offer_receiver_v1"]) {
      const b = body(f);
      expect(b, f).toMatch(/security definer/);
      expect(b, f).toMatch(/set search_path = public/);
    }
  });

  it("redefines NO existing function and touches no existing table", () => {
    const created = [...SQL.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(created)).toEqual(new Set([...FNS, "team_offer_receiver_v1"]));
    expect(SQL).not.toMatch(/alter table public\.(?!team_demand_offers)/);
    expect(SQL).not.toMatch(/\b(drop table|drop column|truncate|delete from|update public\.(?!team_demand_offers))/i);
  });

  it("writes are RPC-only: select-only grant, no write policy, anon and PUBLIC revoked everywhere", () => {
    expect(SQL).toMatch(/revoke all on public\.team_demand_offers from public, anon, authenticated/);
    expect(SQL).toMatch(/grant select on public\.team_demand_offers to authenticated/);
    expect(SQL).not.toMatch(/grant (insert|update|delete|all)[^;]*team_demand_offers/i);
    expect(SQL).not.toMatch(/create policy[^;]*for (insert|update|delete|all)/i);
    for (const f of FNS) {
      expect(SQL, f).toMatch(new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon`));
      expect(SQL, f).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated`));
    }
    expect(SQL).toMatch(/revoke all on function public\.team_offer_receiver_v1\(uuid\) from public, anon, authenticated/);
    expect(SQL).not.toMatch(/\bto (anon|public)\b|using \(true\)/i);
  });

  it("every function refuses a NULL caller before doing anything", () => {
    for (const f of FNS) expect(body(f), f).toMatch(/auth\.uid\(\)/);
    for (const f of FNS) expect(body(f), f).toMatch(/Not authenticated/);
  });

  it("the rollback refuses while history exists", () => {
    expect(DOWN).toMatch(/rollback refused/);
    expect(DOWN).toMatch(/drop table if exists public\.team_demand_offers/);
    for (const f of [...FNS, "team_offer_receiver_v1"]) expect(DOWN, f).toContain(f);
  });
});

describe("2. member privacy - the offer discloses no member", () => {
  it("the receiving-side reader projects no identity column and reads no profile name", () => {
    const b = body("list_team_offers_for_request_v1");
    const returns = b.slice(b.indexOf("returns table"), b.indexOf("language plpgsql"));
    expect(returns).not.toMatch(/profile_id|worker_id|full_name|member_name|email|phone|user_id/i);
    expect(b).not.toMatch(/profiles\b|full_name|email/i);
    // Aggregates only: counts and jsonb of counts.
    expect(b).toMatch(/count\(/);
  });

  it("the reader answers zero rows - not an error - to anyone who is not the demand's receiver", () => {
    const b = body("list_team_offers_for_request_v1");
    expect(b).toMatch(/if not public\.team_offer_receiver_v1\(p_request_id\) then\s+return;/);
  });

  it("the raw offer table is not readable by the receiving side (RLS = offering managers + admin)", () => {
    const policy = SQL.slice(SQL.indexOf("create policy team_demand_offers_select_v1"));
    const pol = policy.slice(0, policy.indexOf(";") + 1);
    expect(pol).toMatch(/manages_organization\(team_org_id\)/);
    expect(pol).not.toMatch(/customer_requests|team_offer_receiver_v1|has_org_demand_access/);
  });

  it("a team of fewer than 2 cannot be offered (one person is not a brigade)", () => {
    expect(body("offer_team_to_demand_v1")).toMatch(/v_members < 2[\s\S]*team_too_small/);
    expect(SQL).toMatch(/member_count_at_offer\s+integer not null check \(member_count_at_offer >= 2\)/);
  });

  it("acceptance does not widen the disclosure: respond never reads or returns a member", () => {
    const b = body("respond_team_demand_offer_v1");
    expect(b).not.toMatch(/profiles\b|full_name|worker_id|profile_id\s*,/);
    expect(b).not.toMatch(/return query/);
  });
});

describe("3. authority and direction", () => {
  it("offering needs authority over the TEAM and refuses with one word for every non-offerable demand", () => {
    const b = body("offer_team_to_demand_v1");
    expect(b).toMatch(/manages_organization\(p_team_org_id\)/);
    expect(b).toMatch(/demand_not_offerable/);
    // closed allow-list of directions, never a deny-list
    expect(b).toMatch(/cr\.kind is null or cr\.kind in \('company_request', 'buyer_request'\)/);
    expect(b).not.toMatch(/agency_offer/);
    expect(b).toMatch(/cr\.status = 'submitted'/);
    expect(b).toMatch(/verification_status = 'verified'/);
    expect(b).toMatch(/cr\.profile_id <> uid/);
  });

  it("answering and assigning need the DEMAND receiver, never the offering team", () => {
    expect(body("respond_team_demand_offer_v1")).toMatch(/team_offer_receiver_v1\(o\.request_id\)/);
    expect(body("hand_off_team_demand_offer_v1")).toMatch(/team_offer_receiver_v1\(o\.request_id\)/);
    expect(body("hand_off_team_demand_offer_v1")).toMatch(/can_manage_project\(p_project_id\)/);
    expect(body("withdraw_team_demand_offer_v1")).toMatch(/manages_organization\(o\.team_org_id\)/);
  });

  it("the unit can only be handed off to a project of the DEMAND OWNER", () => {
    expect(body("hand_off_team_demand_offer_v1")).toMatch(/project_not_of_demand_owner/);
  });
});

describe("4. hand-off reuses the assignment relation - no second model, no gate", () => {
  const b = body("hand_off_team_demand_offer_v1");
  it("writes ONE team_assignments row with the same conflict target and audit action as assign_team_to_work_v1", () => {
    expect(b).toMatch(/insert into public\.team_assignments/);
    expect(b).toMatch(/on conflict \(\s*team_org_id, project_id,/);
    expect(b).toMatch(/'team_assigned_v1'/);
  });
  it("writes no per-person row (no fan-out)", () => {
    expect(b).not.toMatch(/project_worker_assignments|assign_worker_to_project/);
  });
  it("adds no payment, billing or confirmation gate anywhere in the migration", () => {
    expect(SQL).not.toMatch(/stripe|payment|invoice|billing|subscription|confirmation_token|otp/i);
  });
  it("the parity is explicit: the existing assignment function is still the one that ends it", () => {
    expect(SQL).not.toMatch(/end_team_assignment_v1|create or replace function public\.assign_team_to_work_v1/);
  });
});

describe("5. the application side is thin, RPC-only and registered", () => {
  const files = [
    "lib/market/team-offer.ts",
    "lib/market/team-offer-actions.ts",
    "components/app/team-demand-offer-form.tsx",
    "components/app/team-offers-received.tsx",
  ];
  it("exists", () => {
    for (const f of files) expect(existsSync(join(WEB, f)), f).toBe(true);
  });

  it("never writes the offer table directly and never selects a member", () => {
    const svc = read(join(WEB, "lib/market/team-offer.ts"));
    expect(svc).not.toMatch(/\.from\(["']team_demand_offers["']\)/);
    expect(svc).not.toMatch(/engagement_contexts|\.from\(["']profiles["']\)|\.from\(["']workers["']\)/);
    for (const rpc of FNS) expect(svc, rpc).toContain(rpc);
  });

  it("server actions take no identity argument", () => {
    const actions = read(join(WEB, "lib/market/team-offer-actions.ts"));
    expect(actions).toMatch(/^"use server";/);
    expect(actions).not.toMatch(/userId|profileId|ownerId|actorId/);
  });

  it("every RPC the app calls is in the canonical authenticated-RPC inventory", () => {
    for (const rpc of FNS) expect(CANONICAL_APP_RPCS as readonly string[], rpc).toContain(rpc);
  });

  it("the employer-side section is mounted on the demand surface, not only the admin workbench", () => {
    const page = read(join(WEB, "app/[locale]/dashboard/company/scouting/page.tsx"));
    expect(page).toMatch(/TeamOffersReceived/);
    expect(page).toMatch(/loadTeamOffersForDemand/);
    const svc = read(join(WEB, "lib/market/team-offer.ts"));
    expect(svc).toMatch(/matchTeamToNeed\(need, offerToTeamMatchInput\(offer\)\)/);
    // no member subjects passed -> team_aggregate basis only
    expect(svc).not.toMatch(/matchTeamToNeed\([^)]*,[^)]*,/);
  });

  it("the offer control is mounted on the team panel", () => {
    const panel = read(join(WEB, "components/app/team-brigades-panel.tsx"));
    expect(panel).toMatch(/TeamDemandOfferForm/);
  });
});

describe("6. i18n - every shipped full locale carries the namespace with the same keys", () => {
  const LOCALES = ["en", "lt", "de", "nl", "pl", "ru"];
  const flat = (o: unknown, prefix = ""): string[] =>
    typeof o === "object" && o !== null
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, `${prefix}${k}.`))
      : [prefix.slice(0, -1)];
  const ns = (loc: string) =>
    (JSON.parse(read(join(WEB, "messages", `${loc}.json`))) as Record<string, unknown>).teamDemandOffer;

  it("has the namespace in all six", () => {
    for (const l of LOCALES) expect(ns(l), l).toBeTruthy();
  });
  it("key sets are identical to English and no value is empty", () => {
    const en = flat(ns("en")).sort();
    for (const l of LOCALES) {
      expect(flat(ns(l)).sort(), l).toEqual(en);
    }
    const values = (o: unknown): string[] =>
      typeof o === "string" ? [o] : typeof o === "object" && o ? Object.values(o).flatMap(values) : [];
    for (const l of LOCALES) for (const v of values(ns(l))) expect(v.trim().length, l).toBeGreaterThan(0);
  });
  it("the refusal vocabulary covers every code the model can emit", () => {
    const refusal = Object.keys((ns("en") as { refusal: Record<string, string> }).refusal);
    for (const code of [
      "not_authed", "not_authorized", "demand_not_offerable", "team_too_small", "previously_declined",
      "offer_limit_reached", "offer_not_open", "offer_not_accepted", "demand_closed",
      "project_not_of_demand_owner", "project_completed", "task_not_assignable", "object_not_assignable",
      "one_scope_only", "team_has_no_members", "project_required", "invalid_decision", "needs_migration", "error",
    ]) {
      expect(refusal, code).toContain(code);
    }
  });
  it('the product copy never uses the banned word "demo"', () => {
    for (const l of LOCALES) expect(JSON.stringify(ns(l)), l).not.toMatch(/\bdemo\b/i);
  });
});
