import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY REFERENCED KEY RESOLVES — no raw key path ever reaches a user.
 *
 * The 2026-08-23 production-readiness audit found six keys referenced in
 * code that existed in NO locale, so next-intl printed the literal key path
 * on real surfaces: the documents readiness checklist (`documents.types.
 * posting_notification` — which ALSO made the required document unaddable,
 * because the type dropdown is `t.has()`-filtered), every skill chip on the
 * profile page (`journal.cv.verified` — present in the base catalog but
 * SHADOWED by the per-locale `journal.json` override in
 * `lib/i18n/request.ts`), the weekly section's journal-unavailable line,
 * the agreements attach form, and the AI chat's unsupported-dimension tail.
 *
 * This guard pins each repaired class. It resolves keys the way the app
 * does — the per-locale namespace files REPLACE the base namespace — so a
 * key that exists only in the shadowed base block counts as missing.
 */

const APP_ROOT = join(__dirname, "..", "..");
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const ALL_LOCALES = [
  "lt",
  "en",
  "ru",
  "nl",
  "de",
  "lv",
  "et",
  "da",
  "no",
  "sv",
  "pl",
] as const;

type Json = Record<string, unknown>;

const readJson = (rel: string): Json =>
  JSON.parse(readFileSync(join(APP_ROOT, rel), "utf8")) as Json;

/** The app's merged view (lib/i18n/request.ts): journal.json REPLACES base
 *  `journal.*` — a shallow override, asserted here exactly as shipped. */
function mergedCatalog(locale: string): Json {
  const base = readJson(`messages/${locale}.json`);
  const journal = readJson(`messages/${locale}/journal.json`);
  return { ...base, journal };
}

function resolve(catalog: Json, path: string): unknown {
  let node: unknown = catalog;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Json)[part];
  }
  return node;
}

/** Seeded document_types slugs — the two seed migrations are the source:
 *  supabase/migrations/20260610170000 (6) + 20260613100200 (6 more). The
 *  readiness matrix (lib/country-readiness/requirements.ts) can put ANY of
 *  them on the documents checklist, so every one needs a label. */
const DOCUMENT_TYPE_SLUGS = [
  "cv",
  "id_document",
  "a1_certificate",
  "employment_contract",
  "professional_certificate",
  "posted_worker_package",
  "posting_notification",
  "residence_permit",
  "work_permit",
  "tax_registration",
  "social_security_registration",
  "health_safety_card",
] as const;

/** Keys the audit caught rendering as raw paths — never again. */
const REPAIRED_KEYS = [
  "journal.cv.verified",
  "journal.cv.declared",
  "journal.cv.journalBacked",
  "opportunities.weekly.journalUnavailable",
  "agreements.attach.documentLabel",
  "agreements.attach.submit",
  "workspace.ai.unsupportedDimension",
] as const;

describe("i18n key resolution (no raw key path reaches a user)", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: every seeded document_types slug has a documents.types label`, () => {
      const catalog = mergedCatalog(locale);
      const missing = DOCUMENT_TYPE_SLUGS.filter(
        (slug) =>
          typeof resolve(catalog, `documents.types.${slug}`) !== "string",
      );
      expect(missing, `${locale}: unlabeled document types`).toEqual([]);
    });

    it(`${locale}: the audit's repaired keys resolve through the MERGED catalog`, () => {
      const catalog = mergedCatalog(locale);
      const missing = REPAIRED_KEYS.filter(
        (k) => typeof resolve(catalog, k) !== "string",
      );
      expect(missing, `${locale}: unresolved keys`).toEqual([]);
    });
  }

  it("every weekly.* literal the section component references exists in all 11 locales", () => {
    const src = readFileSync(
      join(APP_ROOT, "components/app/weekly-intelligence-section.tsx"),
      "utf8",
    );
    const referenced = [...src.matchAll(/t\("weekly\.([A-Za-z0-9_.]+)"/g)].map(
      (m) => m[1],
    );
    expect(referenced.length).toBeGreaterThan(0);
    for (const locale of ALL_LOCALES) {
      const catalog = mergedCatalog(locale);
      const missing = referenced.filter(
        (k) =>
          typeof resolve(catalog, `opportunities.weekly.${k}`) !== "string",
      );
      expect(missing, `${locale}: weekly keys missing`).toEqual([]);
    }
  });
});
