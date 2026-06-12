import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { computeContextFit, parseStructuredNeed } from "../market/fit";

/**
 * S6 guard — kontekstinė atitiktis (doktrinos §19).
 *
 * Fit is deterministic, contextual, basis-complete and NEVER persisted; an
 * unstructured need shows NO percentage; structuring is an explicit human
 * act; agency offers are visible facts next to fit; the consent draft stays
 * a default-off, aggregates-only, needs-human-gate DRAFT.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const readRepo = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const stripSql = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const fitLib = read("lib/market/fit.ts");
const page = read("app/[locale]/dashboard/admin/matching/page.tsx");
const structureAction = read("lib/admin/structure-need-actions.ts");
const consentSql = readRepo(
  "supabase/migrations/20260611170000_s6_worker_docs_consent.sql",
);

const NEED = ["esco:a", "esco:b", "esco:c", "esco:d"];
const SUBJECT = [
  { uri: "esco:a", verified: true },
  { uri: "esco:b", verified: false },
  { uri: "esco:x", verified: true },
];

describe("fit is deterministic, contextual and basis-complete (§19)", () => {
  it("same input → same result, every time", () => {
    const a = computeContextFit(NEED, SUBJECT);
    const b = computeContextFit([...NEED].reverse(), [...SUBJECT].reverse());
    expect(a).toEqual(b);
  });
  it("the basis is full: pct + matched + confirmed share + missing", () => {
    const fit = computeContextFit(NEED, SUBJECT)!;
    expect(fit.pct).toBe(50); // 2 of 4
    expect(fit.needTotal).toBe(4);
    expect(fit.matchedTotal).toBe(2);
    expect(fit.matchedConfirmed).toBe(1); // only esco:a is verified
    expect(fit.matchedUris).toEqual(["esco:a", "esco:b"]);
    expect(fit.matchedConfirmedUris).toEqual(["esco:a"]);
    expect(fit.missingUris).toEqual(["esco:c", "esco:d"]);
  });
  it("no structured need → NO percentage (null, never 0%)", () => {
    expect(computeContextFit([], SUBJECT)).toBeNull();
    expect(parseStructuredNeed({})).toBeNull();
    expect(parseStructuredNeed({ structured_need: { esco_skill_uris: [] } })).toBeNull();
  });
  it("different context → different % for the SAME subject (principle, not bug)", () => {
    const narrow = computeContextFit(["esco:a"], SUBJECT)!;
    expect(narrow.pct).toBe(100);
    expect(computeContextFit(NEED, SUBJECT)!.pct).not.toBe(narrow.pct);
  });
  it("the fit module is pure — no supabase, no fetch, no persistence", () => {
    expect(fitLib).not.toMatch(/supabase|\.rpc\(|fetch\(|createClient|\.insert\(|\.update\(/);
  });
});

describe("the workbench renders fit honestly", () => {
  it("fit block renders ONLY for a structured need; unstructured gets the human path", () => {
    expect(page).toMatch(/r\.structuredNeed \?/);
    expect(page).toMatch(/fit\.unstructured/);
    expect(page).toMatch(/<StructureNeedForm\b/);
  });
  it("fit ordering lives ONLY inside one request's context", () => {
    // The sort happens inside the per-request IIFE, on fit results.
    expect(page).toMatch(/b\.fit\.pct - a\.fit\.pct/);
    // The global supply list keeps its no-ranking recency order.
    expect(page).toMatch(/recency order, no ranking/i);
  });
  it("the basis line and missing skills render with the percentage", () => {
    expect(page).toMatch(/fit\.basis/);
    expect(page).toMatch(/fit\.missing/);
    expect(page).toMatch(/matchedConfirmed/);
  });
  it("agency offers render as facts next to fit", () => {
    expect(page).toMatch(/agency-offers-/);
    expect(page).toMatch(/r\.agencyOffers\.length > 0/);
  });
  it("nothing persists a fit value", () => {
    expect(structureAction).not.toMatch(/fit|pct/i);
  });
});

describe("structuring is an explicit human act on existing rails", () => {
  it("resolves typeahead concept ids to canonical ESCO URIs server-side", () => {
    expect(structureAction).toMatch(/esco_skills/);
    expect(structureAction).toMatch(/esco_uri/);
  });
  it("writes payload.structured_need via the EXISTING admin UPDATE RLS", () => {
    expect(structureAction).toMatch(/structured_need/);
    expect(structureAction).toMatch(/structured_by: "admin"/);
    expect(structureAction).not.toMatch(/\.rpc\(/); // no new write path
  });
});

describe("consent draft stays default-off, aggregates-only, gated", () => {
  it("is a needs-human-gate DRAFT with rollback", () => {
    expect(consentSql).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY/);
    expect(consentSql).toMatch(/-- ROLLBACK/);
  });
  it("consent defaults to FALSE (§4 default-closed)", () => {
    expect(stripSql(consentSql).toLowerCase()).toMatch(
      /docs_aggregate_consent boolean not null default false/,
    );
  });
  it("the aggregates RPC filters on consent and returns COUNTS only", () => {
    const code = stripSql(consentSql).toLowerCase();
    expect(code).toMatch(/docs_aggregate_consent is true/);
    expect(code).not.toMatch(/file_path|note|document_type_slug/);
  });
  it("no RLS loosening (no policy change, no anon)", () => {
    const code = stripSql(consentSql).toLowerCase();
    expect(code).not.toMatch(/create policy|alter policy|using\s*\(\s*true\s*\)/);
    expect(code).not.toMatch(/\bto\s+anon\b/);
  });
});

describe("S6 copy exists in LT/EN (+ all locales for key sets)", () => {
  const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];
  it("fit/structure/consent keys present everywhere", () => {
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`messages/${locale}.json`));
      expect(j.admin?.matching?.fit?.basis, `${locale} fit.basis`).toBeTruthy();
      expect(j.admin?.matching?.fit?.unstructured, `${locale} fit.unstructured`).toBeTruthy();
      expect(j.admin?.matching?.structure?.title, `${locale} structure.title`).toBeTruthy();
      expect(j.documents?.consent?.explainer, `${locale} consent.explainer`).toBeTruthy();
      expect(j.agencyPool?.docs?.valid, `${locale} agencyPool.docs.valid`).toBeTruthy();
    }
  });
  it("LT/EN basis copy separates the confirmed share (§19 c)", () => {
    const lt = JSON.parse(read("messages/lt.json"));
    const en = JSON.parse(read("messages/en.json"));
    expect(lt.admin.matching.fit.basis).toMatch(/patvirtinti/);
    expect(en.admin.matching.fit.basis).toMatch(/confirmed/);
  });
});
