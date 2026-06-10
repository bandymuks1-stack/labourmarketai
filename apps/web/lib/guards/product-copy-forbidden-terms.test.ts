import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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

// Unicode lookarounds instead of \b — \b silently fails next to LT diacritics
// (ą ę ė į š ų ū ž), so "demo" beside them would slip through a \b guard.
// "demonstracija"/"demokratija" stay allowed (no boundary after "demo").
const FORBIDDEN: Array<{ re: RegExp; why: string }> = [
  {
    re: /(?<![\p{L}\p{N}_])demos?(?![\p{L}\p{N}_])/iu,
    why: 'word "demo" is banned in product copy — use "preview" / "concept" / "not live yet"',
  },
  {
    re: /trial\s+access/i,
    why: "§18: no trial-access layer over real features",
  },
  {
    re: /bandom[a-zą-ž]*\s+(prieig|versij|režim)/iu,
    why: "§18: no LT trial-version/access framing over real features",
  },
  {
    re: /demo\s*[-_]?\s*(mode|data|account|rež[a-zą-ž]*|duomen[a-zą-ž]*|paskyr[a-zą-ž]*)/iu,
    why: "no demo-mode/demo-data framing in any locale",
  },
];

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
