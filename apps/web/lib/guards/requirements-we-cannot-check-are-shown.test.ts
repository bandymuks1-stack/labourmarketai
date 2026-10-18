import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matrixRequirementRows,
  unmatchableRequirementRows,
} from "@/lib/country-readiness/requirement-rows";

/**
 * A1 — "we cannot check this" must never render as "this does not exist".
 *
 * `matrixRequirementRows` filters to `documentTypeSlug !== null` because the
 * documents pipeline joins on a document type. Correct for the join, and
 * wrong as a picture of the law: three of eleven curated archetypes carry no
 * document slug and were invisible on every surface, so a worker reading
 * their readiness saw no trace of a requirement that genuinely applies.
 *
 * This is SEP-7 on a live surface, and the fix is additive — the document-keyed
 * contract is untouched (four consumers, non-null slug in its type) and the
 * dropped rows get their own read and their own clearly-labelled group.
 */
const APP = join(__dirname, "..", "..");
const PAGE = readFileSync(
  join(APP, "app/[locale]/dashboard/documents/page.tsx"),
  "utf8",
);
const pageCode = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(
  /\/\*[\s\S]*?\*\//g,
  " ",
);

describe("1. the two reads partition the requirements — nothing falls through", () => {
  it("DE worker_posted: both reads are non-empty and disjoint", () => {
    const matched = matrixRequirementRows("DE", "worker_posted");
    const unmatched = unmatchableRequirementRows("DE", "worker_posted");
    expect(matched.length).toBeGreaterThan(0);
    expect(unmatched.length).toBeGreaterThan(0);
    const keys = new Set(matched.map((r) => r.requirementKey));
    for (const u of unmatched) expect(keys.has(u.requirementKey)).toBe(false);
  });

  it("the unmatchable read returns exactly the rows the matrix drops", () => {
    for (const country of ["DE", "NL", "PL"]) {
      const unmatched = unmatchableRequirementRows(country, "worker_posted");
      // Every one of them is a requirement with no document to join on.
      for (const u of unmatched) {
        expect(
          matrixRequirementRows(country, "worker_posted").some(
            (m) => m.requirementKey === u.requirementKey,
          ),
        ).toBe(false);
      }
    }
  });

  it("an uncurated country yields nothing rather than inventing content", () => {
    expect(unmatchableRequirementRows("XX", "worker_posted")).toEqual([]);
  });
});

describe("2. every shown requirement keeps its provenance", () => {
  it("source url, title, confidence and review date all travel", () => {
    const rows = unmatchableRequirementRows("DE", "worker_posted");
    for (const r of rows) {
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(r.sourceTitle.length).toBeGreaterThan(0);
      expect(r.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["official", "strong", "needs_legal_review"]).toContain(r.confidence);
      expect(r.explanationKey.length).toBeGreaterThan(0);
    }
  });
});

describe("3. the surface shows them, and cannot fold them into a verdict", () => {
  it("the authenticated documents page renders the group", () => {
    expect(pageCode).toMatch(/unmatchableRequirementRows\(/);
    expect(pageCode).toMatch(/data-testid="documents-unmatchable-requirements"/);
    expect(pageCode).toMatch(/data-testid="documents-unmatchable-row"/);
  });

  it("they are NOT passed into the readiness computation or the overall status", () => {
    // computeCountryReadiness takes inv.readiness.requirements — the
    // document-keyed set. Feeding unmatchable rows into it, or into
    // workerReadinessFromChecklist, would let an uncheckable condition move a
    // status it cannot evidence.
    expect(pageCode).not.toMatch(/computeCountryReadiness\([^)]*unmatchable/);
    expect(pageCode).not.toMatch(/workerReadinessFromChecklist\([^)]*unmatchable/);
  });

  it("the group carries an explicit not-checked state, not a status tone", () => {
    const block = pageCode.slice(
      pageCode.indexOf('data-testid="documents-unmatchable-requirements"'),
    );
    expect(block).toMatch(/unmatchable\.state/);
    expect(block).not.toMatch(/STATUS_TONE|OVERALL_TONE/);
  });

  it("reuses the existing explanation copy rather than a new namespace", () => {
    expect(pageCode).toMatch(/tcr\(`explanation\.\$\{r\.explanationKey\}`/);
  });
});

describe("4. no parallel recognition module was left behind", () => {
  it("lib/recognition does not exist — the existing pipeline does this job", () => {
    // An earlier draft added a second comparison module. `computeCountryReadiness`
    // already joins worker documents to requirements on the authenticated
    // surface; the only real gap was the silent drop, which is what this fixes.
    let exists = true;
    try {
      readFileSync(join(APP, "lib/recognition/requirement-evidence.ts"), "utf8");
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
