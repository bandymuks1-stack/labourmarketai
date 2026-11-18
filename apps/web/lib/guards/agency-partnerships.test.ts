import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD — agency-to-agency cooperation and commissions (register 4.30, owner
 * decision 2026-11-18; migration 20261118100000, RED, owner-gated).
 *
 * The chain stays the existing one. A partner's candidate is an ordinary
 * offer on the CLIENT's own share and connection, from the partner's own
 * roster; the client's agreement is the LEAD's placement term; a commission is
 * a read — due only on an actual placement, split by the share fixed on the
 * partnership, never charged here. The PostgreSQL proof
 * (scripts/db-proof/agency-partnerships-v1.sh) runs the behaviour; this guard
 * pins the rules in the text so a later edit cannot quietly drop one.
 */
const WEB = resolve(__dirname, "../..");
const REPO = resolve(WEB, "../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const MIG = "supabase/migrations/20261118100000_agency_partnerships_commissions_v1.sql";
const DOWN = "supabase/rollbacks/20261118100000_agency_partnerships_commissions_v1.down.sql";
const sql = read(MIG);
const fn = (name: string): string => {
  const at = sql.indexOf(`create or replace function public.${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};

const FUNCTIONS = [
  "invite_agency_partner_v1",
  "accept_agency_partnership_v1",
  "decline_agency_partnership_v1",
  "end_agency_partnership_v1",
  "share_request_with_partner_v1",
  "unshare_request_with_partner_v1",
  "submit_partner_candidate_offer_v1",
  "respond_agency_candidate_offer_v2",
  "list_agency_partnerships_v1",
  "list_partner_shared_requests_v1",
  "list_partner_offers_for_lead_v1",
  "list_agency_commissions_v1",
];

describe("agency partnerships — the database keeps every rule", () => {
  it("is RED and acknowledged, not approved, and ships its rollback and proof", () => {
    expect(sql.split("\n")[0]).toMatch(/^-- @human-gate-approved\s+\(acknowledgement only/);
    expect(sql).toMatch(/NO OWNER APPROVAL OF THIS SQL\s*\n-- EXISTS YET/);
    expect(existsSync(resolve(REPO, DOWN))).toBe(true);
    expect(existsSync(resolve(REPO, "scripts/db-proof/agency-partnerships-v1.sh"))).toBe(true);
  });

  it("every function is SECURITY DEFINER with an empty search_path, and signed-in only", () => {
    for (const name of FUNCTIONS) {
      expect(fn(name), name).toMatch(/security definer\s+set search_path = ''/);
      expect(sql, name).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from anon;`));
      expect(sql, name).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`));
    }
    expect(sql).not.toMatch(/to anon\b(?!;)|grant [^;]* to anon/i);
  });

  it("the two new tables force RLS and are written by no role", () => {
    for (const t of ["agency_partnerships", "agency_partner_request_shares"]) {
      expect(sql).toContain(`alter table public.${t} force row level security;`);
      expect(sql).toContain(`revoke all on public.${t} from authenticated;`);
      expect(sql).toContain(`grant select on public.${t} to authenticated;`);
      expect(sql).not.toMatch(new RegExp(`grant (insert|update|delete)[^;]*on public\\.${t}`, "i"));
    }
  });

  it("the share is fixed on the partnership: above 0, below 100, never edited", () => {
    expect(sql).toMatch(/partner_share_percent numeric\(5, 2\) not null check \(partner_share_percent > 0 and partner_share_percent < 100\)/);
    expect(sql).not.toMatch(/set[^;]*partner_share_percent\s*=/i);
  });

  it("only the addressee of a live invitation accepts it, for an agency they govern", () => {
    const accept = fn("accept_agency_partnership_v1");
    expect(accept).toMatch(/lower\(v_row\.invited_email\) <> v_email/);
    expect(accept).toMatch(/v_row\.expires_at <= now\(\)/);
    expect(accept).toMatch(/public\.owns_company\(p_partner_company_id\)/);
    expect(accept).toMatch(/public\.company_acts_as_agency\(p_partner_company_id\)/);
  });

  it("the lead passes only a need its OWN client shared with it, live", () => {
    expect(fn("share_request_with_partner_v1")).toMatch(
      /s\.status = 'active'\s+and c\.status = 'active' and c\.agency_company_id = v_lead/,
    );
  });

  it("the partner offers only its own active roster, onto the client's share and connection", () => {
    const offer = fn("submit_partner_candidate_offer_v1");
    expect(offer).toMatch(/cw\.company_id = v_partner and cw\.worker_id = p_worker_id and cw\.status = 'active'/);
    expect(offer).toMatch(/ps\.status = 'active'\s+and p\.status = 'active' and s\.status = 'active' and c\.status = 'active'/);
    expect(offer).toMatch(/values\s+\(v_conn, v_share, v_partner, v_client, v_request, p_worker_id, 'offered', v_note, v_uid, p_partner_share_id\)/);
  });

  it("a partner's candidate carries the LEAD's term, and needs a live partnership to be accepted", () => {
    const v2 = fn("respond_agency_candidate_offer_v2");
    expect(v2).toMatch(/select p\.lead_company_id into v_term_from/);
    expect(v2).toMatch(/where t\.company_id = v_term_from and t\.retired_at is null/);
    expect(v2).toMatch(/raise exception 'partnership_not_active'/);
    // The decision and the booking are still v1's.
    expect(v2).toMatch(/public\.respond_agency_candidate_offer_v1\(p_offer_id, p_decision, p_note\)/);
  });

  it("ending the partnership or taking a need back withdraws open offers, never accepted ones", () => {
    for (const name of ["end_agency_partnership_v1", "unshare_request_with_partner_v1"]) {
      expect(fn(name), name).toMatch(/set status = 'withdrawn'[\s\S]*status = 'offered'/);
      expect(fn(name), name).not.toMatch(/status = 'accepted'/);
    }
  });

  it("a commission is due only on a placement and is split by the fixed share", () => {
    const c = fn("list_agency_commissions_v1");
    expect(c).toMatch(/case when g\.started_at is not null then round\(r\.fee_amount \* r\.share \/ 100, 2\) end/);
    expect(c).toMatch(/'lead', b\.offering, 100 - b\.pct/);
    expect(c).toMatch(/'partner', b\.lead, b\.pct/);
    expect(c).toMatch(/where public\.owns_company\(r\.me\)/);
    expect(c).not.toMatch(/\b(insert|update|delete)\b/i);
  });

  it("the partner never reads the client's identity; the lead never reads the worker's", () => {
    const shape = (name: string) => /returns table \(([\s\S]*?)\)\s*language/.exec(fn(name))?.[1] ?? "";
    expect(shape("list_partner_shared_requests_v1")).not.toMatch(/client/);
    expect(shape("list_partner_offers_for_lead_v1")).not.toMatch(/worker/);
  });

  it("no money moves: no billing, invoice or payment object is touched", () => {
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/\b(invoice|payment|billing|charge)s?\b/i);
  });

  it("the rollback refuses while any partnership, pass or partner offer exists, and restores v2", () => {
    const down = read(DOWN);
    expect(down).toMatch(/ROLLBACK REFUSED/);
    expect(down).toMatch(/where partner_share_id is not null/);
    expect(down).toMatch(/create or replace function public\.respond_agency_candidate_offer_v2/);
    expect(down).not.toMatch(/partner_share_id is not null then|v_term_from/);
    expect(down.split("\n")[0]).not.toMatch(/@human-gate-approved/);
  });
});

describe("agency partnerships — the app holds no rule and no service role", () => {
  const actions = read("apps/web/lib/agency/partnerships-actions.ts");
  const reads = read("apps/web/lib/agency/partnerships.ts");

  it("each action is one database function under the caller's session", () => {
    for (const rpc of [
      "invite_agency_partner_v1",
      "accept_agency_partnership_v1",
      "decline_agency_partnership_v1",
      "end_agency_partnership_v1",
      "share_request_with_partner_v1",
      "unshare_request_with_partner_v1",
      "submit_partner_candidate_offer_v1",
    ]) {
      expect(actions).toContain(`"${rpc}"`);
    }
    for (const src of [actions, reads]) {
      expect(src).not.toMatch(/supabase\/admin|createAdminClient|SERVICE_ROLE|serviceRole/);
      expect(src).toContain('from "@/lib/supabase/server"');
    }
  });

  it("the employer's fee line follows the client's connection, so a partner's candidate shows the lead's term", () => {
    const terms = read("apps/web/lib/agency/placement-terms.ts");
    expect(terms).toContain("connection:agency_client_connections(agency_company_id)");
    const page = read("apps/web/app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/agency: termAgencyByOffer\.get\(oc\.offerId\) \?\? oc\.agencyName/);
  });

  it("the section lives on the agency's partners page only", () => {
    const page = read("apps/web/app/[locale]/dashboard/company/partners/page.tsx");
    expect(page).toContain("<AgencyPartnershipsSection");
    expect(page).toContain("readAgencyCooperation()");
  });
});

describe("agency partnerships — copy in every catalog", () => {
  const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv", "da", "et", "lv", "no"];
  const keys = (o: Record<string, unknown>, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === "object" ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
    );
  const ns = (loc: string) =>
    JSON.parse(read(`apps/web/messages/${loc}.json`)).agencyPartnerships as Record<string, unknown>;
  const en = keys(ns("en")).sort();

  it("all 11 catalogs carry exactly the English keys, with real text", () => {
    for (const loc of LOCALES) {
      expect(keys(ns(loc)).sort(), loc).toEqual(en);
      expect(JSON.stringify(ns(loc)), loc).not.toMatch(/\[EN\]/);
    }
  });

  it("every database refusal has its line", () => {
    const errors = Object.keys((ns("en").errors ?? {}) as Record<string, string>);
    const model = read("apps/web/lib/agency/partnerships-model.ts");
    const codes = /PARTNERSHIP_ERROR_CODES = \[([\s\S]*?)\] as const/.exec(model)?.[1].match(/"(\w+)"/g) ?? [];
    expect(errors.sort()).toEqual(codes.map((c) => c.replaceAll('"', "")).sort());
  });

  it("the invitation is 'created', never 'sent': no e-mail is wired", () => {
    expect((ns("en").invite as Record<string, string>).sent).toMatch(/^Invitation created\./);
  });
});
