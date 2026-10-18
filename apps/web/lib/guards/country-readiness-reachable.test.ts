import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COUNTRY_READINESS,
  READINESS_COUNTRIES,
  READINESS_SCOPES,
  getCountryReadinessOrNull,
} from "@/lib/country-readiness";
import { SUPPORTED_COUNTRIES } from "@/lib/labour-market/country-evidence";

/**
 * B1 — SKL-8 (what a country requires) + GEO-3 (mobility) REACH A PERSON.
 *
 * WHAT WAS DISCONNECTED, MEASURED. `lib/country-readiness/` carries 180
 * researched requirements (10 countries × 18), each with an official source
 * and a review date. Exactly one projection reached a surface:
 * `lib/documents/readiness.ts` reads `matrixRequirementRows(country,
 * "worker_posted")` for the personal document checklist. That is ONE of four
 * scopes, further narrowed to rows that map to a `document_types` slug — so
 * three quarters of the matrix, and every requirement with no document behind
 * it, had no reader anywhere in the product.
 *
 * WHAT THIS GUARD PINS, AND WHAT IT DOES NOT. It pins that the matrix is
 * mounted on the public per-country route and that all four scopes are
 * rendered. It does NOT claim a human has seen the page — that is Step F, and
 * no test can substitute for it.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Source with comments removed — so a guard tests what the file DOES, not
 *  what it says about itself. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const COUNTRY_PAGE = "app/[locale]/labour-market/[country]/page.tsx".replace(
  "app/[locale]/",
  "app/[locale]/(marketing)/",
);
const COMPONENT = "components/marketing/country-readiness-requirements.tsx";

describe("the readiness matrix has a reader at all", () => {
  it("is mounted on the existing per-country route — not a second one", () => {
    const page = read(COUNTRY_PAGE);
    expect(page).toMatch(/CountryReadinessRequirements/);
    expect(page).toMatch(/country=\{code\}/);
  });

  it("every country the public route can render has researched content", () => {
    // The route's generateStaticParams comes from SUPPORTED_COUNTRIES. If one
    // of those is not in the readiness set the page renders the honest
    // "not researched yet" state — correct, but worth knowing about, because
    // it means a live page is empty where a reader expects substance.
    const missing = SUPPORTED_COUNTRIES.filter(
      (c) => getCountryReadinessOrNull(c) === null,
    );
    expect(
      missing,
      "these countries have a public page but no researched requirements",
    ).toEqual([]);
  });

  it("renders ALL FOUR scopes, which is the half that had no reader", () => {
    const src = read(COMPONENT);
    // The component iterates the canonical scope list rather than naming a
    // subset — that iteration is what makes GEO-3 present at all.
    expect(src).toMatch(/READINESS_SCOPES\.map/);
    // And it must not narrow back to one scope. Asserted against CODE, not
    // prose: the file's own header explains the `worker_posted`-only defect
    // it exists to end, and a naive text match flagged that explanation.
    expect(stripComments(src)).not.toMatch(/worker_posted/);
  });
});

describe("nothing is claimed that the matrix cannot back", () => {
  it("an unresearched country is an honest absence, never a neighbour's data", () => {
    expect(getCountryReadinessOrNull("ZZ")).toBeNull();
    expect(getCountryReadinessOrNull("US")).toBeNull();
    const src = read(COMPONENT);
    expect(src).toMatch(/noResearchYet/);
  });

  it("a needs_legal_review statement is marked as unsettled in the UI", () => {
    // The matrix deliberately marks national detail `needs_legal_review`
    // instead of inventing a rule. If the UI rendered that identically to an
    // official EU statement, the honesty of the data would be thrown away at
    // the last step.
    const unsettled = READINESS_COUNTRIES.flatMap((c) =>
      COUNTRY_READINESS[c].requirements.filter(
        (r) => r.confidence === "needs_legal_review",
      ),
    );
    expect(
      unsettled.length,
      "the matrix should carry unsettled statements; if not, this guard is vacuous",
    ).toBeGreaterThan(0);
    const src = read(COMPONENT);
    expect(src).toMatch(/needs_legal_review/);
    expect(src).toMatch(/requirement-needs-legal-review/);
  });

  it("every rendered requirement carries a source and a review date", () => {
    for (const c of READINESS_COUNTRIES) {
      for (const r of COUNTRY_READINESS[c].requirements) {
        expect(r.sourceUrl, `${c}:${r.key} has no source URL`).toMatch(/^https:\/\//);
        expect(r.sourceTitle, `${c}:${r.key} has no source title`).not.toBe("");
        expect(r.lastReviewedAt, `${c}:${r.key} has no review date`).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
      }
    }
    const src = read(COMPONENT);
    expect(src).toMatch(/r\.sourceUrl/);
    expect(src).toMatch(/r\.lastReviewedAt/);
  });
});

describe("the copy the matrix was built to consume now exists", () => {
  const LOCALES = ["en", "lt", "ru", "nl", "de"] as const;

  /** Every explanationKey the matrix actually uses, across all countries. */
  const explanationKeys = [
    ...new Set(
      READINESS_COUNTRIES.flatMap((c) =>
        COUNTRY_READINESS[c].requirements.map((r) => r.explanationKey),
      ),
    ),
  ].sort();

  it("the matrix references explanation keys at all", () => {
    expect(explanationKeys.length).toBeGreaterThan(5);
  });

  for (const locale of LOCALES) {
    it(`${locale} carries an explanation for every requirement, and every scope`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        Record<string, Record<string, string>>
      >;
      const ns = messages.countryReadiness;
      expect(ns, `${locale} has no countryReadiness namespace`).toBeTruthy();

      const missing = explanationKeys.filter((k) => !ns.explanation?.[k]);
      expect(
        missing,
        `${locale} is missing explanation copy — the requirement would render as a raw key`,
      ).toEqual([]);

      for (const scope of READINESS_SCOPES) {
        expect(
          (ns.scope as unknown as Record<string, { label?: string }>)?.[scope]?.label,
          `${locale} has no label for scope ${scope}`,
        ).toBeTruthy();
      }
    });
  }
});
