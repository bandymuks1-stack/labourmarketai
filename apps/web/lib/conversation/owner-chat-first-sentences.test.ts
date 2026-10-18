import { describe, expect, it } from "vitest";

import {
  classifyIntent,
  isAvailabilityChangeRequest,
} from "@/lib/conversation/intent-router";

/**
 * THE OWNER'S CHAT-FIRST MINIMUM (P0 2026-09-22, section A), measured.
 *
 * The owner listed six sentences a person must be able to say. Probed on
 * 2026-09-22 against the live router, five routed and one did not:
 *
 *   "Esu suvirintojas, 8 metus dirbu MIG/MAG, turiu VCA."  → add-document
 *   "Noriu dirbti Norvegijoje."                            → find-work
 *   "Pridėk šiandienos darbą."                             → log-work
 *   "Parodyk mano įgūdžius."                               → profile
 *   "Pakeisk mano prieinamumą."                            → UNKNOWN  ← gap
 *   "Rask man darbą."                                      → find-work
 *
 * This file is the measurement, kept executable. It is deliberately about
 * the SENTENCES a person types, not about the enum labels the product uses
 * internally — a router tested only against its own vocabulary passes while
 * every real phrasing misses.
 */
const OWNER_SENTENCES: readonly (readonly [string, string])[] = [
  ["Noriu dirbti Norvegijoje.", "find-work"],
  ["Pridėk šiandienos darbą.", "log-work"],
  ["Parodyk mano įgūdžius.", "profile"],
  ["Pakeisk mano prieinamumą.", "availability"],
  ["Rask man darbą.", "find-work"],
];

describe("every sentence the owner named has a route", () => {
  it.each(OWNER_SENTENCES)("%s → %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });

  /**
   * The self-introduction routes to `add-document` because "turiu VCA"
   * names a certificate. Recorded rather than asserted as correct: it is a
   * partially responsive answer to a sentence that also states a profession
   * and eight years of MIG/MAG, and whether the profile should absorb the
   * whole sentence is a product decision, not a pattern bug. Pinned so the
   * behaviour cannot drift unnoticed while that decision is open.
   */
  it("the self-introduction currently lands on add-document (recorded, not endorsed)", () => {
    expect(classifyIntent("Esu suvirintojas, 8 metus dirbu MIG/MAG, turiu VCA.").intent).toBe(
      "add-document",
    );
  });
});

describe('"change my availability" routes in every served locale', () => {
  it.each([
    ["Pakeisk mano prieinamumą.", "lt"],
    ["Noriu pakeisti savo prieinamumą", "lt"],
    ["Change my availability", "en"],
    ["update my availability please", "en"],
    ["Измени мою доступность", "ru"],
    ["Wijzig mijn beschikbaarheid", "nl"],
    ["Ändere meine Verfügbarkeit", "de"],
    ["Zmień moją dostępność", "pl"],
  ])("%s (%s)", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("availability");
    expect(isAvailabilityChangeRequest(sentence)).toBe(true);
  });
});

/**
 * ADVERSARIAL CONTROLS. A pattern that matches everything is worse than no
 * pattern: it steals sentences from the intents that were answering them
 * correctly. Both halves of the rule — a change verb AND an availability
 * noun — are required, and these prove it.
 */
describe("the change-request patterns do not swallow other sentences", () => {
  it("a bare change verb is not an availability request", () => {
    expect(isAvailabilityChangeRequest("Pakeisk mano slaptažodį")).toBe(false);
    expect(isAvailabilityChangeRequest("update my profile")).toBe(false);
    expect(isAvailabilityChangeRequest("Zmień moje hasło")).toBe(false);
  });

  it("a bare availability noun is not a change request", () => {
    expect(isAvailabilityChangeRequest("Koks mano prieinamumas?")).toBe(false);
    expect(isAvailabilityChangeRequest("what is my availability")).toBe(false);
  });

  /**
   * THE STATEMENT MUST NOT BECOME A REQUEST. These are the sentences the
   * availability intent already answered, and they still state a fact — so
   * the handler must keep pre-filling the card for them.
   */
  it("a real availability STATEMENT is not read as a change request", () => {
    for (const s of [
      "Galiu dirbti nuo pirmadienio",
      "I am available from October",
      "Свободен с понедельника",
      "Beschikbaar vanaf maandag",
      "Verfügbar ab Oktober",
      "Jestem dostępny od marca",
    ]) {
      expect(classifyIntent(s).intent, s).toBe("availability");
      expect(isAvailabilityChangeRequest(s), s).toBe(false);
    }
  });

  /** The seek guard still owns sentences that ask for work. */
  it("asking for work still wins over stating availability", () => {
    expect(classifyIntent("galiu dirbti nuo pirmadienio, ieškau darbo").intent).toBe("find-work");
  });
});

describe("a change request never records a fact the person did not state", () => {
  it("the handler pre-fills only for a statement", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const chat = readFileSync(
      join(process.cwd(), "components/app/conversation/chat/conversation-chat.tsx"),
      "utf8",
    );
    const handler = chat.slice(
      chat.indexOf("availabilityStatement: () => {"),
      chat.indexOf("skillGap: () =>"),
    );
    // The presumed status is reachable ONLY on the non-change branch.
    expect(handler).toContain("const changeRequest = isAvailabilityChangeRequest(text);");
    expect(handler).toMatch(/changeRequest\s*\?\s*\{\}/);
    expect(handler).toContain('availabilityStatus: "available"');
    expect(handler.indexOf("changeRequest")).toBeLessThan(
      handler.indexOf('availabilityStatus: "available"'),
    );
  });
});
