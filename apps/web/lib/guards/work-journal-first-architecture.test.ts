import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Work-journal-first conversation architecture guard
 * (owner canonical decision, 2026-07-25).
 *
 * Canonical text: docs/owner-decisions/work-journal-conversation-architecture-v1.md
 * Registry entry: docs/DECISIONS/0014-work-journal-first-conversation-architecture.md
 *
 * WHAT THIS GUARD PROTECTS — the PRINCIPLE, never the current implementation
 * shape. It deliberately pins NO component, NO route, NO table and NO file
 * outside the canonical document itself, because the whole point of the
 * decision is that the implementation must still move (stages A → H) while the
 * invariants stay fixed.
 *
 * It fails when:
 *   1. the canonical document is deleted or renamed away;
 *   2. any of the five named invariants is removed or left undefined;
 *   3. the document stops declaring itself canonical / superseding;
 *   4. the canonical chain, the provenance classes, the transcript-persistence
 *      rule or the recorded DRAFT-capability decisions are dropped;
 *   5. the document becomes unreachable — nothing in the decision registry or
 *      the architecture index links to it any more.
 *
 * It does NOT assert that the product already satisfies the invariants. That
 * is what the per-stage audits and E2E proofs are for; this guard only stops
 * the decision itself from silently disappearing or being weakened.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

const DOC_REL = "docs/owner-decisions/work-journal-conversation-architecture-v1.md";
const DOC = join(REPO_ROOT, DOC_REL);
const REGISTRY_REL =
  "docs/DECISIONS/0014-work-journal-first-conversation-architecture.md";

/** The five invariants the owner named. Removing one is a decision change. */
const INVARIANTS = [
  "CONVERSATION_IS_PRIMARY_WORK_JOURNAL",
  "JOURNAL_ROUTE_IS_STRUCTURED_PROJECTION",
  "CV_IS_WORK_HISTORY_PROJECTION",
  "CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES",
  "DEEP_SURFACES_ARE_NOT_PRIMARY_ENTRY_POINTS",
] as const;

function readDoc(): string {
  expect(
    existsSync(DOC),
    `Canonical owner decision missing: ${DOC_REL}. It may not be deleted or ` +
      `renamed without a new owner decision.`,
  ).toBe(true);
  return readFileSync(DOC, "utf8");
}

/** Every markdown file under docs/, excluding the canonical doc itself. */
function docsMarkdownFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(p);
      } else if (p.endsWith(".md")) {
        out.push(p);
      }
    }
  };
  walk(join(REPO_ROOT, "docs"));
  return out.filter(
    (p) => relative(REPO_ROOT, p).replaceAll("\\", "/") !== DOC_REL,
  );
}

describe("Guard: the canonical work-journal-first decision exists", () => {
  it("the canonical document is present", () => {
    expect(readDoc().length).toBeGreaterThan(4000);
  });

  it("declares itself canonical and superseding", () => {
    const doc = readDoc();
    expect(doc).toMatch(/\bCANONICAL\b/);
    // The decision replaces earlier interpretations rather than sitting
    // beside them — in LT ("pakeičia") or EN ("supersede").
    expect(doc).toMatch(/pakeičia|supersede/i);
  });
});

describe("Guard: the five invariants are named AND defined", () => {
  for (const token of INVARIANTS) {
    it(`${token} is present with a definition`, () => {
      const doc = readDoc();
      expect(
        doc.includes(token),
        `Invariant ${token} was removed from ${DOC_REL}.`,
      ).toBe(true);

      // A bare mention is not enough: the token must head a section whose
      // body carries real text. This is what stops the decision being hollowed
      // out into a list of slogans.
      const idx = doc.indexOf(token);
      const body = doc
        .slice(idx + token.length)
        .split(/\n#{2,3} /)[0]
        .trim();
      expect(
        body.length,
        `Invariant ${token} has no definition body in ${DOC_REL}.`,
      ).toBeGreaterThan(120);
    });
  }
});

describe("Guard: the substance behind the invariants survives", () => {
  it("keeps the canonical chain conversation → history → CV → search", () => {
    const doc = readDoc();
    for (const link of [
      "DARBO ĮVYKIAI",
      "ĮRODYMAI IR PATVIRTINIMAI",
      "PROFESINĖ ISTORIJA",
      "REALUS PROFESINIS PROFILIS",
    ]) {
      expect(doc, `canonical chain link missing: ${link}`).toContain(link);
    }
  });

  it("keeps the six provenance classes (AI inference ≠ confirmed fact)", () => {
    const doc = readDoc();
    for (const cls of [
      "RAW INPUT",
      "EXTRACTED CLAIM",
      "USER-CONFIRMED FACT",
      "EXTERNALLY VERIFIED FACT",
      "DERIVED SIGNAL",
      "PUBLISHED PROFILE PROJECTION",
    ]) {
      expect(doc, `provenance class missing: ${cls}`).toContain(cls);
    }
  });

  it("keeps transcript persistence as business data, not browser state", () => {
    const doc = readDoc();
    expect(doc).toMatch(/[Tt]ranscript/);
    expect(doc).toMatch(/verslo duomenų dalis|business data/i);
  });

  it("keeps the recorded DRAFT-capability decisions", () => {
    const doc = readDoc();
    // Owner: "Šių sprendimų nekeisti be naujo savininko sprendimo."
    expect(doc).toMatch(/Company Locations/);
    expect(doc).toMatch(/Agency Clients/);
    expect(doc).toMatch(/Multi-Source Talent/);
    expect(doc).toMatch(/Worker Opportunity Seen/);
    expect(doc).toMatch(/BUILD NOW/);
    expect(doc).toMatch(/DEFER/);
  });
});

describe("Guard: the decision is reachable from the registry / index", () => {
  it("at least one other doc links to the canonical document", () => {
    const linking = docsMarkdownFiles()
      .filter((p) => readFileSync(p, "utf8").includes(DOC_REL))
      .map((p) => relative(REPO_ROOT, p).replaceAll("\\", "/"));

    expect(
      linking.length,
      `Nothing links to ${DOC_REL}; a canonical decision nobody can find is ` +
        `a decision that will be reinterpreted.`,
    ).toBeGreaterThan(0);
  });

  it("the decision registry carries an entry for it", () => {
    const registry = join(REPO_ROOT, REGISTRY_REL);
    expect(
      existsSync(registry),
      `Decision-registry entry missing: ${REGISTRY_REL}.`,
    ).toBe(true);
    const body = readFileSync(registry, "utf8");
    expect(body).toContain(
      "work-journal-conversation-architecture-v1.md",
    );
    for (const token of INVARIANTS) {
      expect(body, `registry entry omits ${token}`).toContain(token);
    }
  });
});
