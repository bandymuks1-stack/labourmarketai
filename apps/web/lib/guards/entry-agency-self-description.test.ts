import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * HOW AN AGENCY ACTUALLY INTRODUCES ITSELF.
 *
 * Measured 2026-09-08 on the public entry, the third defect found by the same
 * per-actor probe (see the demand/supply and institution guards beside this
 * one). `offer-capacity` recognised "agency … HAVE", but nobody writes "we are
 * an agency and we have 30 workers" — they write "we ARE an agency WITH 30
 * available workers":
 *
 *   en "We are a staffing agency with 30 available workers to offer"
 *        -> `who-available` — an EMPLOYER's roster question. The supply
 *           direction read as a demand-side query, which is precisely the
 *           inversion `offer-capacity` exists to prevent.
 *   nl "Wij zijn een uitzendbureau met 30 beschikbare werknemers" -> unknown
 *   de "Wir sind eine Zeitarbeitsfirma mit 30 verfügbaren Mitarbeitern" -> unknown
 *
 * German had no agency noun in this rule at all: `agentur` appears in none of
 * Zeitarbeitsfirma, Personaldienstleister or Arbeitnehmerüberlassung, which is
 * what German actually calls a staffing agency.
 */

const AGENCY_INTRODUCTIONS: ReadonlyArray<readonly [string, string]> = [
  ["en", "We are a staffing agency with 30 available workers to offer"],
  ["nl", "Wij zijn een uitzendbureau met 30 beschikbare werknemers"],
  ["de", "Wir sind eine Zeitarbeitsfirma mit 30 verfügbaren Mitarbeitern"],
  ["de", "Wir sind ein Personaldienstleister mit 12 freien Elektrikern"],
  ["lt", "Esame įdarbinimo agentūra, turime 30 laisvų darbuotojų"],
  ["ru", "Мы кадровое агентство, можем предложить 30 рабочих"],
];

describe("an agency introducing itself is read as SUPPLY", () => {
  for (const [locale, sentence] of AGENCY_INTRODUCTIONS) {
    it(`${locale}: "${sentence}"`, () => {
      expect(classifyIntent(sentence).intent).toBe("offer-capacity");
    });
  }
});

describe("NEGATIVE CONTROLS — an agency also speaks as DEMAND", () => {
  it("an agency HIRING for a client stays employer demand", () => {
    // The self-description is deliberately not sufficient on its own. This
    // sentence carries the agency noun AND a count, so the new rule fires —
    // and must still LOSE, because the occupation stem scores higher on the
    // employer side. If this ever flips, the rule has become too strong.
    const match = classifyIntent(
      "We are a staffing agency looking for 12 welders for our client",
    );
    expect(match.intent).toBe("need-workers");
  });

  it("an employer's own roster question stays `who-available`", () => {
    // "Turime laisvų darbuotojų" WITHOUT a count is the employer asking about
    // its own bench, not an agency offering one — the distinction the count
    // requirement in the sibling rule already protects.
    expect(classifyIntent("Kas šiuo metu laisvas?").intent).toBe("who-available");
  });

  it("a bare agency mention with no supply signal is not an offer", () => {
    // No count, no availability word: nothing here says capacity is on offer,
    // so this must not be read as one.
    expect(classifyIntent("We are an agency").intent).not.toBe("offer-capacity");
  });

  it("the worker and institution doors are untouched", () => {
    expect(classifyIntent("Ieškau darbo suvirintoju Vokietijoje").intent).toBe("find-work");
    expect(
      classifyIntent("We are a training provider and want to register a programme").intent,
    ).toBe("programmes");
    expect(classifyIntent("Reikia 12 pastolininkų Roterdame").intent).toBe("need-workers");
  });
});
