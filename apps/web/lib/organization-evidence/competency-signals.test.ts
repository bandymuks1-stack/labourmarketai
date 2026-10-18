import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  competencySignalRows,
  deriveCompetencySignals,
  SIGNALS_PER_RECORD_LIMIT,
} from "./competency-signals";

/**
 * EVIDENCE → COMPETENCY. The derivation must stay a DERIVATION: reproducible,
 * explainable, capped, and incapable of producing anything the database's
 * closed `method` set would reject.
 */
describe("deriveCompetencySignals", () => {
  it("reads a canonical skill out of real recorded work, and keeps the term that proves it", () => {
    const signals = deriveCompetencySignals("Klojau laminatą ir parketą objekte Vilniuje");
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.skillSlug).toBeTruthy();
      // The term is what makes a signal contestable: a person must be able to
      // see WHICH word produced a reading of their history.
      expect(s.term.length).toBeGreaterThanOrEqual(2);
      expect(s.term.length).toBeLessThanOrEqual(120);
    }
  });

  it("is deterministic — the same text yields the same signals, in the same order", () => {
    const text = "Suvirinau konstrukcijas, montavau pastolius";
    expect(deriveCompetencySignals(text)).toEqual(deriveCompetencySignals(text));
  });

  it("empty and skill-less text yield an honest empty, never a guess", () => {
    expect(deriveCompetencySignals("")).toEqual([]);
    expect(deriveCompetencySignals("   ")).toEqual([]);
    expect(deriveCompetencySignals(null)).toEqual([]);
    expect(deriveCompetencySignals(undefined)).toEqual([]);
    // SEP-7: this returning [] means "no canonical term was named" — it is not
    // a statement that the person has no skills.
    expect(deriveCompetencySignals("zzz qqq wwwww")).toEqual([]);
  });

  it("emits ONLY the two methods the database accepts — never a fuzzy match", () => {
    // The whole recognizer vocabulary, exercised over varied real phrasings.
    const texts = [
      "Klojau laminatą ir parketą",
      "Suvirinau metalo konstrukcijas MIG būdu",
      "Montavau pastolius aukštybiniuose darbuose",
      "Ploviau grindis ir tvarkiau patalpas",
      "I laid floor tiles and grouted them",
      "Укладывал плитку и штукатурил стены",
      "Dakwerk en steigerbouw op locatie",
      "vairavau krautuvą, kroviau padėklus",
    ];
    const seen = new Set<string>();
    for (const t of texts) {
      for (const s of deriveCompetencySignals(t)) seen.add(s.method);
    }
    for (const m of seen) {
      expect(["exact_term_match", "synonym_term_match"]).toContain(m);
    }
  });

  it("confidence stays inside the numeric(4,3) column and never claims certainty", () => {
    const texts = ["Klojau laminatą", "Suvirinau konstrukcijas", "Montavau pastolius"];
    for (const t of texts) {
      for (const s of deriveCompetencySignals(t)) {
        expect(s.confidence).toBeGreaterThan(0);
        // A term appearing in a description is evidence that work was described
        // that way — never proof the person holds the skill. A stored 1.0 would
        // invite exactly that reading.
        expect(s.confidence).toBeLessThan(1);
      }
    }
  });

  it("never emits the same term twice — the table is unique on (record_id, term)", () => {
    const signals = deriveCompetencySignals(
      "Klojau laminatą, klojau laminatą, ir dar kartą klojau laminatą",
    );
    const terms = signals.map((s) => s.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("respects the cap so one verbose row cannot flood a profile", () => {
    const wordy =
      "Klojau laminatą ir parketą, suvirinau konstrukcijas, montavau pastolius, " +
      "dažiau sienas, tinkavau, mūrijau, vairavau krautuvą, kloju plyteles";
    expect(deriveCompetencySignals(wordy).length).toBeLessThanOrEqual(
      SIGNALS_PER_RECORD_LIMIT,
    );
    expect(deriveCompetencySignals(wordy, 2).length).toBeLessThanOrEqual(2);
  });
});

describe("competencySignalRows", () => {
  it("shapes rows for the table without inventing a verification state", () => {
    const rows = competencySignalRows("org-1", "rec-1", [
      { term: "laminatą", skillSlug: "flooring", method: "exact_term_match", confidence: 0.9 },
    ]);
    expect(rows).toEqual([
      {
        organization_id: "org-1",
        record_id: "rec-1",
        term: "laminatą",
        skill_slug: "flooring",
        method: "exact_term_match",
        confidence: 0.9,
      },
    ]);
    // SEP-3: a signal must never carry, or imply, a verification.
    const keys = Object.keys(rows[0]);
    for (const forbidden of ["verified", "attested", "confirmed", "evidence_state"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("an empty derivation writes nothing at all", () => {
    expect(competencySignalRows("org-1", "rec-1", [])).toEqual([]);
  });
});

describe("the derivation agrees with the migration that defined the table", () => {
  const sql = readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "supabase",
      "migrations",
      "20260907114500_organization_evidence_import_v1.sql",
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("the two emitted methods are exactly the two the check constraint allows", () => {
    // If the constraint ever widens (say, to an AI method), this fails and the
    // derivation must be revisited deliberately rather than drifting into it.
    expect(sql).toContain("check (method in ('exact_term_match','synonym_term_match'))");
  });

  it("the table still has no column that could make a signal look verified", () => {
    const table = sql.slice(
      sql.indexOf("create table if not exists public.organization_evidence_competency_signals"),
    );
    const body = table.slice(0, table.indexOf("\n);"));
    for (const forbidden of ["verified", "attested", "confirmed"]) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });
});
