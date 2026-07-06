import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Conversation context honesty guard (quality-train PR E; updated for the
 * owner-approved conversation source relation v1).
 *
 * The neutral-label baseline must stay honest:
 * - the scope label must stay source-neutral (a subject may be a demand
 *   title, an offering title OR a booking role — "request title" was an
 *   overclaim);
 * - no HEURISTIC source-type labelling (a guessed label can be wrong):
 *   the ONLY way a card gains a typed source label is the RPC-resolved
 *   sourceContext input (participant-scoped SECURITY DEFINER reader) —
 *   never subject-text guessing;
 * - the durable relation shipped as the documented owner-gated migration
 *   (20260706210000, DRAFT needs-human-gate) — 0021 itself is untouched.
 *   Deep pins for the relation live in conversation-source-relation.test.ts.
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
  it("conversation-display takes a source ONLY from the RPC-resolved input", () => {
    const display = read("lib/communication/conversation-display.ts");
    expect(display).toMatch(/scope\.demand/);
    // The typed source label derives ONLY from input.sourceContext (the
    // participant-scoped reader RPC's output) — never from raw columns and
    // never from text-pattern guessing of where a thread came from.
    expect(display).toMatch(/input\.sourceContext/);
    expect(display).not.toMatch(/source_type|guessSource|heuristic/i);
    expect(display).not.toMatch(/subject[^\n]*\.(match|test|includes)\(/);
  });
});

describe("the durable source relation stays owner-gated", () => {
  it("the proposal doc exists with the migration design + owner question", () => {
    const doc = read(
      "../../docs/launch/conversation-source-relation-proposal-v1.md",
    );
    expect(doc).toMatch(/PROPOSAL ONLY/);
    expect(doc).toMatch(/source_type/);
    expect(doc).toMatch(/CONSIDERED AND REJECTED/);
    expect(doc).toMatch(/Owner decision needed/);
  });

  it("0021 stays untouched — the columns arrive only via the gated migration", () => {
    // The conversations table gains source columns ONLY through the
    // dedicated owner-gated migration (20260706210000, needs-human-gate) —
    // never by editing the applied 0021 baseline.
    const mig = read("../../supabase/migrations/0021_communication.sql");
    expect(mig).not.toMatch(/source_type/);
  });
});
