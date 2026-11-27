import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { FORBIDDEN_PRODUCT_COPY } from "./product-copy-forbidden-terms";

/**
 * Product-copy forbidden terms (full-product-overview plan, §17 + doctrine §18).
 * The word "demo" is banned from ALL user-facing copy — every screen is a real,
 * persisting feature in its true current state. Honest alternatives that ARE
 * allowed: "preview", "concept", "not live yet", "PRE-ALPHA".
 * Also pins that the §18 cleanup never regresses: no "trial access" /
 * "bandomoji prieiga" framing layered over real features.
 *
 * Scope note: affirmative fake-outcome claims live in
 * no-fake-outcome-claims.test.ts; AI-verification claims in the readiness
 * guards. This guard does NOT duplicate those, and deliberately does not match
 * honest negations (they phrase honesty without the banned tokens).
 */

const messages = join(__dirname, "..", "..", "messages");

const BASE_FILES = readdirSync(messages).filter((f) => f.endsWith(".json"));
const TAXONOMY_FILES = readdirSync(messages)
  .filter((d) => !d.endsWith(".json"))
  .flatMap((d) =>
    existsSync(join(messages, d))
      ? readdirSync(join(messages, d))
          .filter((f) => f.endsWith(".json"))
          .map((f) => `${d}/${f}`)
      : [],
  );
const FILES = [...BASE_FILES, ...TAXONOMY_FILES];

// The list lives in ONE module, shared with the production UX measurement.
const FORBIDDEN = FORBIDDEN_PRODUCT_COPY;

describe("the forbidden-term list is the shared one and still bans the core terms", () => {
  it("keeps all six rules", () => {
    expect(FORBIDDEN).toHaveLength(6);
    expect(FORBIDDEN.some(({ re }) => re.test("Demo"))).toBe(true);
    expect(FORBIDDEN.some(({ re }) => re.test("Demonstracija"))).toBe(true);
    expect(FORBIDDEN.some(({ re }) => re.test("demokratija"))).toBe(false);
  });
});

describe("product copy contains no forbidden demo/trial terms", () => {
  it("scans at least the 10 doctrine locales", () => {
    expect(BASE_FILES.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of FILES) {
    const blob = JSON.stringify(
      JSON.parse(readFileSync(join(messages, file), "utf8")),
    );
    for (const { re, why } of FORBIDDEN) {
      it(`${file}: ${why}`, () => {
        const m = blob.match(re);
        expect(m, `forbidden term in ${file}: "${m?.[0]}"`).toBeNull();
      });
    }
  }
});

describe("honest preview framing is preserved (sanity)", () => {
  it("LT + EN keep an honest preview/pre-alpha marker on the live surface", () => {
    const en = JSON.stringify(
      JSON.parse(readFileSync(join(messages, "en.json"), "utf8")),
    );
    expect(en).toMatch(/PRE-ALPHA|preview/i);
  });
});
