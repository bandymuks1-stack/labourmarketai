import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W8 service_offerings — no-payment / no-transaction guard.
 *
 * Phase 1 is a description-only foundation: a provider lists the services they
 * offer. There is NO payment, checkout, transaction, or billing here (billing is
 * a separate, out-of-scope concern). This guard forbids payment/transaction
 * wording and any payment-processor reference across the migration, server
 * actions, UI, and the shipped service-offering copy — so the surface can never
 * silently grow a (fake or real) money flow without an explicit, reviewed change.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

// Payment / transaction tokens that must not appear. `rate` and a currency like
// EUR are allowed (an indicative free-text rate is not a transaction).
const FORBIDDEN =
  /\b(payment|transaction|checkout|invoice|billing|stripe|paypal|escrow|paywall|chargeback)\b|pay\s*now|add to cart|credit card|card number|\bcvv\b/i;

const APP_FILES = [
  "lib/services/service-offerings.ts",
  "components/app/service-offerings-section.tsx",
  "app/[locale]/dashboard/services/page.tsx",
];

/**
 * Strip comments before scanning CODE / SQL. Honest dev comments that document
 * the ABSENCE of payment ("no payment is taken", "Billing is out of scope") must
 * not trip the scan — what we forbid is payment FUNCTIONALITY (columns, calls,
 * processor refs) and user-facing payment COPY (checked separately on i18n).
 */
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1") // line // (not URL ://)
    .replace(/--[^\n]*/g, " "); // SQL line comments

describe("no payment / transaction wording in the services surface", () => {
  for (const rel of APP_FILES) {
    it(`${rel} has no payment/transaction tokens (code, comments stripped)`, () => {
      const m = stripComments(read(join(ROOT, rel))).match(FORBIDDEN);
      expect(m, `forbidden payment token in ${rel}: ${m?.[0]}`).toBeNull();
    });
  }

  it("the migration SQL has no payment/transaction tokens or columns", () => {
    const m = stripComments(
      read(join(REPO, "supabase", "migrations", "20260627121713_service_offerings.sql")),
    ).match(FORBIDDEN);
    expect(m, `forbidden payment token in migration: ${m?.[0]}`).toBeNull();
  });

  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: serviceOfferings copy has no payment/transaction wording`, () => {
      const block = (
        JSON.parse(read(join(ROOT, "messages", `${loc}.json`))) as {
          serviceOfferings?: unknown;
        }
      ).serviceOfferings;
      const m = JSON.stringify(block ?? {}).match(FORBIDDEN);
      expect(m, `forbidden payment token in ${loc} serviceOfferings: ${m?.[0]}`).toBeNull();
    });
  }
});
