import { describe, expect, it } from "vitest";
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
