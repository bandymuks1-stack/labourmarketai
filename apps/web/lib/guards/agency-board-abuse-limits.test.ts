/**
 * GUARD — owner decision 2026-11-22 (item 1): the agency board stays open to
 * every registered agency and offers need no prior approval, but bulk reading,
 * offer floods and fake offers are limited: burst per account AND per IP on
 * the board read and the offer actions, plus caps per need and per day counted
 * from real offer rows. Verification is never a condition.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { AGENCY_BOARD_LIMITS, decideAgencyOffer } from "@/lib/agency/board-abuse-limits";

const WEB = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(WEB, p), "utf8");

describe("agency offer caps", () => {
  it("allows an offer under every cap, refuses over any, and refuses unread counts", () => {
    expect(decideAgencyOffer({ burstLimited: false, openOnNeed: 0, last24h: 0 })).toEqual({ allowed: true });
    expect(decideAgencyOffer({ burstLimited: true, openOnNeed: 0, last24h: 0 })).toMatchObject({ reason: "burst" });
    expect(decideAgencyOffer({ burstLimited: false, openOnNeed: AGENCY_BOARD_LIMITS.openOffersPerNeed, last24h: 0 })).toMatchObject({ reason: "need_cap" });
    expect(decideAgencyOffer({ burstLimited: false, openOnNeed: 0, last24h: AGENCY_BOARD_LIMITS.offersPerDay })).toMatchObject({ reason: "daily_cap" });
    expect(decideAgencyOffer({ burstLimited: false, openOnNeed: null, last24h: 0 })).toMatchObject({ reason: "counts_unavailable" });
    expect(decideAgencyOffer({ burstLimited: false, openOnNeed: 0, last24h: null })).toMatchObject({ reason: "counts_unavailable" });
  });

  it("keeps sensible numbers", () => {
    expect(AGENCY_BOARD_LIMITS.openOffersPerNeed).toBeLessThanOrEqual(20);
    expect(AGENCY_BOARD_LIMITS.offersPerDay).toBeLessThanOrEqual(100);
    expect(AGENCY_BOARD_LIMITS.offerPerAccount.limit).toBeLessThan(AGENCY_BOARD_LIMITS.offerPerIp.limit);
    expect(AGENCY_BOARD_LIMITS.readPerAccount.limit).toBeLessThan(AGENCY_BOARD_LIMITS.readPerIp.limit);
  });
});

describe("every board and offer path passes the limits", () => {
  it("the burst guard counts the account and the IP", () => {
    const g = read("lib/agency/board-abuse-guard.ts");
    expect(g).toContain("clientKeyFromHeaders(await headers())");
    expect(g).toContain("name: `agency-board-${kind}-account`, key: userId");
    expect(g).toContain("name: `agency-board-${kind}-ip`, key: ip");
  });

  it("the candidate offer (web, chat and MCP all run this action) checks burst and real-row caps before the RPC", () => {
    const a = read("lib/agency/bridge-actions.ts");
    const body = a.slice(a.indexOf("export async function submitOfferAction"), a.indexOf("export async function respondCandidateOfferAction"));
    expect(body).toContain('agencyBoardBurstLimited("offer", user.id)');
    expect(body).toContain('.eq("request_share_id", shareId)');
    expect(body).toContain('.eq("created_by", user.id)');
    expect(body.indexOf("decideAgencyOffer(")).toBeLessThan(body.indexOf('"submit_agency_candidate_offer_v1"'));
    expect(body).toContain('if (!cap.allowed) return { status: "rate-limited" };');
    expect(body).not.toMatch(/verif/i);
    expect(read("lib/conversation/company-executors.ts")).toContain('r.status === "rate-limited"\n        ? "rate_limited"');
  });

  it("the board read and the can-offer mark are limited too", () => {
    const p = read("lib/agency/pool.ts");
    const pool = p.slice(p.indexOf("export async function getAgencyPool"));
    expect(pool.indexOf('agencyBoardBurstLimited("read", user.id)')).toBeLessThan(pool.indexOf('"list_open_demand_for_agencies"'));
    const mark = p.slice(p.indexOf("export async function markAgencyCanOffer"));
    expect(mark.indexOf('agencyBoardBurstLimited("offer", user.id)')).toBeLessThan(mark.indexOf('"mark_agency_can_offer"'));
  });

  it("a refused offer says so in every locale that carries the agency section", () => {
    expect(read("components/app/agency-bridge-section.tsx")).toContain("labels.offerLimitLabel");
    for (const l of ["en", "lt", "ru", "nl", "de", "pl", "sv"]) {
      const ab = JSON.parse(read(`messages/${l}.json`)).agencyBridge;
      expect(typeof ab.offerLimitLabel, l).toBe("string");
    }
  });
});
