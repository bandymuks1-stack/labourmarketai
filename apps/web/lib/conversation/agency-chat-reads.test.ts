import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * AGENCY chat walk on production 2026-09-29 (Gama manager):
 *   "Parodyk klientus, kuriems vis dar trūksta darbuotojų." → a NEW need intake
 *   "Parodyk mano darbuotojus."                            → a people search
 *   "Kaip sekasi įdarbinimai?"                             → no answer
 *   offer status said "Klientas priėmė" for a declined / ended placement.
 */
describe("agency chat reads", () => {
  it.each([
    ["Parodyk klientus, kuriems vis dar trūksta darbuotojų.", "client-demand"],
    ["Parodyk mano darbuotojus.", "who-available"],
    ["Kaip sekasi įdarbinimai?", "proposal-status"],
    ["Mums reikia 4 betonuotojų", "need-workers"],
    ["Ieškau darbuotojų", "need-workers"],
  ])("%s → %s", (s, intent) => {
    expect(classifyIntent(s).intent).toBe(intent);
  }, 20_000);

  it("the progress rows carry the placement's own outcome from the placement read", () => {
    const src = readFileSync(join(__dirname, "agency-workspace.ts"), "utf8");
    expect(src).toMatch(/listAgencyPlacements\(\)/);
    expect(src).toMatch(/tLifecycle\("workerDeclined"\)/);
    expect(src).toMatch(/tLifecycle\("engagementEnded"\)/);
    expect(src).toMatch(/outcomeByOffer\.get\(p\.offerId\)/);
  });
});
