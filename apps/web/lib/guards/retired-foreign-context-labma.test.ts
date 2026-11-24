import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Retired foreign context — "LABMA" (owner ruling 2026-08-23).
 *
 * LABMA is a permanently retired, unrelated project. It is NOT a name, alias,
 * predecessor, architecture name, product family or migration source for
 * labourmarket.ai, and no agent may infer this product's truth from it.
 *
 * The rule this guard enforces is deliberately about the *association*, not the
 * token. Renaming "LABMA" to "old labourmarket.ai" or "the predecessor" would
 * preserve exactly what the owner asked to delete, so the patterns below match
 * the ways the two names get bound together — including the softened ones.
 *
 * Documents that mention LABMA only to *deny* the association (AGENTS.md,
 * PRODUCT_CONSTITUTION.md) stay legal: none of the patterns below fire on a
 * denial. Dated audit, launch, quality and legal records elsewhere in `docs/`
 * are point-in-time evidence and are deliberately out of scope — see
 * `AGENTS.md` → *Naming*.
 */
const WEB = resolve(__dirname, "..", "..");
const REPO = resolve(WEB, "..", "..");

/** The documents an agent reads to learn what this product IS. */
const IDENTITY_DOCS = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/PLATFORM_DOCTRINE.md",
  "docs/PRODUCT_CONSTITUTION.md",
  "docs/PROJECT_VISION.md",
  "docs/PROJECT_ROADMAP.md",
  "docs/DECISIONS/0008-universal-labour-market-os.md",
  "docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md",
];

/** Ways the retired name gets re-bound to this product. */
const ASSOCIATION_PATTERNS: { re: RegExp; why: string }[] = [
  {
    re: /\bLABMA[ -]?OS\b/i,
    why: '"LABMA OS" as an architecture or product name for labourmarket.ai',
  },
  {
    re: /\bLABMA\b[^\n]{0,20}\/[^\n]{0,20}\blabou?rmarket/i,
    why: 'LABMA slash-joined to labourmarket.ai as one product',
  },
  {
    re: /\blabou?rmarket[^\n]{0,20}\/[^\n]{0,20}\bLABMA\b/i,
    why: 'labourmarket.ai slash-joined to LABMA as one product',
  },
  {
    re: /\bLABMA\b\s+(?:is|was|yra)\s+(?:a|an|the|our|this|ONE|gyva|živa)\b/i,
    why: "an identity claim asserting what LABMA is",
  },
  {
    re: /\b(?:formerly|previously|renamed from|rebranded from|born as|née)\s+LABMA\b/i,
    why: "LABMA presented as a former name of labourmarket.ai",
  },
  {
    re: /\bLABMA\b[- ](?:era|lineage|heritage|codebase we|architecture we)\b/i,
    why: "LABMA presented as this product's lineage",
  },
  {
    re: /\bLABMA\s+(?:predecessor|prequel|v1|version 1)\b/i,
    why: "LABMA presented as a predecessor of labourmarket.ai",
  },
  {
    re: /\b(?:old|legacy|former|previous|senas?|seno)\s+labou?rmarket\.?ai\b/i,
    why: 'the association survives under a euphemism ("old/legacy labourmarket.ai")',
  },
];

function read(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8");
}

describe("LABMA is retired foreign context, not this product", () => {
  it.each(IDENTITY_DOCS)("%s binds no LABMA identity to labourmarket.ai", (rel) => {
    const src = read(rel);
    const hits = ASSOCIATION_PATTERNS.filter(({ re }) => re.test(src)).map(
      ({ re, why }) => `${why} — matched ${String(re)}`,
    );
    expect(hits, `${rel} re-associates the retired LABMA project`).toEqual([]);
  });

  it("AGENTS.md still carries the owner ruling that severs the association", () => {
    const agents = read("AGENTS.md");
    expect(agents).toMatch(/\bLABMA\b/);
    expect(agents).toMatch(/not a name,\s+alias,\s+predecessor/i);
    expect(agents).toMatch(/unrelated\s+projects/i);
  });

  it("the identity docs describe labourmarket.ai in its own terms", () => {
    const vision = read("docs/PROJECT_VISION.md");
    expect(vision).toMatch(/^# labourmarket\.ai —/m);
  });
});
