import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * "I WANT TO BRING MY PAST WORK IN" — a canonical journey with no front door.
 *
 * J-IMPORT-HISTORY is one of the product's six canonical journeys, and every
 * rule that opened it required the word TIMESHEET (or hours, or excel).
 * Nobody says that first. Measured 2026-09-08:
 *
 *   lt "noriu įkelti senus darbo duomenis"             -> find-work
 *   de "ich möchte meine alten Arbeitsdaten hochladen" -> find-work
 *   en "i want to upload my old work history"          -> unknown
 *   ru "хочу загрузить старые данные о работе"         -> unknown
 *   nl "ik wil mijn oude werkgegevens uploaden"        -> unknown
 *
 * The two that answered were worse than the three that did not: a person
 * asking to UPLOAD their own history was shown JOB ADVERTS. They matched
 * `find-work`'s bare `darbo` / `arbeit` noun at weight 1–3 — a fallback
 * artefact rather than a reading of the sentence.
 */

const IMPORT_SENTENCES: ReadonlyArray<readonly [string, string]> = [
  ["lt", "noriu įkelti senus darbo duomenis"],
  ["lt", "noriu importuoti senas darbo valandas"],
  ["en", "i want to upload my old work history"],
  ["en", "i have my previous jobs in a spreadsheet"],
  ["ru", "хочу загрузить старые данные о работе"],
  // Verb-last, which is how German and Dutch actually build it.
  ["de", "ich möchte meine alten Arbeitsdaten hochladen"],
  ["nl", "ik wil mijn oude werkgegevens uploaden"],
];

describe("a person bringing their past work in reaches the import surface", () => {
  for (const [locale, sentence] of IMPORT_SENTENCES) {
    it(`${locale}: "${sentence}"`, () => {
      expect(classifyIntent(sentence).intent).toBe("hours-import");
    });
  }

  it("none of them is answered with a job search", () => {
    // The specific harm measured: an upload request answered with adverts.
    for (const [, sentence] of IMPORT_SENTENCES) {
      expect(classifyIntent(sentence).intent).not.toBe("find-work");
      expect(classifyIntent(sentence).intent).not.toBe("opportunities");
    }
  });
});

describe("NEGATIVE CONTROLS — the old/previous marker is what makes it an import", () => {
  it("uploading a CV is still the CV family, not the timesheet import", () => {
    // The CV is five different requests with its own split. Without the
    // old/previous marker this rule must not reach into it.
    expect(classifyIntent("įkelk mano CV").intent).not.toBe("hours-import");
    expect(classifyIntent("upload my CV").intent).not.toBe("hours-import");
  });

  it("a plain job search is untouched", () => {
    expect(classifyIntent("Ieškau darbo suvirintoju Vokietijoje").intent).toBe("find-work");
    expect(classifyIntent("ich suche arbeit").intent).toBe("find-work");
    expect(classifyIntent("ищу работу").intent).toBe("find-work");
  });

  it("the existing timesheet sentences still work", () => {
    expect(classifyIntent("įkelk tabelį").intent).toBe("hours-import");
    expect(classifyIntent("import timesheet").intent).toBe("hours-import");
  });

  it("the doors fixed before this one are untouched", () => {
    expect(classifyIntent("Reikia 12 pastolininkų Roterdame").intent).toBe("need-workers");
    expect(classifyIntent("turime 20 pastolininkų").intent).toBe("offer-capacity");
    expect(classifyIntent("wij hebben 12 lassers nodig").intent).toBe("need-workers");
    expect(
      classifyIntent("We are a training provider and want to register a programme").intent,
    ).toBe("programmes");
  });
});
