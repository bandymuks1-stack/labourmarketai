import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: human ↔ human communication carries the work-world grammar without
 * weakening its authority — a PERMITTED counterpart is a PersonPresence, a
 * restricted one stays the locked chip, the original message stays canonical
 * beside its translation-on-read, and message time is a mono stamp.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const THREAD = read("app/[locale]/dashboard/communication/[conversationId]/page.tsx");

describe("Guard: communication wears the work-world grammar (COMMUNICATION_REACHABLE)", () => {
  it("a permitted counterpart is a PersonPresence; a restricted one stays the locked chip", () => {
    expect(THREAD).toContain('from "@/components/app/work-world/primitives"');
    expect(THREAD).toMatch(/card\.counterpartyName \? \(\s*<PersonPresence name=\{card\.counterpartyName\}/);
    // the restricted branch is untouched: lock icon + data-restricted, and never a presence
    const restricted = THREAD.slice(THREAD.indexOf('data-restricted="true"') - 400, THREAD.indexOf('data-restricted="true"'));
    expect(restricted).toContain("card.counterpartyRestricted ? (");
    expect(restricted).not.toContain("PersonPresence");
    // no photo is ever passed — the safe reader yields a name, not a face
    expect(THREAD).not.toMatch(/<PersonPresence[^>]*photoUrl/);
  });

  it("original stays canonical beside translation-on-read; message time is a mono stamp", () => {
    expect(THREAD).toMatch(/data-testid=\{`message-original-\$\{m\.id\}`\}/);
    expect(THREAD).toMatch(/vt\.kind === "translated"/);
    expect(THREAD).toMatch(/<PlaceTimeStamp>\s*\{formatUtcDateTime\(m\.created_at, locale\)\}/);
  });

  it("AI/product conversation and human ↔ human communication stay two systems", () => {
    expect(THREAD).not.toMatch(/conversation-chat|ConversationChat|composer-input/);
  });
});
