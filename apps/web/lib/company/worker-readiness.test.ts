import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 9 — company worker readiness summary honesty/wiring guard.
 *
 * The summary shows per-worker SIGNALS from existing data — never a rating,
 * score, ranking, or matching. It must read only RLS-allowed tables and must
 * not mutate or order workers by "best".
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("worker readiness helper — read-only signals", () => {
  const src = read("lib/company/worker-readiness.ts");
  it("reads only existing RLS-allowed sources", () => {
    expect(src).toMatch(/worker_skills/);
    expect(src).toMatch(/journal_entries/);
    expect(src).toMatch(/reviewable_journal_entry_ids/);
  });
  it("does not write or mutate", () => {
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
  it("computes raw counts, not a score/rating", () => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/score|rating|rank|percent/i);
  });
});

describe("worker readiness summary — labelled signals, not a rating", () => {
  const card = read("components/app/worker-readiness-summary.tsx");
  it("uses the signals title + a not-a-rating note", () => {
    expect(card).toMatch(/t\("title"\)/);
    expect(card).toMatch(/t\("note"\)/);
  });
  it("does not sort/rank the rows", () => {
    const code = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/\.sort\(/);
  });
});

describe("worker readiness i18n", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale} workerReadiness keys exist`, () => {
      const ns = (JSON.parse(read(`messages/${locale}.json`)) as {
        workerReadiness?: Record<string, string>;
      }).workerReadiness ?? {};
      for (const k of [
        "title",
        "note",
        "journalEntries",
        "declaredSkills",
        "confirmedSkills",
        "openReview",
        "lastActivity",
      ]) {
        expect(ns[k], `${locale} workerReadiness.${k}`).toBeTruthy();
      }
    });
    it(`${locale} note disclaims rating/score`, () => {
      const note = (JSON.parse(read(`messages/${locale}.json`)) as {
        workerReadiness: { note: string };
      }).workerReadiness.note.toLowerCase();
      expect(note).toMatch(/ne.*reiting|ne.*įvertinim|not a rating|not a.*score/);
    });
  }
});
