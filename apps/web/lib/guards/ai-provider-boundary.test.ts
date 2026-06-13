/**
 * Guard for the AI provider boundary (readiness skeleton).
 *
 * Pins that the typed AI layer is INERT by default: the default provider is a
 * no-op, nothing reaches a network/SDK/key/env, no flag enables AI by default,
 * and neither estimates nor verification can ever be AI-sourced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getAiProvider, isAiAssistEnabled } from "../ai/provider";
import { noopAiProvider } from "../ai/noop-provider";
import { parseAiSuggestion, FORBIDDEN_AI_OUTPUT_FIELDS } from "../ai/schemas";
import { AI_ASSIST_ENABLED, AI_ASSIST_FLAGS } from "../config/ai";

const webRoot = resolve(__dirname, "..", "..");
const repoRoot = resolve(webRoot, "..", "..");
const aiDir = resolve(webRoot, "lib", "ai");
const read = (abs: string) => readFileSync(abs, "utf-8");
/** Strip comments so the "no env / no SDK" scans check real CODE, not the
 *  docstrings that legitimately say "no process.env", "no SDK", "no network". */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
/** Every non-test source file in lib/ai. */
const aiSources = readdirSync(aiDir)
  .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && !f.endsWith(".test.ts"))
  .map((f) => resolve(aiDir, f));

describe("AI provider default is no-op / inert", () => {
  it("getAiProvider() returns the no-op provider, disabled", () => {
    const p = getAiProvider();
    expect(p.id).toBe("noop");
    expect(p.enabled).toBe(false);
    expect(p).toBe(noopAiProvider);
  });
  it("isAiAssistEnabled() is false", () => {
    expect(isAiAssistEnabled()).toBe(false);
  });
  it("every provider method returns the disabled sentinel (no work done)", async () => {
    const p = getAiProvider();
    const a = await p.assistDemandDraft({ kind: "demand_draft", locale: "lt" });
    const b = await p.assistEstimateClarify({ kind: "estimate_clarify", locale: "lt", missingInfoKeys: ["rate"] });
    const c = await p.assistWorkerProfileDraft({ kind: "worker_profile_draft", locale: "lt" });
    for (const r of [a, b, c]) {
      expect(r).toEqual({ status: "disabled", provider: "noop", reason: "ai_assist_disabled" });
    }
  });
});

describe("no network / SDK / key / env reachable from the boundary", () => {
  it("no lib/ai source makes a network call or imports an LLM SDK", () => {
    expect(aiSources.length).toBeGreaterThan(0);
    for (const f of aiSources) {
      const src = code(read(f));
      expect(/\bfetch\s*\(|XMLHttpRequest|node:https?|require\(["']https?["']\)/.test(src), `${f} network`).toBe(false);
      // Anchor on a real import/require specifier so the `"openai"` provider-id
      // STRING LITERAL is not mistaken for an SDK import.
      const sdkImport =
        /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai|@ai-sdk)(?:\/[^"']*)?["']/;
      expect(sdkImport.test(src), `${f} sdk`).toBe(false);
    }
  });
  it("no lib/ai source reads process.env or holds a key/secret", () => {
    for (const f of aiSources) {
      const src = code(read(f));
      expect(/process\.env/.test(src), `${f} env`).toBe(false);
      expect(/api[_-]?key|secret|Bearer\s|\bsk-[a-z0-9]/i.test(src), `${f} secret`).toBe(false);
    }
  });
});

describe("no flag enables AI by default", () => {
  it("master flag is false and every per-use-case flag is false", () => {
    expect(AI_ASSIST_ENABLED).toBe(false);
    for (const [k, v] of Object.entries(AI_ASSIST_FLAGS)) {
      expect(v, `AI_ASSIST_FLAGS.${k}`).toBe(false);
    }
  });
});

describe("no estimate / verification can be AI-sourced", () => {
  it("the suggestion schema rejects record-like fields (total/price/verified/...)", () => {
    // A valid demand-draft suggestion parses.
    expect(
      parseAiSuggestion({
        kind: "demand_draft",
        suggestion: true,
        draftDescription: "x",
        clarifyingQuestions: ["q?"],
        notes: [],
      }),
    ).not.toBeNull();
    // Any forbidden field added → strict schema rejects it.
    for (const field of FORBIDDEN_AI_OUTPUT_FIELDS) {
      const bad = {
        kind: "demand_draft",
        suggestion: true,
        draftDescription: "x",
        clarifyingQuestions: [],
        notes: [],
        [field]: 1,
      };
      expect(parseAiSuggestion(bad), `must reject "${field}"`).toBeNull();
    }
  });
  it("suggestion must be the literal true (never a fact of record)", () => {
    expect(
      parseAiSuggestion({
        kind: "worker_profile_draft",
        suggestion: false,
        draftText: "x",
        notes: [],
      }),
    ).toBeNull();
  });
  it("estimate-clarify has no numeric field — AI can't produce a total", () => {
    const schemaSrc = read(resolve(aiDir, "schemas.ts"));
    // The estimate-clarify schema block carries only string-array fields.
    expect(schemaSrc).toMatch(/estimateClarifyResultSchema[\s\S]*?questions[\s\S]*?assumptionNotes/);
    expect(schemaSrc).not.toMatch(/estimateClarifyResultSchema[\s\S]*?z\.number\(\)[\s\S]*?\.strict\(\)/);
  });
  it("the estimate engine + demand paths do not import lib/ai", () => {
    for (const rel of [
      "lib/estimate/estimate.ts",
      "lib/estimate/estimate-payload.ts",
      "lib/demand/demand-request.ts",
    ]) {
      expect(read(resolve(webRoot, rel))).not.toMatch(/from ["']@\/lib\/ai|from ["']\.\.?\/.*\/ai\//);
    }
  });
});

describe("docs + no active-AI public copy", () => {
  it("the readiness audit doc exists", () => {
    expect(existsSync(resolve(repoRoot, "docs", "audits", "ai-readiness.md"))).toBe(true);
    expect(existsSync(resolve(aiDir, "README.md"))).toBe(true);
  });
  it("no active-AI claim in public copy while AI is disabled", () => {
    const banned =
      /\bAI[- ]?(powered|generated|writes|matches|verifies|drafts your)\b|powered by AI|dirbtinis intelektas (rašo|sukuria|tikrina)|искусственный интеллект (пишет|создаёт|проверяет)/i;
    for (const l of ["en", "lt", "ru"]) {
      const src = read(resolve(webRoot, "messages", `${l}.json`));
      expect(banned.test(src), `${l}.json active-AI claim`).toBe(false);
    }
  });
});
