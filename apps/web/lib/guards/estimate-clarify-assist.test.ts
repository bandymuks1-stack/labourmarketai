/**
 * Step 1/6 guard — Estimate-clarify assist is INERT and safe.
 *
 * Proves the assist surface is hidden behind the AI flags (renders nothing
 * today), routes only through the lib/ai boundary, can never produce a
 * number/price/total/verification, never imports an SDK / reads env / hits the
 * network, makes no active-AI claim while disabled, and is localized en/lt/ru.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAiSuggestion, FORBIDDEN_AI_OUTPUT_FIELDS } from "../ai/legacy-assist-schemas";
import { AI_ASSIST_ENABLED, AI_ASSIST_FLAGS } from "../config/ai";

const webRoot = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf-8");
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const component = read("components/app/estimate-clarify-assist.tsx");
const action = read("lib/ai/estimate-clarify-actions.ts");
const builder = read("components/app/estimate-builder.tsx");

describe("estimate-clarify assist is inert + flag-gated", () => {
  it("the AI flags are off today (so the surface renders nothing)", () => {
    expect(AI_ASSIST_ENABLED).toBe(false);
    expect(AI_ASSIST_FLAGS.estimate_clarify).toBe(false);
  });
  it("the component returns null while the flags are off", () => {
    expect(component).toMatch(
      /if \(!isAiAssistEnabled\(\) \|\| !AI_ASSIST_FLAGS\.estimate_clarify\) return null;/,
    );
  });
  it("the server action returns the disabled sentinel while the flags are off", () => {
    expect(action).toMatch(
      /if \(!AI_ASSIST_ENABLED \|\| !AI_ASSIST_FLAGS\.estimate_clarify\) return DISABLED;/,
    );
    expect(action).toMatch(/getAiProvider\(\)\.assistEstimateClarify/);
    // Output validated by the strict schema before anything is shown.
    expect(action).toMatch(/parseAiSuggestion\(result\)/);
  });
  it("the builder wires the assist (insertion point exists)", () => {
    expect(builder).toMatch(/<EstimateClarifyAssist\b/);
  });
});

describe("estimate-clarify can never produce a number / verification", () => {
  it("a valid clarify suggestion has only questions + assumptionNotes", () => {
    const ok = parseAiSuggestion({
      kind: "estimate_clarify",
      suggestion: true,
      questions: ["How many m²?"],
      assumptionNotes: ["Assumes day rate"],
    });
    expect(ok).not.toBeNull();
  });
  it("a clarify result with any total/price/rate/verified is rejected", () => {
    for (const field of FORBIDDEN_AI_OUTPUT_FIELDS) {
      const bad = {
        kind: "estimate_clarify",
        suggestion: true,
        questions: [],
        assumptionNotes: [],
        [field]: 1,
      };
      expect(parseAiSuggestion(bad), `must reject "${field}"`).toBeNull();
    }
  });
});

describe("no SDK / network / env in the assist path", () => {
  for (const [name, src] of [
    ["component", component],
    ["action", action],
  ] as const) {
    it(`${name} touches no SDK / fetch / process.env`, () => {
      const c = code(src);
      expect(/process\.env/.test(c), `${name} env`).toBe(false);
      expect(/\bfetch\s*\(/.test(c), `${name} fetch`).toBe(false);
      expect(
        /(?:from\s*|import\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai|@ai-sdk)/.test(c),
        `${name} sdk`,
      ).toBe(false);
    });
  }
});

describe("the estimate engine stays AI-free", () => {
  it("the deterministic estimate engine + payload do not import lib/ai", () => {
    for (const rel of ["lib/estimate/estimate.ts", "lib/estimate/estimate-payload.ts"]) {
      expect(read(rel)).not.toMatch(/lib\/ai|from ["']\.\.?\/.*\/ai\//);
    }
  });
});

describe("no active-AI claim + localized en/lt/ru", () => {
  const activeAi =
    /\bAI\b[^.]*\b(analy|writ|generat|creat|match|verif)/i;
  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale}: clarify keys exist and make no active-AI claim`, () => {
      const j = JSON.parse(read(`messages/${locale}.json`));
      const c = j.auth.dashboard.wow.demand.estimate.clarify;
      for (const k of [
        "intro",
        "ask",
        "loading",
        "disabledNote",
        "questionsTitle",
        "assumptionsTitle",
        "humanConfirmNote",
      ]) {
        expect(typeof c[k], `${locale} clarify.${k}`).toBe("string");
      }
      expect(activeAi.test(JSON.stringify(c)), `${locale} active-AI claim`).toBe(false);
    });
  }
});
