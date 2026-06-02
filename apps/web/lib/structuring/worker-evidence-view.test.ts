import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 8 — worker profile evidence view honesty guard.
 *
 * The card shows what a worker's profile is actually backed by (manager-
 * confirmed vs self-declared skills + system-recorded journal entries). It must
 * not invent a score, must not claim external/AI verification, and must state
 * the self-declared items are awaiting confirmation.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("worker evidence card — honest provenance, no overclaim", () => {
  const raw = read("components/app/worker-evidence-card.tsx");
  // Strip comments — the doc comment intentionally names the forbidden
  // patterns ("no score", 'no fake "verified by AI"') to document the rule.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  it("separates manager-confirmed from self-declared and shows awaiting note", () => {
    expect(src).toMatch(/t\("confirmed"\)/);
    expect(src).toMatch(/t\("selfDeclared"\)/);
    expect(src).toMatch(/t\("awaitingNote"\)/);
    expect(src).toMatch(/t\("systemEntries"\)/);
  });
  it("the standalone worker-evidence card is consolidated out of the page", () => {
    // Consolidated (P0 profile rescue): ProfileHubOverview is the one evidence
    // summary; per-skill provenance still lives in cv-engagement-cards. The
    // component + its honest copy stay tested here.
    const page = read("app/[locale]/dashboard/profile/page.tsx");
    expect(page).not.toMatch(/<WorkerEvidenceCard\b/);
  });
  it("contains no score/percentage/rating gamification", () => {
    expect(src).not.toMatch(/score|rating|percent|%|\/100|points/i);
  });
  it("makes no AI/auto verification claim", () => {
    expect(src).not.toMatch(/verified by ai|auto[- ]?verified|automati[šs]kai patvirtinta/i);
  });
});

describe("worker evidence i18n", () => {
  for (const locale of ["lt", "en"] as const) {
    it(`${locale} workerEvidence keys exist`, () => {
      const ns = (JSON.parse(read(`messages/${locale}.json`)) as {
        workerEvidence?: Record<string, string>;
      }).workerEvidence ?? {};
      for (const k of [
        "title",
        "intro",
        "confirmed",
        "selfDeclared",
        "awaitingNote",
        "systemEntries",
        "empty",
        "footnote",
      ]) {
        expect(ns[k], `${locale} workerEvidence.${k}`).toBeTruthy();
      }
    });
  }
});
