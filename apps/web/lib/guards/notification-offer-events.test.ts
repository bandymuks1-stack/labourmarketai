import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

/**
 * A fake service client. The notification store keeps a UNIQUE
 * (recipient, dedupe_key), so a second insert of the same key is the Postgres
 * unique violation; every other read returns nothing. It records which tables
 * the emitter touched, so the tests can prove it reads no offer or demand
 * table with service privileges.
 */
const store: Record<string, unknown>[] = [];
const touched: string[] = [];
function fakeQuery(table: string) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ["select", "eq", "in", "is", "order", "limit", "gte", "lte"]) q[m] = chain;
  q.maybeSingle = async () => ({ data: null, error: null });
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  q.insert = async (row: Record<string, unknown>) => {
    if (table === "notification_events") {
      const dup = store.some(
        (r) => r.recipient_profile_id === row.recipient_profile_id && r.dedupe_key === row.dedupe_key,
      );
      if (dup) return { error: { code: "23505", message: "duplicate key" } };
      store.push(row);
    }
    return { error: null };
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      touched.push(table);
      return fakeQuery(table);
    },
  }),
}));
const emailInputs: unknown[] = [];
vi.mock("@/lib/notifications/email-dispatch", () => ({
  maybeDispatchNotificationEmail: async (_admin: unknown, input: unknown) => {
    emailInputs.push(input);
    return { kind: "channel_disabled" };
  },
}));
vi.mock("@/lib/notifications/web-push-dispatch", () => ({
  maybeDispatchWebPush: async () => ({ kind: "skipped" }),
}));

import {
  NOTIFICATION_ENTITY_HREF,
  NOTIFICATION_EVENT_TYPES,
  notificationRenderedType,
} from "@/lib/notifications/events";
import {
  emitOfferAnsweredNotification,
  emitOfferReceivedNotification,
} from "@/lib/notifications/event-emitters";
import { durableNotificationRole } from "@/lib/notifications/spine-signals";

