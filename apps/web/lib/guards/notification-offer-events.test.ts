import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));
const adminCalled = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    adminCalled();
    throw new Error("admin client must not be reached for a self-answer");
  },
}));

import {
  NOTIFICATION_ENTITY_HREF,
  NOTIFICATION_EVENT_TYPES,
  notificationRenderedType,
} from "@/lib/notifications/events";
import { emitOfferAnsweredNotification } from "@/lib/notifications/event-emitters";
import { durableNotificationRole } from "@/lib/notifications/spine-signals";

/**
 * v12 (B2B offers): a team (brigade) offering itself to a company need, an
 * agency proposing a candidate, and the company's answer to either reached
 * nobody. The demand owner found offers only by opening scouting; the
 * supplier never learned the answer (Swedish employer audit 2026-11-11,
 * N-1/N-2). The four events ride the existing store; these assertions fail
 * if an offer write stops telling the other side.
 */
const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8").replace(/\r\n/g, "\n");
const FILE = "20261111230000_offer_notification_types_v1";
const ALL_LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"];
const EVENTS = [
  "team_offer_received",
  "team_offer_answered",
  "candidate_offer_received",
  "candidate_offer_answered",
] as const;
const ENTITIES = [
  "team_demand_offer",
  "team_demand_offer_response",
  "agency_candidate_offer",
  "agency_candidate_offer_response",
] as const;

describe("rides the existing notification store", () => {
  it("four event types and four entity types, a strict CHECK superset with a refusing rollback", () => {
    for (const e of EVENTS) expect(NOTIFICATION_EVENT_TYPES).toContain(e);
    const mig = readFileSync(join(REPO, "supabase", "migrations", `${FILE}.sql`), "utf8");
    // Every value the v11 lists held is still listed.
    for (const v of [...EVENTS, ...ENTITIES, "history_link_offered", "organization_person", "booking_proposed"]) {
      expect(mig).toContain(`'${v}'`);
    }
    const sql = mig.replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/create table|revoke |policy|to (anon|authenticated|public)\b/i);
    // The only grants are the two column-scoped recipient reads.
    const grants = mig.match(/^grant .*$/gim) ?? [];
    expect(grants).toEqual([
      "grant select (id, profile_id) on public.customer_requests to service_role;",
      "grant select (id, request_id, offered_by) on public.team_demand_offers to service_role;",
    ]);
    const downPath = join(REPO, "supabase", "rollbacks", `${FILE}.down.sql`);
    expect(existsSync(downPath)).toBe(true);
    const down = readFileSync(downPath, "utf8");
    expect(down).toMatch(/rollback refused/);
    expect(down).toMatch(/revoke select \(id, profile_id\) on public\.customer_requests from service_role/);
  });

  it("each offer opens the page where it is answered or tracked", () => {
    expect(NOTIFICATION_ENTITY_HREF.team_demand_offer).toBe("/dashboard/company/scouting");
    expect(NOTIFICATION_ENTITY_HREF.agency_candidate_offer).toBe("/dashboard/company/scouting");
    expect(NOTIFICATION_ENTITY_HREF.team_demand_offer_response).toBe("/dashboard/company/people");
    expect(NOTIFICATION_ENTITY_HREF.agency_candidate_offer_response).toBe("/dashboard/company/partners");
  });

  it("the answer is named, and every locale says it", () => {
    expect(notificationRenderedType("team_offer_answered", { decision: "accepted" })).toBe(
      "event_team_offer_answered_accepted",
    );
    expect(notificationRenderedType("candidate_offer_answered", { decision: "declined" })).toBe(
      "event_candidate_offer_answered_declined",
    );
    expect(notificationRenderedType("team_offer_answered", { decision: "approved" })).toBe(
      "event_team_offer_answered",
    );
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

describe("wired into every offer write, after it succeeded", () => {
  it("a NEW team offer tells the demand owner; the company's answer tells the team", () => {
    const src = read("lib", "company", "team-offer.ts");
    const offerRpc = src.indexOf('"offer_team_to_demand_v1"');
    const offerErr = src.indexOf("if (error) return { status: offerRefusalOf(error) };", offerRpc);
    const received = src.indexOf("await emitOfferReceivedNotification(", offerRpc);
    expect(received).toBeGreaterThan(offerErr);
    expect(src.slice(offerErr, received)).toContain('parsed.outcome === "created"');

    const respondRpc = src.indexOf('"respond_team_demand_offer_v2"');
    const answered = src.indexOf("await emitOfferAnsweredNotification(", respondRpc);
    expect(answered).toBeGreaterThan(src.indexOf("if (error) return { status: offerRefusalOf(error) };", respondRpc));
    expect(src.slice(respondRpc, answered)).toContain('if (data === "accepted" || data === "declined")');
  });

  it("an agency candidate tells the demand owner; the answer tells the agency", () => {
    const src = read("lib", "agency", "bridge-actions.ts");
    const submit = src.indexOf('"submit_agency_candidate_offer_v1"');
    const submitErr = src.indexOf("if (error) return mapErr(error.code, error.message);", submit);
    expect(src.indexOf("await emitOfferReceivedNotification(", submit)).toBeGreaterThan(submitErr);

    const respond = src.indexOf('"respond_agency_candidate_offer_v1"');
    // `created_by` is read before the answer, under the client's own RLS.
    expect(src.lastIndexOf('.select("created_by")', respond)).toBeGreaterThan(src.indexOf("export async function respondCandidateOfferAction"));
    const respondErr = src.indexOf("if (error) {", respond);
    expect(src.indexOf("await emitOfferAnsweredNotification(", respond)).toBeGreaterThan(respondErr);
  });

  it("answering your own offer tells nobody, and never reaches the service client", async () => {
    const r = await emitOfferAnsweredNotification({
      kind: "candidate",
      offerId: "o",
      offeredByProfileId: "u1",
      actorProfileId: "u1",
      decision: "accepted",
    });
    expect(r).toEqual({ delivered: false, reason: "self_action" });
  });
});
