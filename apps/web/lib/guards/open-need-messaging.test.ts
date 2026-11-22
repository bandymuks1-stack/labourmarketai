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

  it("the provider door calls the board's gate, opens the thread in the database and returns only its id", () => {
    const door = fnBody(UP, "open_need_conversation_open_v1");
    expect(door).toMatch(/from public\.list_open_demand_for_team_offer_v1\(p_org_id\)/);
    expect(door).toMatch(/returns uuid/);
    expect(door).toMatch(/c\.source_type = 'open_need' and c\.source_id = p_request_id/);
    expect(door).toMatch(/>= 20 then\s+raise exception 'rate limited'/);
    expect(door).toMatch(/return v_id;/);
    expect(door).not.toMatch(/return v_owner|return query/);
    expect(UP).not.toMatch(/open_need_message_party_v1/);
  });

  it("the policies ask about the CALLER only — no function takes a candidate profile id", () => {
    const blinded = fnBody(UP, "open_need_viewer_blinded_v1");
    expect(blinded).toMatch(/open_need_viewer_blinded_v1\(p_conversation_id uuid\)/);
    expect(blinded).toMatch(/me\.profile_id = auth\.uid\(\)/);
    expect(UP).toMatch(
      /create policy conversation_participants_select[\s\S]*?and not public\.open_need_viewer_blinded_v1\(conversation_id\)\)/,
    );
    expect(UP).toMatch(
      /create policy conversation_messages_select[\s\S]*?author_id = auth\.uid\(\) or not public\.open_need_viewer_blinded_v1\(conversation_id\)/,
    );
  });

  it("the messages view masks the other side's author for a blinded caller and keeps the participant gate", () => {
    const v = UP.slice(UP.indexOf("create or replace view public.conversation_messages_visible_v1"));
    expect(v).toMatch(/with \(security_barrier = true\)/);
    expect(v).toMatch(/then md5\('open_need_counterpart:' \|\| m\.conversation_id::text\)::uuid/);
    expect(v).toMatch(/where public\.is_conversation_participant\(m\.conversation_id\)\s+or public\.is_admin\(\)/);
    expect(UP).toMatch(/grant select on public\.conversation_messages_visible_v1 to authenticated/);
  });

  it("an undisclosed client cannot attach a file (its id would be in the path)", () => {
    expect(UP).toMatch(/and not public\.open_need_caller_hidden_v1\(public\.conversation_id_of_path_v1\(name\)\)/);
    expect(UP).toMatch(/before insert on public\.conversation_message_attachments/);
  });

  it("the recipients of a blinded sender's message are read by the server only", () => {
    expect(UP).toMatch(/revoke all on function public\.conversation_live_recipients_v1\(uuid, uuid\) from public, anon, authenticated/);
    expect(UP).toMatch(/grant execute on function public\.conversation_live_recipients_v1\(uuid, uuid\) to service_role/);
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
    expect(DOWN).toMatch(/drop function if exists public\.open_need_conversation_open_v1\(uuid, uuid\)/);
    expect(DOWN).toMatch(/drop view if exists public\.conversation_messages_visible_v1/);
    expect(DOWN).toMatch(/drop function if exists public\.disclose_open_need_identity_v1\(uuid\)/);
  });
});

describe("the provider's door and the client's control", () => {
  it("the action makes ONE database call and handles only a thread id", () => {
    expect(ACTION).toMatch(/rpc\("open_need_conversation_open_v1"/);
    expect(ACTION).not.toMatch(/getOrCreateDirectConversation|owner_profile_id|createAdminClient|service_role/);
    expect(ACTION).toMatch(/return `\/\$\{locale\}\/dashboard\/communication\/\$\{conversationId\}`/);
  });

  it("every read of a thread's messages for display goes through the masking view", () => {
    for (const rel of [
      "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
      "lib/communication/inbox-preview.ts",
      "lib/communication/unread.ts",
      "lib/capabilities/messaging-capabilities.ts",
    ]) {
      expect(read(rel), rel).toMatch(/from\("conversation_messages_visible_v1"\)/);
    }
  });

  it("a blinded sender's notification recipients come from the server-only read", () => {
    const core = read("lib/communication/communication-core.ts");
    expect(core).toMatch(/rpc\("open_need_viewer_blinded_v1"/);
    expect(core).toMatch(/createAdminClient\(\)\)\.rpc\("conversation_live_recipients_v1"/);
  });

  it("the composer offers no attachment to the unnamed client", () => {
    expect(THREAD).toMatch(/attachmentsAllowed=\{!\(isOpenNeedClient && openNeedDisclosed === false\)\}/);
    expect(read("components/app/communication-composer.tsx")).toMatch(/\{attachmentsAllowed \? \(<>/);
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
