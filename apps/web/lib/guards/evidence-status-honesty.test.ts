import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Evidence Status Strip honesty guard (slice evidence-status-strip-v1).
 *
 * The strip shows three states — self_declared / awaiting_confirmation /
 * confirmed. It must stay honest:
 *   1. its copy never names a broad confirmer the backend cannot store
 *      (parent / teacher / family — same reality as confirmation-honesty);
 *   2. its copy never claims automatic or AI confirmation (no fake
 *      "automatically confirmed" / "verified by AI");
 *   3. the "confirmed" chip is DATA-GATED in source — both call sites pass
 *      "confirmed" only when a real approved confirmation actually exists, so
 *      the chip can never light up without a real confirmation signal.
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
const STATES = ["self_declared", "awaiting_confirmation", "confirmed"] as const;

// Broad confirmer claims the backend cannot store (mirrors confirmation-honesty).
const BROAD_CONFIRMER = {
  en: /\b(parent|guardian|teacher|mentor|classmate)\b|\bfamily member\b/i,
  lt: /tėv|globėj|mokytoj|mentori|klasės draug|šeimos nar/i,
} as const;

// Fake automatic confirmation: copy must never say the system confirms or
// verifies on its own. (Scoped to the strip's own strings.)
// NOTE: JS `\w`/`\b` are ASCII-only and break next to Lithuanian diacritics
// (š/ž/…), so the LT patterns use `\S*` to span whole diacritic-bearing words.
const FAKE_AUTO_CONFIRM = {
  en: /\bauto(?:matic|matically)?[- ]?(confirm|verif)|(confirm|verif)\w*\s+automatic/i,
  lt: /automat\S*\s+(patvirtin|patikrin)|(patvirtin|patikrin)\S*\s+automat/i,
} as const;

// Fake AI confirmation: no "AI confirmed" / "verified by AI" claims.
const FAKE_AI_CONFIRM = {
  en: /\bai[- ]?(confirm|verif)|(confirm|verif)\w*\s+by\s+ai\b/i,
  lt: /dirbtin\S*\s+intelekt\S*\s+(patvirtin|patikrin)/i,
} as const;

function stripStrings(loc: "lt" | "en"): { key: string; value: string }[] {
  const es = (loadJson(`messages/${loc}.json`).evidenceStatus ?? {}) as Record<
    string,
    unknown
  >;
  const out: { key: string; value: string }[] = [];
  if (typeof es.aria === "string") out.push({ key: "aria", value: es.aria });
  for (const s of STATES) {
    const node = (es[s] ?? {}) as { label?: unknown; hint?: unknown };
    if (typeof node.label === "string")
      out.push({ key: `${s}.label`, value: node.label });
    if (typeof node.hint === "string")
      out.push({ key: `${s}.hint`, value: node.hint });
  }
  return out;
}

// ── 1. The strip copy exists fully in both locales ─────────────────────────

describe("Guard: evidenceStatus copy is complete in both locales", () => {
  for (const loc of LOCALES) {
    it(`${loc}: every state has a label and a hint`, () => {
      const es = (loadJson(`messages/${loc}.json`).evidenceStatus ?? {}) as Record<
        string,
        { label?: string; hint?: string }
      >;
      for (const s of STATES) {
        expect(typeof es[s]?.label === "string" && es[s].label!.length > 0, `${loc} ${s}.label`).toBe(
          true,
        );
        expect(typeof es[s]?.hint === "string" && es[s].hint!.length > 0, `${loc} ${s}.hint`).toBe(
          true,
        );
      }
    });
  }
});

// ── 2. The strip copy stays honest ─────────────────────────────────────────

describe("Guard: evidence-status copy never over-claims or fakes confirmation", () => {
  for (const loc of LOCALES) {
    it(`${loc}: no string names a broad confirmer`, () => {
      for (const { key, value } of stripStrings(loc)) {
        expect(
          BROAD_CONFIRMER[loc].test(value),
          `${loc} evidenceStatus.${key} over-claims a broad confirmer: "${value}"`,
        ).toBe(false);
      }
    });

    it(`${loc}: no string claims automatic or AI confirmation`, () => {
      for (const { key, value } of stripStrings(loc)) {
        expect(
          FAKE_AUTO_CONFIRM[loc].test(value),
          `${loc} evidenceStatus.${key} claims automatic confirmation: "${value}"`,
        ).toBe(false);
        expect(
          FAKE_AI_CONFIRM[loc].test(value),
          `${loc} evidenceStatus.${key} claims AI confirmation: "${value}"`,
        ).toBe(false);
      }
    });
  }
});

// ── 3. The "confirmed" chip is data-gated at every call site ───────────────

describe("Guard: the confirmed state is only shown when real data supports it", () => {
  it("journal page adds 'confirmed' only when an approved confirmation exists", () => {
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toMatch(
      /if \(evidenceStatuses\.some\(\(s\) => s === "approved"\)\)\s*\n?\s*journalEvidenceActive\.push\("confirmed"\)/,
    );
  });

  it("the strip component never hardcodes an always-confirmed state", () => {
    const strip = read("components/app/evidence-status-strip.tsx");
    // It derives active state from the `active` prop, not a baked-in default.
    expect(strip).toMatch(/active:\s*readonly EvidenceStatus\[\]/);
    expect(strip).not.toMatch(/const\s+\w+\s*=\s*\["[^"]*confirmed[^"]*"\]/);
  });
});

// ── Negative controls — the detectors are real ─────────────────────────────

describe("Guard: the evidence-status detectors are real", () => {
  it("flags broad confirmers, automatic and AI confirmation; passes honest copy", () => {
    expect(BROAD_CONFIRMER.en.test("confirmed by a teacher")).toBe(true);
    expect(BROAD_CONFIRMER.lt.test("patvirtino mokytojas")).toBe(true);
    expect(FAKE_AUTO_CONFIRM.en.test("automatically confirmed for you")).toBe(true);
    expect(FAKE_AUTO_CONFIRM.lt.test("automatiškai patvirtinta")).toBe(true);
    expect(FAKE_AI_CONFIRM.en.test("verified by AI")).toBe(true);
    // honest current copy passes all detectors
    const honest = [
      "Waiting for your manager, the business owner, or an external (client) manager to confirm it.",
      "Confirmed by your manager, the owner, or an external (client) manager.",
    ];
    for (const v of honest) {
      expect(BROAD_CONFIRMER.en.test(v)).toBe(false);
      expect(FAKE_AUTO_CONFIRM.en.test(v)).toBe(false);
      expect(FAKE_AI_CONFIRM.en.test(v)).toBe(false);
    }
  });
});
