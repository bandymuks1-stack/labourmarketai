import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * NO FAKE AI ON THE MATCH PREVIEW (doctrine §7; production walk 2026-10-25).
 *
 * The match preview showed its "AI pasiūlymas" / "AI suggestion" badge on
 * EVERY result — also while the AI runtime was off in production, when the
 * explanation box itself (honestly) said nothing was generated. A badge that
 * claims AI must mean an AI run produced what is on screen.
 *
 * The preview knows its source: `previewMatchAction` answers
 * `explanationStatus: "suggestion"` only when `runAiAgent` returned a
 * suggestion; throttled, gate-refused and disabled runs answer "disabled",
 * a failed run "needs_review". The badge is pinned to "suggestion" + a real
 * explanation string, and nothing else.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const code = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const FORM = code(read("components/app/match-preview-form.tsx"));
const ACTION = code(read("lib/staffing/match-preview-actions.ts"));

describe("match preview: the AI badge appears only after an AI run", () => {
  it("the badge is rendered exactly once, inside the aiProduced branch", () => {
    expect(FORM.match(/labels\.aiBadge/g)?.length).toBe(1);
    expect(FORM).toMatch(
      /\{aiProduced \? \(\s*<span[^>]*>\s*\{labels\.aiBadge\}\s*<\/span>\s*\) : null\}/,
    );
  });

  it("aiProduced means: the action said 'suggestion' AND returned an explanation", () => {
    expect(FORM).toMatch(
      /const aiProduced =\s*state\?\.ok === true &&\s*state\.explanationStatus === "suggestion" &&\s*typeof state\.explanation === "string" &&\s*state\.explanation\.length > 0;/,
    );
  });

  it("the action answers 'suggestion' only from a real runAiAgent suggestion", () => {
    const suggestion = ACTION.match(/explanationStatus = "suggestion"/g) ?? [];
    expect(suggestion.length).toBe(1);
    expect(ACTION).toMatch(
      /if \(explainOutcome\.status === "suggestion"\) \{[\s\S]*?explanationStatus = "suggestion";/,
    );
    // The off states never claim a suggestion.
    expect(ACTION).toMatch(/if \(limited\) \{\s*explanationStatus = "disabled";/);
    expect(ACTION).toMatch(/aiTaskServableNow\("explain_match"\)\)\) \{\s*explanationStatus = "disabled";/);
  });

  it("the badge copy itself stays an AI claim in every active locale (so it must stay gated)", () => {
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const m = JSON.parse(read(`messages/${locale}.json`)) as {
        matchPreview: { aiBadge: string; aiDisabled: string };
      };
      expect(m.matchPreview.aiBadge, locale).toMatch(/AI|ИИ|KI/);
      // The off line says nothing was generated — it is the honest fallback.
      expect(m.matchPreview.aiDisabled.length, locale).toBeGreaterThan(0);
    }
  });
});
