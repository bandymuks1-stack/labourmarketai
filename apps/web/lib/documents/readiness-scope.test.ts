import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { matrixRequirementRows } from "@/lib/country-readiness/requirement-rows";
import { documentReadinessScope } from "./readiness";

/**
 * POSTING PAPERS ONLY ACROSS A BORDER (walk-spec 2026-10-25).
 *
 * `listMyDocuments` applied the `worker_posted` matrix scope to every country,
 * so a Lithuanian working in Lithuania read the A1 certificate and the posting
 * notification as "trūksta". The scope now follows the person's base country:
 * posted only when it is known and differs from the work country (decision
 * 0021 extension, point 3).
 */

const POSTING_ONLY = ["a1_certificate", "posting_notification"];
const slugs = (country: string, home: string | null) =>
  matrixRequirementRows(country, documentReadinessScope(country, home)).map((r) => r.documentTypeSlug);

describe("documentReadinessScope", () => {
  it("a Lithuanian working in Lithuania is a local worker — no A1, no posting notification", () => {
    expect(documentReadinessScope("LT", "LT")).toBe("worker_solo");
    for (const s of POSTING_ONLY) expect(slugs("LT", "LT")).not.toContain(s);
    expect(slugs("LT", "LT")).toContain("id_document");
  });

  it("the same person working in Norway IS posted — the posting papers apply", () => {
    expect(documentReadinessScope("NO", "LT")).toBe("worker_posted");
    for (const s of POSTING_ONLY) expect(slugs("NO", "LT")).toContain(s);
  });

  it("a base country that is not stated never asserts a posting", () => {
    expect(documentReadinessScope("NO", null)).toBe("worker_solo");
    expect(documentReadinessScope("NO", undefined)).toBe("worker_solo");
    expect(documentReadinessScope("NO", "  ")).toBe("worker_solo");
    for (const s of POSTING_ONLY) expect(slugs("NO", null)).not.toContain(s);
  });

  it("case and whitespace do not turn a home country into a border", () => {
    expect(documentReadinessScope("LT", " lt ")).toBe("worker_solo");
  });
});

describe("the read path uses the scope, never a fixed `worker_posted`", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

  it("listMyDocuments builds matrix rows per the person's scope and reads their base country", () => {
    const src = read("lib/documents/readiness.ts");
    expect(src).not.toMatch(/matrixRequirementRows\(\s*country,\s*"worker_posted"\s*\)/);
    expect(src).toMatch(/matrixRequirementRows\(country, documentReadinessScope\(country, homeCountry\)\)/);
    expect(src).toMatch(/current_location_country/);
  });

  it("the documents page lists the not-checkable rows in the SAME scope", () => {
    const page = read("app/[locale]/dashboard/documents/page.tsx");
    expect(page).not.toMatch(/unmatchableRequirementRows\(\s*country,\s*"worker_posted"/);
    expect(page).toMatch(/documentReadinessScope\(country, inv\.readiness\.homeCountry\)/);
  });
});
