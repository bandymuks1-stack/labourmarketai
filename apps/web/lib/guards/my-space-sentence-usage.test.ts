import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isPinnableRef } from "@/lib/workspace/pins-model";
import { pinRefForSentence, SENTENCE_PIN_REFS } from "@/lib/workspace/pin-usage-from-intent";

const CHAT = readFileSync(
  join(__dirname, "..", "..", "components", "app", "conversation", "chat", "conversation-chat.tsx"),
  "utf8",
);

/**
 * MY SPACE §4C — the typed sentence counts as a use of the SAME reference
 * its chip carries. Owner contract 2026-09-04: "detect repeated usage and
 * ASK", "never silently fill the desktop".
 */
describe("a typed sentence is a use of the same pin reference as its chip", () => {
  it("every reference the map produces is one the conversation can resolve", () => {
    expect(SENTENCE_PIN_REFS.length).toBeGreaterThan(10);
    for (const ref of SENTENCE_PIN_REFS) expect(isPinnableRef(ref), ref).toBe(true);
  });

  it("the sentence and the chip share ONE key — never a second key space", () => {
    expect(pinRefForSentence("log-work", "person")).toBe("logwork");
    expect(pinRefForSentence("opportunities", "person")).toBe("jobs");
    expect(pinRefForSentence("find-work", "person")).toBe("jobs");
    expect(pinRefForSentence("documents", "person")).toBe("documents-centre");
    expect(pinRefForSentence("need-workers", "company")).toBe("f:company.create-demand");
    expect(pinRefForSentence("client-demand", "company")).toBe("agency:demand");
  });

  it("a company-only surface counts nothing in the personal space (the bridge answer is not a use)", () => {
    expect(pinRefForSentence("need-workers", "person")).toBeNull();
    expect(pinRefForSentence("candidates", "person")).toBeNull();
    expect(pinRefForSentence("invite-client", "person")).toBeNull();
  });

  it("blocked, route-only and question-back intents are not pinnable uses", () => {
    for (const intent of ["reminder", "translate", "write-employer", "switch-context", "interest-inbox", "unknown", "lmc"] as const) {
      expect(pinRefForSentence(intent, "company"), intent).toBeNull();
    }
  });

  it("the chat counts the sentence right after the intent is recognized, through the ONE noteUsage path", () => {
    const at = CHAT.indexOf("FUNNEL_EVENTS.chatIntentRecognized");
    expect(at).toBeGreaterThan(0);
    const after = CHAT.slice(at, at + 2500);
    expect(after).toContain("pinRefForSentence(intent");
    expect(after).toContain("noteUsage(");
    // One counter: the sentence path must not keep its own usage store.
    expect((CHAT.match(/localStorage\.setItem\(PIN_USAGE_KEY/g) ?? []).length).toBe(1);
  });
});
