import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";
import { CONVERSATION_ACTIONS } from "./action-registry";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";

/**
 * Chat First does what the scouting page does for brigade / company offers
 * (owner P0 2026-10-11): the offers answer lists them, a confirmed canonical
 * action answers them, and "write" opens the same gated negotiation thread.
 */
const CHAT = readFileSync(join(__dirname, "..", "..", "components/app/conversation/chat/conversation-chat.tsx"), "utf8");

describe("brigade / company offers in the chat", () => {
  it.each([
    "kokios brigados pasiūlė save mano poreikiui?",
    "brigadų pasiūlymai",
    "which crews offered for my need?",
    "subcontractor offers",
    "какие бригады предложили себя?",
    "welke ploegen boden zich aan?",
    "Angebote von Subunternehmern",
    "jakie brygady zaoferowały się?",
  ])("%s → the offers answer", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("agency-offers");
  });

  it("the answer is a confirmed canonical action, never a direct write", () => {
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "company.respond-team-offer");
    expect(row?.confirmation).toBe("important_write");
    expect(row?.handler).toEqual({ kind: "server_action", ref: "respondToTeamOfferAction" });
    expect(COMPANY_ACTION_SCHEMAS["company.respond-team-offer"].safeParse({ offerId: "x", decision: "accepted" }).success).toBe(false);
    expect(CHAT).toContain('prepareConfirmationAction("company.respond-team-offer", input)');
    expect(CHAT).toContain('dispatchWorkerAction("company.respond-team-offer", input, {');
  });

  it("'write' opens the thread through the same server gate, never a raw id route", () => {
    expect(CHAT).toContain("openTeamOfferThreadForChat({ offerId, requestId: requestId ?? null, locale })");
    expect(CHAT).not.toMatch(/link:\/dashboard\/communication\/\$\{/);
  });
});
