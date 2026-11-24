import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: /work-abroad makes no fake-AI promise (audit §4, P6 partial).
 *
 * The page used to render `workAbroad.aiNote` ("AI helps prepare your CV and
 * profile…") while NO AI runs behind that flow — the CV text pipeline is the
 * deterministic extractor + human confirmation (`lib/structuring/**`,
 * skill-claim extraction), and the LLM runtime is env-gated OFF everywhere
 * (see lib/guards/ai-readiness.test.ts). This guard pins the fix:
 *
 *   1. the page no longer renders `aiNote` (the key may stay in messages —
 *      unrendered — until the owner prunes it);
 *   2. the page renders the honest `structuredNote` capability statement;
 *   3. the page's RENDERED output claims no "AI" at all — there is no real
 *      AI call site behind this page, so the word may not appear outside
 *      source comments.
 */

const APP_ROOT = join(__dirname, "..", "..");
const PAGE = join(
  APP_ROOT,
  "app",
  "[locale]",
  "(marketing)",
  "work-abroad",
  "page.tsx",
);

const src = readFileSync(PAGE, "utf8");

/** Source with comments removed — what can actually reach the user. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("Guard: /work-abroad renders no fake-AI copy", () => {
  it("does not render workAbroad.aiNote", () => {
    expect(src).not.toMatch(/t\(\s*["']aiNote["']\s*\)/);
    expect(stripComments(src)).not.toMatch(/aiNote/);
  });

  it("renders the honest structuredNote capability statement instead", () => {
    expect(src).toMatch(/t\(\s*["']structuredNote["']\s*\)/);
  });

  it("references no ai-prefixed i18n key at all", () => {
    expect(stripComments(src)).not.toMatch(/t\(\s*["']ai[A-Z]/);
  });

  it('claims no "AI" in rendered code (no real AI call site exists here)', () => {
    // Comments may explain the history; rendered/renderable code may not
    // claim AI. Word-bounded so identifiers like AuthCtaLink never match.
    expect(stripComments(src)).not.toMatch(/\bAI\b/);
  });

  it("imports no AI runtime (statement stays true to the code)", () => {
    expect(src).not.toMatch(/@\/lib\/ai\//);
    expect(src).not.toMatch(/["']@anthropic-ai\/sdk["']|["']openai["']/);
  });
});
