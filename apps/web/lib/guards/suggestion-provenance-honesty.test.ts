import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Honest internal work-entry structuring — foundation v1 guard.
 *
 * When the journal composer surfaces SKILL suggestions from a worker's own free
 * text, every suggestion must carry an honest provenance triad and never a
 * fake-trust badge:
 *   · suggested from entry (rule-based surfacing of the worker's own words);
 *   · self-declared (confirming records the worker's own statement);
 *   · not verified (no human / document confirmation exists yet).
 *
 * This pins:
 *   1. the reusable label component renders the three structuring.provenance
 *      keys and makes NO AI / automatic / matched / verified claim;
 *   2. the composer wires the label + bucket note into the skills bucket;
 *   3. the LT + EN provenance copy is present, parity-clean, and honest
 *      (the only verification mention is a negation).
 *
 * Pure source + message assertions; runs in CI via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const COMPONENT = "components/app/suggestion-provenance.tsx";
const COMPOSER = "components/app/journal-entry-composer.tsx";
const LOCALES = ["lt", "en"] as const;
const PROVENANCE_KEYS = ["suggestedFromEntry", "selfDeclared", "notVerified"] as const;

// Fake-trust automation claims that must NEVER appear in suggestion provenance:
// AI, automatic processing, or matching. Verification words are handled
// separately so the honest "not verified" negation is allowed.
const FAKE_CLAIM =
  /\bAI\b|dirbtin\w*\s*intelekt|automati(?:c|cally|nis|škai)|\bmatch(?:ed|ing)\b|atitik(?:o|imas)/i;

// Affirmative verification claim. Allowed ONLY inside the notVerified key (as a
// negation); forbidden on every other provenance string.
const AFFIRM_VERIFY = /\b(verified|confirmed|certified)\b|patvirtint/i;

// ── 1. The reusable label component ───────────────────────────────────────

describe("Guard: SuggestionProvenanceLabel renders the honest triad", () => {
  const src = read(COMPONENT);

  it("uses the structuring.provenance namespace", () => {
    expect(src).toMatch(/useTranslations\("structuring\.provenance"\)/);
  });

  for (const key of PROVENANCE_KEYS) {
    it(`renders the ${key} label`, () => {
      expect(src).toMatch(new RegExp(`t\\("${key}"\\)`));
    });
  }

  it("exposes a stable test hook", () => {
    expect(src).toMatch(/data-testid="suggestion-provenance"/);
  });

  it("makes no AI / automatic / matched / affirmative-verified claim in code", () => {
    // Strip the doc-comment (which legitimately explains what it does NOT do)
    // and assert the executable body carries no fake-trust claim.
    const body = src.replace(/\/\*\*[\s\S]*?\*\//g, "");
    const m = body.match(FAKE_CLAIM);
    expect(m, `fake-trust claim in component body: ${m?.[0]}`).toBeNull();
  });
});

// ── 2. Composer wiring into the skills bucket ─────────────────────────────

describe("Guard: the composer wires provenance into skill suggestions", () => {
  const src = read(COMPOSER);

  it("imports the provenance label", () => {
    expect(src).toMatch(/import \{ SuggestionProvenanceLabel \}/);
  });

  it("renders the label inside a DetectedSuggestionCard for skills", () => {
    // The skills bucket maps skillSuggestions → a card with the label child.
    const skillsBucket = src.slice(src.indexOf('tBucket("skills")'));
    expect(skillsBucket).toMatch(/<SuggestionProvenanceLabel\s*\/>/);
  });

  it("shows the honest bucket-level provenance note", () => {
    expect(src).toMatch(/t\("skillProvenanceNote"\)/);
    expect(src).toMatch(/data-testid="skill-suggestions-provenance-note"/);
  });
});

// ── 3. Honest, parity-clean i18n ──────────────────────────────────────────

describe("Guard: provenance i18n is present, parity-clean, and honest", () => {
  for (const loc of LOCALES) {
    const structuring = (loadJson(`messages/${loc}.json`).structuring ??
      {}) as { provenance?: Record<string, string> };
    const prov = structuring.provenance ?? {};

    it(`${loc}: all three provenance keys exist and are non-empty`, () => {
      for (const key of PROVENANCE_KEYS) {
        expect(prov[key], `${loc} structuring.provenance.${key}`).toBeTruthy();
      }
    });

    it(`${loc}: suggestedFromEntry + selfDeclared claim no AI/matching/verification`, () => {
      for (const key of ["suggestedFromEntry", "selfDeclared"] as const) {
        const v = prov[key] ?? "";
        expect(v.match(FAKE_CLAIM), `${loc} provenance.${key}: "${v}"`).toBeNull();
        expect(v.match(AFFIRM_VERIFY), `${loc} provenance.${key}: "${v}"`).toBeNull();
      }
    });

    it(`${loc}: notVerified is an honest negation (the only verify mention)`, () => {
      const v = prov.notVerified ?? "";
      const honest = loc === "lt" ? /nepatvirtin/i.test(v) : /not\s+verified/i.test(v);
      expect(honest, `${loc} notVerified must be a negation: "${v}"`).toBe(true);
    });

    it(`${loc}: skillProvenanceNote exists and makes no fake-trust claim`, () => {
      const journal = loadJson(`messages/${loc}/journal.json`) as {
        skillProvenanceNote?: string;
      };
      expect(journal.skillProvenanceNote, `${loc} journal.skillProvenanceNote`).toBeTruthy();
      const m = (journal.skillProvenanceNote ?? "").match(FAKE_CLAIM);
      expect(m, `${loc} skillProvenanceNote fake claim: ${m?.[0]}`).toBeNull();
    });
  }

  it("LT and EN provenance key sets are identical (no drift)", () => {
    const lt = Object.keys(
      ((loadJson("messages/lt.json").structuring as { provenance?: object })
        .provenance ?? {}),
    ).sort();
    const en = Object.keys(
      ((loadJson("messages/en.json").structuring as { provenance?: object })
        .provenance ?? {}),
    ).sort();
    expect(lt).toEqual([...PROVENANCE_KEYS].sort());
    expect(lt).toEqual(en);
  });
});

// ── Negative controls — the detector actually fires ───────────────────────

describe("Guard: the detectors are real", () => {
  it("FAKE_CLAIM flags AI / automation / matching", () => {
    expect(FAKE_CLAIM.test("AI suggested")).toBe(true);
    expect(FAKE_CLAIM.test("automatically matched")).toBe(true);
    expect(FAKE_CLAIM.test("atitiko darbą")).toBe(true);
  });
  it("FAKE_CLAIM passes honest provenance (incl. the 'not verified' negation)", () => {
    expect(FAKE_CLAIM.test("Not verified yet")).toBe(false);
    expect(FAKE_CLAIM.test("Dar nepatvirtinta")).toBe(false);
    expect(FAKE_CLAIM.test("Suggested from entry")).toBe(false);
    expect(FAKE_CLAIM.test("Paties nurodyta")).toBe(false);
  });
  it("AFFIRM_VERIFY flags verification words but the notVerified copy is a negation", () => {
    expect(AFFIRM_VERIFY.test("verified")).toBe(true);
    expect(AFFIRM_VERIFY.test("patvirtinta")).toBe(true);
    // plain provenance labels carry no verification word at all
    expect(AFFIRM_VERIFY.test("Suggested from entry")).toBe(false);
    expect(AFFIRM_VERIFY.test("Self-declared")).toBe(false);
  });
});