/**
 * v12 (B2B offers): a team (brigade) offering itself to a company need, an
 * agency proposing a candidate, and the company's answer to either reached
 * nobody. The demand owner found offers only by opening scouting; the supplier
 * never learned the answer (Swedish employer audit 2026-11-11, N-1/N-2).
 * These tests are the owner's three conditions:
 *   (a) RECIPIENT SCOPE: exactly the one person the offer is addressed to or
 *       came from, resolved from the offer's own rows under the caller's
 *       session; never an organization-wide fan-out, never request input;
 *   (b) NO DUPLICATES: one row per (offer, event);
 *   (c) NO PRIVATE DATA: ids and a link only; no name, contact or CV field.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");
const FILE = "20261111230000_offer_notification_types_v1";
const ALL_LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];
const EVENTS = ["team_offer_received", "team_offer_answered", "candidate_offer_received", "candidate_offer_answered"];
const ENTITIES = ["team_demand_offer", "team_demand_offer_response", "agency_candidate_offer", "agency_candidate_offer_response"];
const OWNER = "11111111-1111-4111-8111-111111111111";
const AGENT = "22222222-2222-4222-8222-222222222222";
const OFFER = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  store.length = 0;
  touched.length = 0;
  emailInputs.length = 0;
});

describe("(a) recipient scope", () => {
  it("(a1) the received event goes to the one resolved recipient and nobody else", async () => {
    const r = await emitOfferReceivedNotification({
      kind: "candidate", offerId: OFFER, recipientProfileId: OWNER, actorProfileId: AGENT,
    });
    expect(r).toMatchObject({ delivered: true, outcome: "written", recipients: 1 });
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({ recipient_profile_id: OWNER, event_type: "candidate_offer_received", entity_id: OFFER });
  });

  it("(a2) the answer goes back only to the person who offered", async () => {
    await emitOfferAnsweredNotification({
      kind: "team", offerId: OFFER, recipientProfileId: AGENT, actorProfileId: OWNER, decision: "declined",
    });
    expect(store.map((r) => r.recipient_profile_id)).toEqual([AGENT]);
  });

  it("(a3) an unresolved recipient sends nothing and never widens to an organization", async () => {
    const r = await emitOfferReceivedNotification({
      kind: "team", offerId: OFFER, recipientProfileId: null, actorProfileId: AGENT,
    });
    expect(r).toEqual({ delivered: false, reason: "recipient_unresolved" });
    expect(store).toHaveLength(0);
  });

  it("(a4) acting on your own offer tells nobody", async () => {
    const r = await emitOfferAnsweredNotification({
      kind: "candidate", offerId: OFFER, recipientProfileId: OWNER, actorProfileId: OWNER, decision: "accepted",
    });
    expect(r).toEqual({ delivered: false, reason: "self_action" });
    expect(store).toHaveLength(0);
  });

  it("(a5) the emitter reads no offer, demand, membership or profile table with service privileges", async () => {
    await emitOfferReceivedNotification({ kind: "team", offerId: OFFER, recipientProfileId: OWNER, actorProfileId: AGENT });
    await emitOfferAnsweredNotification({
      kind: "candidate", offerId: OFFER, recipientProfileId: AGENT, actorProfileId: OWNER, decision: "accepted",
    });
    for (const t of ["customer_requests", "team_demand_offers", "agency_candidate_offers", "organization_memberships", "profiles"]) {
      expect(touched, t).not.toContain(t);
    }
  });

  it("(a6) the write paths resolve the recipient from the offer's own rows, never from input", () => {
    const team = read("lib", "company", "team-offer.ts");
    // Both team directions: the gated counterpart RPC, keyed on the OFFER id.
    expect(team).toContain('rpc("team_offer_counterpart_v1", { p_offer_id: offerId })');
    expect(team).toContain("recipientProfileId: await teamOfferCounterpart(ctx.supabase, parsed.offerId),");
    expect(team).toContain("recipientProfileId: await teamOfferCounterpart(ctx.supabase, input.offerId),");
    expect(team).not.toMatch(/recipientProfileId: input\./);

    const bridge = read("lib", "agency", "bridge-actions.ts");
    // Candidate received: the offer row, its request, that request's owner.
    const submit = bridge.slice(bridge.indexOf("export async function submitOfferAction"));
    expect(submit).toContain('.from("agency_candidate_offers").select("request_id").eq("id", offerId)');
    expect(submit).toContain('.from("customer_requests").select("profile_id").eq("id", requestId)');
    // Candidate answered: the offer's own `created_by`.
    const respond = bridge.slice(bridge.indexOf("export async function respondCandidateOfferAction"));
    expect(respond).toContain('.from("agency_candidate_offers").select("created_by").eq("id", offerId)');
    expect(bridge).not.toMatch(/createAdminClient/);
  });
});

describe("(b) no duplicates", () => {
  it("(b1) a retried write of the same offer and event is a no-op", async () => {
    const facts = { kind: "candidate" as const, offerId: OFFER, recipientProfileId: OWNER, actorProfileId: AGENT };
    const first = await emitOfferReceivedNotification(facts);
    const second = await emitOfferReceivedNotification(facts);
    expect(first).toMatchObject({ outcome: "written" });
    expect(second).toMatchObject({ delivered: true, outcome: "duplicate" });
    expect(store).toHaveLength(1);
    expect(store[0].dedupe_key).toBe(`candidate_offer_received:${OFFER}`);
  });

  it("(b2) received and answered for one offer are two facts, each once", async () => {
    await emitOfferReceivedNotification({ kind: "team", offerId: OFFER, recipientProfileId: OWNER, actorProfileId: AGENT });
    for (let i = 0; i < 2; i++) {
      await emitOfferAnsweredNotification({
        kind: "team", offerId: OFFER, recipientProfileId: AGENT, actorProfileId: OWNER, decision: "accepted",
      });
    }
    expect(store.map((r) => r.dedupe_key)).toEqual([`team_offer_received:${OFFER}`, `team_offer_answered:${OFFER}`]);
  });

  it("(b3) a team offer announces only a NEW offer, and the answer only a real decision", () => {
    const team = read("lib", "company", "team-offer.ts");
    const offer = team.slice(team.indexOf("export async function offerTeamToDemand"), team.indexOf("export async function withdrawTeamOffer"));
    expect(offer.indexOf('if (parsed.outcome === "created")')).toBeGreaterThan(-1);
    expect(offer.indexOf('if (parsed.outcome === "created")')).toBeLessThan(offer.indexOf("await emitOfferReceivedNotification("));
    const respond = team.slice(team.indexOf("export async function respondToTeamOffer"));
    expect(respond.indexOf('if (data === "accepted" || data === "declined")')).toBeGreaterThan(-1);
    expect(respond.indexOf('if (data === "accepted" || data === "declined")')).toBeLessThan(
      respond.indexOf("await emitOfferAnsweredNotification("),
    );
  });
});

describe("(c) no private data", () => {
  it("(c1) the stored row holds ids, the type and at most the decision", async () => {
    await emitOfferReceivedNotification({ kind: "candidate", offerId: OFFER, recipientProfileId: OWNER, actorProfileId: AGENT });
    await emitOfferAnsweredNotification({
      kind: "candidate", offerId: OFFER, recipientProfileId: AGENT, actorProfileId: OWNER, decision: "declined",
    });
    expect(Object.keys(store[0]).sort()).toEqual(
      ["dedupe_key", "entity_id", "entity_type", "event_type", "metadata", "recipient_profile_id"],
    );
    expect(store[0].metadata).toEqual({});
    expect(store[1].metadata).toEqual({ decision: "declined" });
  });

  it("(c2) the e-mail dispatcher receives the same ids-only input, nothing more", async () => {
    await emitOfferAnsweredNotification({
      kind: "team", offerId: OFFER, recipientProfileId: AGENT, actorProfileId: OWNER, decision: "accepted",
    });
    expect(emailInputs).toEqual([
      {
        recipientProfileId: AGENT,
        eventType: "team_offer_answered",
        entityType: "team_demand_offer_response",
        entityId: OFFER,
        metadata: { decision: "accepted" },
      },
    ]);
  });

  it("(c3) the received emitter passes no metadata, the answer only the decision", () => {
    const src = read("lib", "notifications", "event-emitters.ts");
    const block = src.slice(src.indexOf("export type OfferNotificationKind"));
    expect(block).toContain("return deliverOfferEvent(eventType, entityType, facts);");
    expect(block).toContain("return deliverOfferEvent(eventType, entityType, facts, { decision: facts.decision });");
  });
});

describe("rides the existing store, with no grant", () => {
  it("four event types and four entity types, a strict CHECK superset, no privilege change", () => {
    for (const e of EVENTS) expect(NOTIFICATION_EVENT_TYPES).toContain(e);
    const mig = readFileSync(join(REPO, "supabase", "migrations", `${FILE}.sql`), "utf8");
    for (const v of [...EVENTS, ...ENTITIES, "history_link_offered", "organization_person", "booking_proposed"]) {
      expect(mig).toContain(`'${v}'`);
    }
    const sql = mig.replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/\bgrant\b|\brevoke\b|create table|policy|security definer/i);
    const downPath = join(REPO, "supabase", "rollbacks", `${FILE}.down.sql`);
    expect(existsSync(downPath)).toBe(true);
    expect(readFileSync(downPath, "utf8")).toMatch(/rollback refused/);
  });

  it("each offer opens the page where it is answered or tracked", () => {
    expect(NOTIFICATION_ENTITY_HREF.team_demand_offer).toBe("/dashboard/company/scouting");
    expect(NOTIFICATION_ENTITY_HREF.agency_candidate_offer).toBe("/dashboard/company/scouting");
    expect(NOTIFICATION_ENTITY_HREF.team_demand_offer_response).toBe("/dashboard/company/people");
    expect(NOTIFICATION_ENTITY_HREF.agency_candidate_offer_response).toBe("/dashboard/company/partners");
  });

  it("the answer is named, and every locale says it", () => {
    expect(notificationRenderedType("team_offer_answered", { decision: "accepted" })).toBe("event_team_offer_answered_accepted");
    expect(notificationRenderedType("candidate_offer_answered", { decision: "declined" })).toBe("event_candidate_offer_answered_declined");
    expect(notificationRenderedType("team_offer_answered", { decision: "approved" })).toBe("event_team_offer_answered");
    for (const l of ALL_LOCALES) {
      const types = JSON.parse(read("messages", `${l}.json`)).auth.notifications.types;
      for (const e of EVENTS) expect(types[`event_${e}`], `${l} event_${e}`).toBeTruthy();
      for (const e of ["team_offer_answered", "candidate_offer_answered"]) {
        for (const d of ["accepted", "declined"]) expect(types[`event_${e}_${d}`], `${l} ${e}_${d}`).toBeTruthy();
      }
    }
  });

  it("an employer reading an offer as a worker is pointed at the company side", () => {
    expect(durableNotificationRole("event_team_offer_received", "worker")).toBe("company");
    expect(durableNotificationRole("event_candidate_offer_answered_accepted", "agency")).toBe("agency");
  });
});
