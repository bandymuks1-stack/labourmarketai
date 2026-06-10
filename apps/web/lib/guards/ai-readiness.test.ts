import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for the AI readiness scaffolding (Workstream D).
 *
 * The M4+ AI assistance layer is documentation-only in this repo: NO runtime
 * LLM integration exists, and none may appear until the owner decides
 * provider / budget / keys (owner-gated hard blocker). This guard pins:
 *
 *   1. `AI_ASSIST_ENABLED` is `false` in source — while false, nothing
 *      AI-branded is visible anywhere.
 *   2. The architecture doc exists and is grounded in doctrine §7
 *      (AI-never-lies) — every AI claim traces to real data or is labeled
 *      a suggestion.
 *   3. Every prompt template is explicitly marked TEMPLATE ONLY.
 *   4. No file under apps/web/lib imports an LLM SDK
 *      (`@anthropic-ai/sdk`, `openai`).
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

function read(abs: string): string {
  return readFileSync(abs, "utf8");
}

// ── 1. The master flag is OFF ──────────────────────────────────────────────

const AI_CONFIG = join(APP_ROOT, "lib", "config", "ai.ts");

describe("Guard: AI assistance master flag is off", () => {
  it("lib/config/ai.ts exists", () => {
    expect(existsSync(AI_CONFIG)).toBe(true);
  });

  it("AI_ASSIST_ENABLED === false in source (literal, not computed)", () => {
    expect(read(AI_CONFIG)).toMatch(
      /export const AI_ASSIST_ENABLED = false;/,
    );
  });

  it("the flag file documents the owner-gated hard blocker", () => {
    const src = read(AI_CONFIG);
    expect(src).toMatch(/owner-gated hard blocker/i);
    expect(src).toMatch(/docs\/ai\/AI_READINESS\.md/);
  });
});

// ── 2. Architecture doc exists and is doctrine-grounded ───────────────────

describe("Guard: docs/ai/AI_READINESS.md is present and §7-grounded", () => {
  const DOC = join(REPO_ROOT, "docs", "ai", "AI_READINESS.md");

  it("exists", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  it('contains "suggestion" (outputs are always suggestion-tagged)', () => {
    expect(read(DOC)).toMatch(/suggestion/);
  });

  it('contains "§7" (grounded in doctrine AI-never-lies)', () => {
    expect(read(DOC)).toMatch(/§7/);
  });

  it("contains the §7.1 append-only run-logging contract", () => {
    expect(read(DOC)).toMatch(/§7\.1/);
    expect(read(DOC)).toMatch(/append-only/);
  });
});

// ── 3. Prompt templates are TEMPLATE ONLY ─────────────────────────────────

const PROMPT_TEMPLATES = [
  "docs/ai/prompts/matching-explainer.md",
  "docs/ai/prompts/document-checklist-helper.md",
  "docs/ai/prompts/profile-fill-explainer.md",
];

describe("Guard: every prompt template is marked TEMPLATE ONLY", () => {
  it.each(PROMPT_TEMPLATES)('%s exists and contains "TEMPLATE ONLY"', (rel) => {
    const abs = join(REPO_ROOT, rel);
    expect(existsSync(abs), `${rel} missing`).toBe(true);
    expect(read(abs)).toMatch(/TEMPLATE ONLY/);
  });
});

// ── 4. No LLM SDK imports anywhere under apps/web/lib ─────────────────────

/**
 * Matches real import/require statements of LLM SDK packages. Anchored on
 * the quote-delimited module specifier so it cannot match prose or regex
 * source text.
 */
const LLM_SDK_IMPORT =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai)(?:\/[^"']*)?["']/;

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walkSourceFiles(abs, acc);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) {
      acc.push(abs);
    }
  }
  return acc;
}

describe("Guard: no LLM SDK is imported under apps/web/lib", () => {
  it("no lib source file imports @anthropic-ai/sdk or openai", () => {
    const files = walkSourceFiles(join(APP_ROOT, "lib")).filter(
      // Guard tests may quote forbidden patterns as negative controls.
      (f) => !f.endsWith(".test.ts"),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(
        LLM_SDK_IMPORT.test(read(file)),
        `${file} imports an LLM SDK — forbidden until the owner gates open`,
      ).toBe(false);
    }
  });

  // Negative controls: the detector is real.
  it("the detector flags real SDK imports and ignores lookalikes", () => {
    expect(LLM_SDK_IMPORT.test('import OpenAI from "openai";')).toBe(true);
    expect(LLM_SDK_IMPORT.test("import Anthropic from '@anthropic-ai/sdk'")).toBe(
      true,
    );
    expect(
      LLM_SDK_IMPORT.test('const m = await import("openai/resources");'),
    ).toBe(true);
    expect(LLM_SDK_IMPORT.test('import x from "openai-mock-helper";')).toBe(
      false,
    );
    expect(LLM_SDK_IMPORT.test("// talks about openai in prose")).toBe(false);
  });
});
