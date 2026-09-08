import { describe, expect, it } from "vitest";

import { isSafeLabelMatch } from "@/lib/esco/esco-semantics";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ESCO IS MEANING. IT IS NEVER EVIDENCE, A QUALIFICATION, OR A SCORE.
 *
 * The ESCO catalogue is the most seductive thing in this database for the two
 * collapses the product constitution forbids most firmly. It is authoritative,
 * European, and it looks like a credential — so "we matched an ESCO code"
 * slides very easily into "this person can do it" (SEP-3, evidence ≠
 * verification) and from there into "this person is qualified" (SEP-6). It
 * also arrives with 126 051 occupation↔skill relations, which makes it just as
 * easy to turn one shared skill into "this person IS a scaffolder".
 *
 * These are statically checkable, so they are checked here rather than trusted
 * to review.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8").replace(/\r\n/g, "\n");

const SEMANTICS = "lib/esco/esco-semantics.ts";
const LOOKUP = "lib/esco/esco-lookup.ts";

describe("the ESCO layer cannot express a claim about a person", () => {
  it("neither module writes anything, anywhere", () => {
    // A read-only layer cannot persist a mapping that later goes stale and is
    // mistaken for a finding about someone. If this ever needs to write, that
    // is a schema change and an owner gate, not a quiet edit here.
    for (const rel of [SEMANTICS, LOOKUP]) {
      const src = read(rel);
      expect(src, `${rel} must not insert`).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
    }
  });

  it("no exported name suggests possession, verification, qualification or a score", () => {
    // Matched on camelCase WORD boundaries, not substrings. A substring test
    // reads "EscoRelationType" as containing "score" (e-scoRe-lationType) and
    // fails on a correct name — a guard that cries wolf gets deleted, so it
    // has to be right about what it is looking at.
    const words = (name: string) =>
      name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);

    for (const rel of [SEMANTICS, LOOKUP]) {
      const exported = [...read(rel).matchAll(/export (?:async )?(?:function|const|interface|type) (\w+)/g)]
        .map((m) => m[1]);
      for (const name of exported) {
        for (const w of words(name)) {
          for (const forbidden of ["verified", "qualified", "score", "rating", "proficiency", "level"]) {
            expect(
              w === forbidden,
              `${rel} exports "${name}" — ESCO may not name ${forbidden}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("the disclaimer list is present and denies the whole ladder", () => {
    const src = read(SEMANTICS);
    expect(src).toContain("ESCO_IS_NOT");
    // SEP-6's rungs, each named: capability, formal qualification, recognised
    // equivalence, valid credential, legal deployability.
    for (const rung of ["evidence", "verification", "qualification", "equivalence", "credential", "authorisation"]) {
      expect(src.toLowerCase(), `the disclaimer must deny: ${rung}`).toContain(rung);
    }
  });
});

describe("occupation relations never become identity", () => {
  it("the relation reader keeps ESCO's own essential/optional vocabulary", () => {
    const src = read(LOOKUP);
    expect(src).toContain("relation_type");
    // Collapsing essential and optional would erase the difference between
    // "a scaffolder essentially needs this" and "a scaffolder may also do this".
    expect(src).toContain("essential");
  });

  it("nothing derives a person's occupation from a skill relation", () => {
    const src = read(LOOKUP);
    // A function called something like `occupationOf(person)` is the shape of
    // the mistake. PERSON ≠ OCCUPATION.
    expect(src).not.toMatch(/occupationOf|inferOccupation|primaryOccupation|assignOccupation/i);
  });
});

describe("the locale contract is structural, not advisory", () => {
  it("a lookup cannot be made without locales, and the reason is written down", () => {
    const src = read(LOOKUP);
    // esco_labels_typeahead_idx leads with `locale`. Measured on production
    // 2026-09-08: 1.5 ms with a locale, 10 076 ms without — 6 500×. A default
    // here would turn one careless call into a ten-second query.
    expect(src).toMatch(/readonly locales: readonly string\[\]/);
    expect(src).not.toMatch(/locales\s*[?]:/);
    expect(src).toContain("10 076 ms");
  });

  it("a missing catalogue is UNAVAILABLE, never an empty result", () => {
    const src = read(LOOKUP);
    // SEP-7 at the place it is most tempting to break: an empty list renders
    // as "no match" and looks like a perfectly good answer.
    expect(src).toContain("not_imported");
    expect(src).toContain("42P01");
    expect(src).toMatch(/status: "unavailable"/);
  });
});

describe("ESCO is not a blind candidate generator for free text", () => {
  /**
   * MEASURED ON PRODUCTION 2026-09-08, and recorded because the idea is
   * attractive and wrong.
   *
   * Recognition is silent for automotive: "Keičiau stabdžių diskus ir
   * kaladėles" produces no candidate. ESCO holds a million multilingual
   * labels, so the obvious next thought is to let ESCO fill the gap from the
   * person's own words. Reading what ESCO actually holds in Lithuanian for
   * that domain says no:
   *
   *   automobilių elektros sistemos    vehicle electrical systems
   *   elektriniai varikliai            electric motors
   *   ekologiškos automobilių technologijos   green automotive technologies
   *
   * These are KNOWLEDGE concepts — nouns naming a field — not the ACTION a
   * mechanic performed. Nothing there means "changed the brake discs".
   *
   * And the failure would not be a polite miss. A mechanic's "variklis"
   * (engine) prefix-matches "duomenų bazių varikliai" — DATABASE ENGINES. A
   * pipeline that generated candidates this way would tell a car mechanic
   * their work demonstrates database management systems.
   *
   * So the answer to a silent recognizer is NOT ESCO. It is what is already
   * built: ask the person the one materially useful question, keep their
   * answer as structured evidence, and let them link a skill by hand. Silence
   * plus a good question beats a confident wrong concept.
   */
  it("the safe-match rule rejects the database-engines collision outright", () => {
    expect(isSafeLabelMatch("varikliai", "duomenų bazių varikliai")).toBe(false);
    expect(isSafeLabelMatch("variklis", "duomenų bazių varikliai")).toBe(false);
  });

  it("a knowledge-domain label is not an action, and is not matched by one", () => {
    // "I changed the brake discs" must not reach "vehicle electrical systems".
    expect(isSafeLabelMatch("keičiau stabdžių diskus", "automobilių elektros sistemos")).toBe(false);
    expect(isSafeLabelMatch("stabdžių diskus", "automobilių elektros sistemos")).toBe(false);
  });

  it("no module turns a silent recognizer into an ESCO guess", () => {
    // If a future author wires one, it has to pass this file first.
    const src = read("lib/esco/evidence-correspondence.ts");
    // Candidates come from the recognizer's OWN matched terms, never from
    // re-searching the raw sentence when recognition found nothing.
    expect(src).toContain("draft.derived.matchedTerms");
    // [\s\S]* rather than the /s flag: this tsconfig targets below es2018,
    // and tsc rejects the flag (TS1501) even though vitest runs it happily.
    expect(src).not.toMatch(/stated\.activity[\s\S]*lookupEscoConcepts/);
  });
});
