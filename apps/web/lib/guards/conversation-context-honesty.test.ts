import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Conversation context honesty guard (quality-train PR E).
 *
 * The conversations table has NO source relation (subject text only), so
 * the UI must never claim more context than the schema can prove:
 * - the scope label must stay source-neutral (a subject may be a demand
 *   title, an offering title OR a booking role — "request title" was an
 *   overclaim);
 * - no heuristic source-type labelling (a guessed label can be wrong);
 * - the durable relation is a documented owner-gated migration proposal,
 *   not an improvisation.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

describe("scope copy claims only what the schema can prove", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: scope.demand is source-neutral (no 'request title' overclaim)`, () => {
      const msgs = JSON.parse(read(`messages/${loc}.json`)) as {
        communication: { scope: Record<string, string> };
      };
      const label = msgs.communication.scope.demand;
      expect(label?.trim().length).toBeGreaterThan(0);
      // The old copy asserted every subject was a REQUEST title — false for
      // booking (role_text) and accepted-offering (offering title) threads.
      expect(label.toLowerCase()).not.toMatch(
        /užklausos pavadinimas|request title|названием запроса/,
      );
    });
  }
});

describe("no heuristic source labelling sneaks into the display model", () => {
  it("conversation-display derives scope ONLY from kind + subject presence", () => {
    const display = read("lib/communication/conversation-display.ts");
    expect(display).toMatch(/scope\.demand/);
    // No text-pattern guessing of where a thread came from.
    expect(display).not.toMatch(/source_type|sourceType|guessSource|heuristic/i);
  });
});

describe("the durable source relation stays an owner-gated proposal", () => {
  it("the proposal doc exists with the migration design + owner question", () => {
    const doc = read(
      "../../docs/launch/conversation-source-relation-proposal-v1.md",
    );
    expect(doc).toMatch(/PROPOSAL ONLY/);
    expect(doc).toMatch(/source_type/);
    expect(doc).toMatch(/CONSIDERED AND REJECTED/);
    expect(doc).toMatch(/Owner decision needed/);
  });

  it("no conversations source columns exist in migrations yet (nothing improvised)", () => {
    // The conversations table gains source columns only through the
    // owner-gated PR the proposal describes.
    const mig = read("../../supabase/migrations/0021_communication.sql");
    expect(mig).not.toMatch(/source_type/);
  });
});
