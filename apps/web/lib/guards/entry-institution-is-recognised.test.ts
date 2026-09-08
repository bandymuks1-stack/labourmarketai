import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { readPublicEntry } from "@/lib/marketing/public-entry";

/**
 * THE FOURTH ACTOR HAD NO FRONT DOOR.
 *
 * Measured 2026-09-08 on the public entry, the same probe that found the
 * demand/supply inversion. An INSTITUTION's opening sentence reached nothing:
 *
 *   lt  "Esame mokymo įstaiga, norime registruoti mokymo programą"  -> unknown
 *   en  "We are a training provider and want to register a programme" -> unknown
 *   ru  "Мы учебный центр, хотим зарегистрировать программу обучения" -> unknown
 *   nl  "Wij zijn een opleider en willen een opleidingsprogramma registreren" -> unknown
 *   de  "Wir sind ein Bildungsträger und möchten ein Ausbildungsprogramm registrieren"
 *         -> `opportunities`, the WORKER board — worse than nothing, because
 *            it answers confidently with the wrong actor's surface.
 *
 * The cause was a verb list, not a missing capability: `programmes` accepted
 * create / new / add and their translations. An institution does not CREATE
 * its programme, it REGISTERS it. Four of the five routed locales were shut
 * out of the product at the first sentence.
 *
 * Every added verb still requires a programme noun within 20 characters, so
 * this cannot capture "registruoti darbo laiką" (register working time) or
 * any other register-something sentence — pinned below.
 */

const INSTITUTION_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  ["lt", "Esame mokymo įstaiga, norime registruoti mokymo programą"],
  ["en", "We are a training provider and want to register a programme"],
  ["ru", "Мы учебный центр, хотим зарегистрировать программу обучения"],
  ["nl", "Wij zijn een opleider en willen een opleidingsprogramma registreren"],
  ["de", "Wir sind ein Bildungsträger und möchten ein Ausbildungsprogramm registrieren"],
  // The noun-first order German and Dutch actually use, on its own.
  ["de", "Ausbildungsprogramm registrieren"],
  ["nl", "opleidingsprogramma registreren"],
];

describe("an institution's opening sentence reaches the programmes surface", () => {
  for (const [locale, sentence] of INSTITUTION_SENTENCES) {
    it(`${locale}: "${sentence}"`, () => {
      expect(classifyIntent(sentence).intent).toBe("programmes");
    });
  }

  it("the public entry reads it as the education family", () => {
    // A correct intent in the wrong first-run family would still carry the
    // institution through the wrong door after signup.
    for (const [, sentence] of INSTITUTION_SENTENCES) {
      const reading = readPublicEntry(sentence);
      expect(reading.kind).toBe("recognised");
      if (reading.kind !== "recognised") continue;
      expect(reading.intent).toBe("programmes");
      expect(reading.family).toBe("education");
    }
  });
});

describe("NEGATIVE CONTROLS — `register` alone does not mean a programme", () => {
  const NOT_PROGRAMMES: ReadonlyArray<readonly [string, string]> = [
    ["lt", "Noriu registruoti darbo laiką"],
    ["en", "I want to register my working hours"],
    ["de", "Ich möchte meine Arbeitszeit registrieren"],
  ];

  for (const [locale, sentence] of NOT_PROGRAMMES) {
    it(`${locale}: "${sentence}" does not become a programme`, () => {
      // The verb is shared; the programme NOUN is what makes it education.
      // Without it this must land anywhere else — a working-time intent, or
      // honestly unknown — but never on the institution's surface.
      expect(classifyIntent(sentence).intent).not.toBe("programmes");
    });
  }

  it("the worker and employer doors are untouched", () => {
    // The two sentences the previous fix pinned, re-checked here: a verb-list
    // widening in the education intent must not disturb either direction.
    expect(classifyIntent("Ieškau darbo suvirintoju Vokietijoje").intent).toBe("find-work");
    expect(classifyIntent("Reikia 12 pastolininkų Roterdame").intent).toBe("need-workers");
  });
});
