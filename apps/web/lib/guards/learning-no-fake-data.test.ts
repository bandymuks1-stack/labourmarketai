import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 learning — no-fake-data / no-payment guard.
 *
 * The learning surface must never carry fabricated learning, fake scores, fake
 * recommendations, seed/demo rows, or any payment/transaction wording. This scans
 * the migration, server code, UI, and the shipped `learning` i18n copy.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

const PAYMENT =
  /\b(payment|transaction|checkout|invoice|billing|stripe|paypal|escrow|paywall|chargeback)\b|pay\s*now|add to cart|credit card|card number|\bcvv\b/i;
const FAKE = /\b(seed|demo|sample|fixture|mockRow|fakeItem|fakeScore|dummyData)\b/i;

const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/--[^\n]*/g, " ");

const CODE_FILES = [
  "lib/learning/learning.ts",
  "lib/learning/learning-shared.ts",
  "components/app/learning-review-section.tsx",
  "app/[locale]/dashboard/learning/page.tsx",
];

describe("no payment / no fake data in the learning surface", () => {
  for (const rel of CODE_FILES) {
    it(`${rel} has no payment tokens and no fake-data tokens (comments stripped)`, () => {
      const code = stripComments(read(join(ROOT, rel)));
      expect(code.match(PAYMENT), `payment token in ${rel}`).toBeNull();
      expect(code.match(FAKE), `fake-data token in ${rel}`).toBeNull();
    });
  }

  it("the migration SQL has no payment tokens and no seed/demo rows", () => {
    const code = stripComments(
      read(join(REPO, "supabase", "migrations", "20260627132759_human_in_loop_learning.sql")),
    );
    expect(code.match(PAYMENT), "payment token in migration").toBeNull();
    expect(code.match(FAKE), "fake-data token in migration").toBeNull();
    // No data inserts at all (no seeding of signals/queue/policy).
    expect(code).not.toMatch(/insert into public\.learning_/i);
  });

  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: learning copy has no payment wording`, () => {
      const block = (
        JSON.parse(read(join(ROOT, "messages", `${loc}.json`))) as { learning?: unknown }
      ).learning;
      expect(JSON.stringify(block ?? {}).match(PAYMENT), `payment token in ${loc} learning`).toBeNull();
    });
  }
});
