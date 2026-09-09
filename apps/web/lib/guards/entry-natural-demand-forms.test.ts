import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";

/**
 * HOW PEOPLE ACTUALLY TYPE — four measured misses, one class each.
 *
 * Probed 2026-09-08 with messy human sentences rather than canonical test
 * phrases: contractions, missing apostrophes, no trade named, and the word
 * order the language actually uses.
 *
 *   en "im looking for a job as a welder"      -> need-workers  (INVERSION)
 *   en "we need people in rotterdam"           -> unknown
 *   nl "wij hebben 12 lassers nodig"           -> unknown
 *   lt "mūsų agentūra turi 15 montuotojų"      -> unknown
 *
 * None of these is a phrase to add. Each is a rule that only accepted one
 * shape of a thing people say several ways:
 *
 *   1. "i'm" WITHOUT THE APOSTROPHE is a single token, so a first-person
 *      marker written as `\bi\s+` never fires — and the job seeker falls back
 *      to the employer reading. The demand/supply inversion, reachable by
 *      nothing more than typing quickly.
 *   2. THE GENERIC PERSON NOUN was covered in Lithuanian only. An employer
 *      who has not yet decided the trade is the FIRST sentence of a demand.
 *   3. DUTCH PUTS THE VERB LAST ("hebben … nodig"). Every demand rule
 *      expected the seek verb before the noun.
 *   4. THE THIRD PERSON was missing: an agency says "our agency HAS", not
 *      only "we have".
 */

const DEMAND: ReadonlyArray<readonly [string, string]> = [
  ["en", "we need people in rotterdam"],
  ["de", "wir brauchen Leute in Rotterdam"],
  ["nl", "wij hebben 12 lassers nodig"],
  ["nl", "wij hebben mensen nodig"],
  ["ru", "нужны люди в Роттердаме"],
];

const SUPPLY: ReadonlyArray<readonly [string, string]> = [
  ["en", "im looking for a job as a welder"],
  ["en", "i'm looking for a job as a welder"],
  ["lt", "mūsų agentūra turi 15 montuotojų"],
];

describe("a demand sentence is recognised in the shape the language uses", () => {
  for (const [locale, sentence] of DEMAND) {
    it(`${locale}: "${sentence}" is employer demand`, () => {
      expect(classifyIntent(sentence).intent).toBe("need-workers");
    });
  }
});

describe("a supply sentence survives contractions and the third person", () => {
  it('en: "im looking for a job as a welder" is find-work', () => {
    expect(classifyIntent("im looking for a job as a welder").intent).toBe("find-work");
  });
  it('en: "i\'m looking for a job as a welder" is find-work', () => {
    expect(classifyIntent("i'm looking for a job as a welder").intent).toBe("find-work");
  });
  it('lt: "mūsų agentūra turi 15 montuotojų" is offer-capacity', () => {
    expect(classifyIntent("mūsų agentūra turi 15 montuotojų").intent).toBe("offer-capacity");
  });
});

describe("NEGATIVE CONTROLS — none of the four widenings crosses the direction", () => {
  it('nl: "Ik heb een baan nodig" is a WORKER, not an employer', () => {
    // The Dutch verb-final rule is restricted to the PLURAL `hebben` for
    // exactly this sentence: singular `heb` + a JOB noun is somebody who
    // needs work, the opposite direction. If this ever returns need-workers,
    // the rule has been widened past its evidence.
    expect(classifyIntent("Ik heb een baan nodig").intent).not.toBe("need-workers");
  });

  it('en: "i need work" stays the worker side', () => {
    // The generic-person noun list deliberately excludes work/job. "I need
    // people" is demand; "I need work" is supply.
    expect(classifyIntent("i need work").intent).toBe("find-work");
  });

  it('en: "i need a job" stays the worker side', () => {
    expect(classifyIntent("i need a job").intent).toBe("find-work");
  });

  it("the doors fixed before this one are untouched", () => {
    expect(classifyIntent("Ieškau darbo suvirintoju Vokietijoje").intent).toBe("find-work");
    expect(classifyIntent("Reikia 12 pastolininkų Roterdame").intent).toBe("need-workers");
    expect(classifyIntent("wij hebben 20 vrije steigerbouwers").intent).toBe("offer-capacity");
    expect(
      classifyIntent("We are a training provider and want to register a programme").intent,
    ).toBe("programmes");
    expect(
      classifyIntent("We are a staffing agency looking for 12 welders for our client").intent,
    ).toBe("need-workers");
  });
});
