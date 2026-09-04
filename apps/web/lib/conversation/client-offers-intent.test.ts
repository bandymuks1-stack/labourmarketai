import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONVERSATION_ACTIONS } from "./action-registry";
import { COMPANY_ACTION_SCHEMAS } from "./company-schemas";
import { INTENT_REGISTRY } from "./intent-registry";
import { classifyIntent } from "./intent-router";

/**
 * The CLIENT's side of the agency bridge, in the chat (owner contract
 * 2026-09-04 §15). The agency's chain by sentence was prod-proven
 * (#1466/#1473); the client could decide on an offer only with the scouting
 * page's buttons. "Kokius kandidatus pasiūlė agentūra?" now lists the open
 * offers on the company's OWN demands with accept / decline chips that run
 * the SAME canonical action, token-confirmed.
 */
describe("the client's agency offers, by sentence", () => {
  it.each([
    "Kokius kandidatus pasiūlė agentūra?",
    "agentūros pasiūlymai",
    "Which candidates did the agency offer?",
    "offered candidates",
    "Каких кандидатов предложило агентство?",
    "Welke kandidaten heeft het bureau aangeboden?",
    "Welche Kandidaten hat die Agentur vorgeschlagen?",
  ])("%s → agency-offers", (text) => {
    expect(classifyIntent(text).intent).toBe("agency-offers");
  });

  it("the agency's own sentences keep their intents", () => {
    expect(classifyIntent("pasiūlyk kandidatą").intent).toBe("propose-candidate");
    expect(classifyIntent("kaip sekasi mano pasiūlymams?").intent).toBe("proposal-status");
    expect(classifyIntent("parodyk klientų poreikius").intent).toBe("client-demand");
    expect(classifyIntent("parodyk kandidatus").intent).toBe("candidates");
  });

  it("is a read intent; the decision is a company write behind the important tier", () => {
    expect(INTENT_REGISTRY["agency-offers"]).toMatchObject({ domain: "company", access: "read", handler: "clientOffers" });
    const row = CONVERSATION_ACTIONS.find((a) => a.id === "company.respond-offer");
    expect(row).toMatchObject({ subject: "company", allowedRoles: ["company"], confirmation: "important_write", precondition: "has_company" });
    expect(row?.handler).toEqual({ kind: "server_action", ref: "respondCandidateOfferAction" });
    const schema = COMPANY_ACTION_SCHEMAS["company.respond-offer"];
    expect(schema.safeParse({ offerId: "11111111-1111-4111-8111-111111111111", decision: "accepted" }).success).toBe(true);
    expect(schema.safeParse({ offerId: "11111111-1111-4111-8111-111111111111", decision: "maybe" }).success).toBe(false);
    expect(schema.safeParse({ offerId: "not-a-uuid", decision: "declined" }).success).toBe(false);
  });

  it("the executor delegates to the canonical respondCandidateOfferAction and never fabricates success", () => {
    const EXEC = readFileSync(join(__dirname, "company-executors.ts"), "utf8");
    expect(EXEC).toContain('fd({ offerId: input.offerId, decision: input.decision, note: input.note ?? "" })');
    expect(EXEC).toContain('if (r.status === "ok") return { ok: true, data: { decision: input.decision } };');
    // The executor never talks to the database itself — the RPC lives behind
    // the canonical action (the comment may NAME it; the code may not call it).
    expect(EXEC).not.toMatch(/\.rpc\(|\.from\(/);
  });

  it("the read lists only OPEN offers on the company's open demands, through the canonical reads", () => {
    const READ = readFileSync(join(__dirname, "client-offers.ts"), "utf8");
    expect(READ.startsWith('"use server";')).toBe(true);
    expect(READ).toContain("requireEmployerCompany()");
    expect(READ).toContain("listCompanyDemands()");
    expect(READ).toContain("listOfferedCandidatesForRequest(d.id)");
    expect(READ).toContain('r.offerStatus === "offered"');
    expect(READ).toContain('d.status !== "closed" && d.status !== "draft"');
    expect(READ).not.toMatch(/\.from\("|\.rpc\(/);
  });

  it("the chat decides with token-confirmed chips inside the workspace — no route out, no second action", () => {
    const CHAT = readFileSync(join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"), "utf8");
    expect(CHAT).toContain("clientOffers: () => startClientOffers()");
    expect(CHAT).toContain('prepareConfirmationAction("company.respond-offer", input)');
    expect(CHAT).toContain('dispatchWorkerAction("company.respond-offer", input, {');
    expect(CHAT).toContain('chip.id.startsWith("offer-accept:") || chip.id.startsWith("offer-decline:")');
    // An agency workspace asking "what was offered" means its own proposals.
    expect(CHAT).toContain('handleChipRef.current({ id: "agency:progress", label: "" });');
    const fn = CHAT.slice(CHAT.indexOf("const startClientOffers = useCallback"), CHAT.indexOf("const startAgencyInvite = useCallback"));
    expect(fn).not.toContain("link:/dashboard");
  });

  it("copy exists in all 11 catalogs", () => {
    for (const locale of ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"]) {
      const cat = JSON.parse(readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8"));
      const chat = cat.conversation.chat as Record<string, string>;
      for (const key of ["clientOffersIntro", "clientOffersNone", "chipOfferAccept", "chipOfferDecline", "offerAccepted", "offerDeclined", "offerDecisionFailed"]) {
        expect(chat[key], `${locale}.${key}`).toBeTypeOf("string");
        expect(chat[key]).not.toMatch(/^\[EN\]/);
      }
      expect(cat.conversation.actions.company.respondOffer.label).toBeTypeOf("string");
    }
  });
});
