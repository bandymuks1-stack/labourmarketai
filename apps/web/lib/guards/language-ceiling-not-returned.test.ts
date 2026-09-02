import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  conceptLanguageCoverage,
  coveredConceptLanguages,
  registeredButUncoveredLanguages,
} from "@/lib/structuring/concept-resolution/coverage";
import { labelSetSource } from "@/lib/structuring/concept-resolution/term-sources";
import type { ConceptTermSource } from "@/lib/structuring/concept-resolution/types";
import { activeLocales } from "@/lib/i18n/config";

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

/**
 * THE FIVE-LANGUAGE CEILING MUST NOT COME BACK.
 *
 * `MULTILINGUAL = PARTIAL` is true and has two very different halves, and the
 * whole point of this file is that only ONE of them is a defect:
 *
 *   ROUTE / UI coverage    5 of 26 required languages are selectable. That is a
 *                          CONTENT and product-scope fact — 21 catalogues nobody
 *                          has written — and it is not closable by code.
 *   ARCHITECTURAL ceiling  whether the product COULD represent a 6th language
 *                          at all. That is closable by code, it was closed by
 *                          #1302, and it is the thing that can silently return.
 *
 * Before #1302, `expression → concept` had exactly one implementation: a
 * hand-maintained needle list. A language that nobody had hand-written did not
 * merely lack coverage — it could not be REPRESENTED, and its coverage could
 * not even be reported as zero. Georgian was absent from the model rather than
 * absent from the data.
 *
 * These assertions pin the seam that fixed it. They deliberately do NOT assert
 * that any particular language is covered: claiming coverage nobody curated is
 * the exact dishonesty the language matrix exists to prevent.
 */
describe("the concept-resolution seam has no language ceiling", () => {
  /**
   * A language is DATA — a string — not a member of a closed union. If this
   * ever becomes `"lt" | "en" | "ru" | ...` the ceiling is back, and every
   * other assertion here would keep passing while a 6th language became
   * unrepresentable.
   */
  it("a language is an open type, not a closed union", () => {
    const types = read("lib/structuring/concept-resolution/types.ts");
    expect(types).toContain("export type ConceptLanguage = string;");
    // The union form, in any spelling, is what must never appear.
    expect(types).not.toMatch(/ConceptLanguage\s*=\s*"/);
  });

  /**
   * The decisive test, and it is a behavioural one rather than a source read: a
   * language this repository has never curated must be REPRESENTABLE and report
   * ZERO honestly. "Not in the report" and "in the report with nothing in it"
   * are completely different states — only the second can be prioritised.
   */
  it("an uncurated language is representable and reports zero", () => {
    // Georgian: named by the owner, absent from every catalogue in the repo.
    const georgian: ConceptTermSource = labelSetSource([
      { language: "ka", provenance: "guard fixture — nothing curated", labels: {} },
    ]);
    const coverage = conceptLanguageCoverage([georgian]);
    const ka = coverage.find((c) => c.language === "ka");

    expect(ka, "Georgian vanished from the report instead of reporting zero").toBeTruthy();
    expect(ka?.covered).toBe(false);
    expect(ka?.termCount).toBe(0);
    expect(registeredButUncoveredLanguages([georgian])).toContain("ka");
    expect(coveredConceptLanguages([georgian])).not.toContain("ka");
  });

  /**
   * And a curated one really does resolve — otherwise the test above would pass
   * on a resolver that reports zero for everything, which is a ceiling wearing
   * a report as a disguise.
   */
  it("a curated language really does cover concepts", () => {
    const curated: ConceptTermSource = labelSetSource([
      {
        language: "ka",
        provenance: "guard fixture — one curated term",
        labels: { "roof-covering": { exact: ["სახურავის დაგება"] } },
      },
    ]);
    const ka = conceptLanguageCoverage([curated]).find((c) => c.language === "ka");
    expect(ka?.covered).toBe(true);
    expect(ka?.termCount).toBeGreaterThan(0);
    expect(coveredConceptLanguages([curated])).toContain("ka");
  });

  /**
   * Coverage is MEASURED from terms, never declared from a locale list. If the
   * real coverage were computed from `activeLocales`, adding a language to the
   * router would silently claim recognition nobody wrote.
   */
  it("coverage is measured from terms, not read off the active locales", () => {
    const coverage = read("lib/structuring/concept-resolution/coverage.ts");
    expect(coverage).not.toContain("activeLocales");
    // The count comes from iterating real terms.
    expect(coverage).toContain("source.terms()");
    expect(coverage).toContain("covered: e.count > 0");

    // Sanity on the shape of the real report: it is a list of languages with
    // counts, and it is not simply the five routed locales.
    const real = conceptLanguageCoverage();
    expect(real.length).toBeGreaterThan(0);
    for (const row of real) {
      expect(typeof row.language).toBe("string");
      expect(row.covered).toBe(row.termCount > 0);
    }
    // `activeLocales` is the ROUTING fact; concept coverage is a different one.
    // They are allowed to differ, and this records that they are not wired
    // together — which is precisely what keeps a 6th language possible.
    expect(activeLocales.length).toBeGreaterThan(0);
  });
});
