import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P0 marketplace — no payment / no rating / no fake-data guard.
 *
 * The first marketplace slice is a request loop only: no payment/checkout, no
 * ratings/reviews/stars, no fake offerings/buyers/requests/seed/demo. Scans the
 * migration, server code, UI, and the shipped `marketplace` i18n copy.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

const PAYMENT =
  /\b(payment|transaction|checkout|invoice|billing|stripe|paypal|escrow|paywall|chargeback)\b|pay\s*now|add to cart|credit card|card number|\bcvv\b/i;
// `rate_text` / `rateText` (the W8 free-text rate field) is NOT a rating — the
// tokens below are word-bounded so they never match those identifiers.
const RATING = /\b(rating|ratings|review|reviews|stars?|five[- ]star|leave a review)\b/i;
const FAKE = /\b(seed|demo|sample|fixture|fakeOffer|fakeRequest|fakeBuyer|dummyData)\b/i;

const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/--[^\n]*/g, " ");

const CODE_FILES = [
  "lib/marketplace/service-requests.ts",
  "lib/marketplace/service-requests-shared.ts",
  "components/app/marketplace-loop-section.tsx",
  "app/[locale]/dashboard/service-requests/page.tsx",
];

describe("no payment / no rating / no fake data in the marketplace surface", () => {
  for (const rel of CODE_FILES) {
    it(`${rel} is clean (comments stripped)`, () => {
      const code = stripComments(read(join(ROOT, rel)));
      expect(code.match(PAYMENT), `payment token in ${rel}`).toBeNull();
      expect(code.match(RATING), `rating token in ${rel}`).toBeNull();
      expect(code.match(FAKE), `fake-data token in ${rel}`).toBeNull();
    });
  }

  it("the migration SQL is clean and seeds no fake rows", () => {
    const code = stripComments(
      read(join(REPO, "supabase", "migrations", "20260627145318_service_offering_requests.sql")),
    );
    expect(code.match(PAYMENT), "payment token in migration").toBeNull();
    expect(code.match(RATING), "rating token in migration").toBeNull();
    expect(code.match(FAKE), "fake-data token in migration").toBeNull();
    // The only INSERT is the RPC's parameterized write (uses uid / v_provider /
    // p_offering_id) — there is no literal-UUID seed row.
    expect(code).not.toMatch(/insert into public\.service_offering_requests[\s\S]*?values\s*\(\s*'[0-9a-f]{8}-/i);
  });

  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: marketplace copy has no payment/rating wording`, () => {
      const block = (
        JSON.parse(read(join(ROOT, "messages", `${loc}.json`))) as { marketplace?: unknown }
      ).marketplace;
      const s = JSON.stringify(block ?? {});
      expect(s.match(PAYMENT), `payment token in ${loc}`).toBeNull();
      expect(s.match(RATING), `rating token in ${loc}`).toBeNull();
    });
  }
});
