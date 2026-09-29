import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * CHAT READS THE PERSON'S OWN STATE (owner continuation 2026-09-29 §8),
 * measured on production with the synthetic worker before this change:
 *   "Kur dabar dirbu?"                  → no answer
 *   "Kokios profesijos nurodytos?"      → no answer
 *   "Kokie mano įgūdžiai patvirtinti?"  → the ADMIN approvals area
 *   "Parodyk mano darbo istoriją."      → a JOB SEARCH
 * Each now reaches the existing read that holds the answer — no new reader.
 */
describe("own-state questions reach the reads that answer them", () => {
  it.each([
    ["Kur dabar dirbu?", "engagements"],
    ["Where do I work now?", "engagements"],
    ["Где я сейчас работаю?", "engagements"],
    ["Wo arbeite ich?", "engagements"],
    ["Kokios profesijos nurodytos?", "player-card"],
    ["Kokia mano profesija?", "player-card"],
    ["Kokie mano įgūdžiai patvirtinti?", "player-card"],
    ["What are my skills?", "player-card"],
    ["Parodyk mano darbo istoriją.", "cv-view"],
    ["Show my work history", "cv-view"],
    ["Покажи историю моей работы", "cv-view"],
  ])("%s → %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });

  it("NEGATIVE: seeking and stating keep their own routes", () => {
    expect(classifyIntent("Ieškau darbo").intent).toBe("find-work");
    expect(classifyIntent("Kokie darbai man dabar tinka?").intent).toBe("find-work");
    expect(classifyIntent("Esu pastolininkas.").intent).toBe("profession-statement");
  });
});
