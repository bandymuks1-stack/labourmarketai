import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Manager Evidence Review Clarity honesty guard (slice
 * manager-review-clarity-v1).
 *
 * The manager inbox now explains what a review DOES to a worker's evidence.
 * That copy must stay honest:
 *   1. it never names a broad confirmer the backend cannot store
 *      (parent / teacher / family — same reality as confirmation-honesty);
 *   2. it never claims automatic or AI confirmation;
 *   3. the lead is positively honest — it names the supported confirmers
 *      (manager + owner), states the entry stays self-declared until confirmed,
 *      and frames confirmation as a real HUMAN decision (no auto/AI claim);
 *   4. the manager strip reuses the shared, data-gated EvidenceStatusStrip
 *      (so the "confirmed" state is never forced on without real data).
 *
 * Pure source + i18n assertions; runs in CI via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const LOCALES = ["lt", "en"] as const;
const CLARITY_KEYS = [
  "lead",
  "actionsTitle",
  "approveMeans",
  "confirmSkillsMeans",
  "requestChangesMeans",
  "rejectMeans",
] as const;

// Broad confirmer claims the backend cannot store (mirrors confirmation-honesty).
const BROAD_CONFIRMER = {
  en: /\b(parent|guardian|teacher|mentor|classmate)\b|\bfamily member\b/i,
  lt: /tėv|globėj|mokytoj|mentori|klasės draug|šeimos nar/i,
} as const;

// Fake automatic / AI confirmation. LT uses `\S*` because JS `\w`/`\b` are
// ASCII-only and break next to Lithuanian diacritics (š/ž/…).
const FAKE_AUTO_CONFIRM = {
  en: /\bauto(?:matic|matically)?[- ]?(confirm|verif)|(confirm|verif)\w*\s+automatic/i,
  lt: /automat\S*\s+(patvirtin|patikrin)|(patvirtin|patikrin)\S*\s+automat/i,
} as const;
const FAKE_AI_CONFIRM = {
  en: /\bai[- ]?(confirm|verif)|(confirm|verif)\w*\s+by\s+ai\b/i,
  lt: /dirbtin\S*\s+intelekt\S*\s+(patvirtin|patikrin)/i,
} as const;

function clarity(loc: "lt" | "en"): Record<string, string> {
  const inbox = (loadJson(`messages/${loc}/journal.json`).inbox ?? {}) as {
    reviewClarity?: Record<string, string>;
  };
  return inbox.reviewClarity ?? {};
}

// ── 1. The clarity copy is complete in both locales ────────────────────────

describe("Guard: reviewClarity copy is complete in both locales", () => {
  for (const loc of LOCALES) {
    it(`${loc}: every reviewClarity key is present and non-empty`, () => {
      const rc = clarity(loc);
      for (const k of CLARITY_KEYS) {
        expect(typeof rc[k] === "string" && rc[k].length > 0, `${loc} inbox.reviewClarity.${k}`).toBe(
          true,
        );
      }
    });
  }
});

// ── 2. The clarity copy stays honest ───────────────────────────────────────

describe("Guard: reviewClarity copy never over-claims or fakes confirmation", () => {
  for (const loc of LOCALES) {
    it(`${loc}: no clarity string names a broad confirmer or fakes auto/AI confirmation`, () => {
      const rc = clarity(loc);
      for (const k of CLARITY_KEYS) {
        const v = rc[k] ?? "";
        expect(
          BROAD_CONFIRMER[loc].test(v),
          `${loc} inbox.reviewClarity.${k} over-claims a broad confirmer: "${v}"`,
        ).toBe(false);
        expect(
          FAKE_AUTO_CONFIRM[loc].test(v),
          `${loc} inbox.reviewClarity.${k} claims automatic confirmation: "${v}"`,
        ).toBe(false);
        expect(
          FAKE_AI_CONFIRM[loc].test(v),
          `${loc} inbox.reviewClarity.${k} claims AI confirmation: "${v}"`,
        ).toBe(false);
      }
    });
  }
});

// ── 3. The lead is positively honest (names the real roles + human decision) ─

const LEAD_TERMS = {
  en: {
    manager: /\bmanager\b/i,
    owner: /\bowner\b/i,
    selfDeclared: /self-declared/i,
    human: /real human|human (decision|confirmation)/i,
  },
  lt: {
    manager: /vadov/i,
    owner: /savinink/i,
    selfDeclared: /nurodyt/i,
    human: /žmogaus sprendimas|realus žmogaus/i,
  },
} as const;

describe("Guard: the reviewClarity lead is positively honest", () => {
  for (const loc of LOCALES) {
    it(`${loc}: lead names manager + owner, marks self-declared, frames a human decision`, () => {
      const lead = clarity(loc).lead ?? "";
      const terms = LEAD_TERMS[loc];
      expect(terms.manager.test(lead), `${loc} lead must name the manager confirmer`).toBe(true);
      expect(terms.owner.test(lead), `${loc} lead must name the owner confirmer`).toBe(true);
      expect(
        terms.selfDeclared.test(lead),
        `${loc} lead must state the entry is self-declared until confirmed`,
      ).toBe(true);
      expect(
        terms.human.test(lead),
        `${loc} lead must frame confirmation as a real human decision`,
      ).toBe(true);
    });
  }
});

// ── 4. The inbox reuses the shared, data-gated evidence strip ──────────────

describe("Guard: the manager inbox uses the shared data-gated evidence strip", () => {
  it("inbox renders EvidenceStatusStrip and gates 'confirmed' on real confirmed data", () => {
    const page = read("app/[locale]/dashboard/inbox/page.tsx");
    expect(page).toMatch(/import\s*\{[^}]*EvidenceStatusStrip[^}]*\}\s*from\s*"@\/components\/app\/evidence-status-strip"/);
    expect(page).toMatch(/<EvidenceStatusStrip\s+active=\{reviewLegend\}/);
    expect(page).toMatch(
      /if \(confirmedCount > 0\) reviewLegend\.push\("confirmed"\)/,
    );
  });
});

// ── Negative controls — the detectors are real ─────────────────────────────

describe("Guard: the reviewClarity detectors are real", () => {
  it("flags broad confirmers, automatic and AI confirmation; passes the honest lead", () => {
    expect(BROAD_CONFIRMER.en.test("a teacher can confirm")).toBe(true);
    expect(BROAD_CONFIRMER.lt.test("patvirtino mokytojas")).toBe(true);
    expect(FAKE_AUTO_CONFIRM.en.test("confirmed automatically for you")).toBe(true);
    expect(FAKE_AUTO_CONFIRM.lt.test("automatiškai patvirtinta")).toBe(true);
    expect(FAKE_AI_CONFIRM.en.test("confirmed by AI")).toBe(true);
    // the honest current leads pass every detector AND the positive terms
    for (const loc of LOCALES) {
      const lead = clarity(loc).lead ?? "";
      expect(BROAD_CONFIRMER[loc].test(lead)).toBe(false);
      expect(FAKE_AUTO_CONFIRM[loc].test(lead)).toBe(false);
      expect(FAKE_AI_CONFIRM[loc].test(lead)).toBe(false);
    }
  });
});
