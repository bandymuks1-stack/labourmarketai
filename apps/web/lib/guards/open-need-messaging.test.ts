import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { localizePseudonymousName } from "@/lib/communication/pseudonymous-name";
import { resolveSourceRoute } from "@/lib/communication/conversation-source-model";

/**
 * Owner decision A (2026-11-22, decision 0033) — messaging about an open need.
 * A provider writes to the client about an open need WITHOUT the client being
 * named; the client answers in the same thread and alone decides to show its
 * name. Pins the migration (RED, NOT applied), the provider's one door, the
 * client's one control, and the copy in every full-UI locale.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const repo = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
const strip = (sql: string): string => sql.replace(/--[^\n]*/g, "");

/** Doctrine §2.4: the eleven full-UI locales. */
const FULL_UI = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"] as const;

const N = "20261122160000_open_need_messaging_v1";
const UP = strip(repo(`supabase/migrations/${N}.sql`)).toLowerCase();
const DOWN = strip(repo(`supabase/rollbacks/${N}.down.sql`)).toLowerCase();
const ACTION = read("lib/company/open-need-conversation.ts");
const THREAD = read("app/[locale]/dashboard/communication/[conversationId]/page.tsx");
const BOARD = read("components/app/team-demand-offer-form.tsx");

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const end = sql.indexOf("$$;", sql.indexOf("as $$", start) + 5);
  return sql.slice(start, end);
}

describe("migration — one channel, the client hidden until it discloses", () => {
  it("widens the closed source set by exactly 'open_need'", () => {
    expect(UP).toMatch(
      /check \(source_type in\s*\('scouting','accepted_service_request','demand_interest','accepted_booking','open_need'\)\)/,
    );
  });

  it("the provider door calls the board's gate rather than copying it, and returns no name", () => {
    const door = fnBody(UP, "open_need_message_party_v1");
    expect(door).toMatch(/from public\.list_open_demand_for_team_offer_v1\(p_org_id\)/);
    expect(door).toMatch(/returns table \(owner_profile_id uuid, subject text\)/);
    expect(door).not.toMatch(/full_name|display_name|legal_name|email|phone/);
  });

  it("only the need's owner, as a participant, may disclose — and nobody writes the table directly", () => {
    const d = fnBody(UP, "disclose_open_need_identity_v1");
    expect(d).toMatch(/c\.source_type = 'open_need'/);
    expect(d).toMatch(/cr\.profile_id = uid/);
    expect(d).toMatch(/cp\.profile_id = uid and cp\.revoked_at is null/);
    expect(UP).toMatch(/revoke all on table public\.open_need_identity_disclosures from public, anon, authenticated/);
    expect(UP).toMatch(/grant select on table public\.open_need_identity_disclosures to authenticated/);
    expect(UP).not.toMatch(/create policy [a-z_]+ on public\.open_need_identity_disclosures\s+for (insert|update|delete|all)/);
  });

  it("the name function hides only the need's owner in an open-need thread, and only until disclosure", () => {
    const f = UP.slice(UP.indexOf("create or replace function public.conversation_counterpart_identities"));
    expect(f).toMatch(
      /when c\.source_type = 'open_need'\s+and exists \(select 1 from public\.customer_requests cr\s+where cr\.id = c\.source_id and cr\.profile_id = cp\.profile_id\)\s+and not exists \(select 1 from public\.open_need_identity_disclosures d/,
    );
    expect(f).toMatch(/then 'client ' \|\| upper\(left\(regexp_replace\(c\.source_id::text/);
  });

  it("the board stops naming the client and keeps its signature", () => {
    const b = UP.slice(UP.indexOf("create or replace function public.list_open_demand_for_team_offer_v1"));
    expect(b).toMatch(/company_name text/);
    expect(b).toMatch(/null::text,/);
    expect(b).not.toMatch(/coalesce\(nullif\(trim\(c\.display_name\)/);
  });

  it("is RED: no approval marker; the rollback refuses while a hidden client could be revealed", () => {
    expect(repo(`supabase/migrations/${N}.sql`)).not.toMatch(/@human-gate-approved/);
    expect(DOWN).toMatch(/if exists \(select 1 from public\.conversations where source_type = 'open_need'\) then\s+raise exception/);
    expect(DOWN).toMatch(/drop function if exists public\.open_need_message_party_v1\(uuid, uuid\)/);
    expect(DOWN).toMatch(/drop function if exists public\.disclose_open_need_identity_v1\(uuid\)/);
  });
});

describe("the provider's door and the client's control", () => {
  it("the action asks the database gate first and stamps 'open_need' only after it answered", () => {
    const gate = ACTION.indexOf('rpc("open_need_message_party_v1"');
    const refuse = ACTION.indexOf("if (!owner || owner === user.id) return null");
    const stamp = ACTION.indexOf('{ type: "open_need", id: requestId }');
    expect(gate).toBeGreaterThan(-1);
    expect(refuse).toBeGreaterThan(gate);
    expect(stamp).toBeGreaterThan(refuse);
    expect(ACTION).toMatch(/"allowed_open_need"/);
    expect(ACTION).not.toMatch(/createAdminClient|service_role/);
  });

  it("the owner profile id never reaches the browser — only a route", () => {
    expect(ACTION).toMatch(/return result\.ok \? `\/\$\{locale\}\/dashboard\/communication\/\$\{result\.data\.id\}` : null/);
  });

  it("the client's control renders only for the need's owner (the one participant the context routes)", () => {
    expect(THREAD).toMatch(/openNeedSource\?\.sourceType === "open_need" && openNeedSource\.href !== null/);
    expect(THREAD).toMatch(/discloseOpenNeedIdentityAction/);
    expect(THREAD).toMatch(/data-testid="open-need-disclose"/);
  });

  it("the board writes about the selected need and no longer prints the client", () => {
    expect(BOARD).toMatch(/action=\{openNeedConversationAction\}/);
    expect(BOARD).toMatch(/d\.companyName\]\.filter\(Boolean\)/);
  });

  it("the client pseudonym is localized, real names pass through", () => {
    const client = (t: string) => `Klientas ${t}`;
    expect(localizePseudonymousName("Client 0E0E00", (t) => `Kandidatas ${t}`, client)).toBe("Klientas 0E0E00");
    expect(localizePseudonymousName("Candidate ABC123", (t) => `Kandidatas ${t}`, client)).toBe("Kandidatas ABC123");
    expect(localizePseudonymousName("Clara Client", (t) => t, client)).toBe("Clara Client");
    expect(resolveSourceRoute("company_needs")).toBe("/dashboard/company/needs");
  });
});

describe("copy in every full-UI locale", () => {
  it.each(FULL_UI)("%s carries the five strings, translated", (locale) => {
    const m = JSON.parse(read(`messages/${locale}.json`)) as {
      communication: { openNeed: Record<string, string>; source: Record<string, string> };
      teamDemandOffer: Record<string, string>;
    };
    const values = [
      m.teamDemandOffer.writeAboutNeed,
      m.communication.openNeed.clientName,
      m.communication.openNeed.hidden,
      m.communication.openNeed.disclose,
      m.communication.openNeed.shown,
      m.communication.source.open_need,
    ];
    for (const v of values) {
      expect(v, `${locale}: present`).toBeTruthy();
      expect(v, `${locale}: no [EN] placeholder`).not.toMatch(/\[EN\]/);
    }
    expect(m.communication.openNeed.clientName).toContain("{token}");
    if (locale !== "en") expect(m.communication.openNeed.disclose).not.toBe("Show my name");
  });
});
