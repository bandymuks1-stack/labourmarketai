import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * No fake outcome / paid claims (train priority 6). The product never promises a
 * guaranteed match/job/result, and never claims an active paid/premium state
 * that does not exist. This complements the existing AI/auto-verified and pilot
 * guards (which this does NOT duplicate) and is scoped so honest negations
 * ("Matching is not offered yet") and questions ("Kas garantuoja…?") pass.
 */

const messages = join(__dirname, "..", "..", "messages");

function load(rel: string): unknown {
  return JSON.parse(readFileSync(join(messages, rel), "utf8"));
}

const FILES = [
  "lt.json",
  "en.json",
  ...readdirSync(join(messages, "lt"))
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => [`lt/${f}`, `en/${f}`]),
];

// Affirmative first-person outcome guarantees + fake paid state. Deliberately
// NOT matching "garantuoja" (3rd-person question) or "matching is not offered".
const FORBIDDEN: RegExp[] = [
  /\bgarantuojame\b/i, // "we guarantee …"
  /garantuot(as|a|ai|ą)\s+(atitikim|darb|įdarbin|rezultat)/i, // "guaranteed match/job/result"
  /\bwe guarantee\b/i,
  /guaranteed\s+(a\s+|an\s+|your\s+)?(match|job|hire|result|placement|income)/i,
  /premium\s+(plan\s+)?(is\s+)?active/i,
  /paid\s+plan\s+active/i,
  /(mokama\s+)?prenumerata\s+aktyvi/i,
];

describe("no fake outcome / paid claims in user-facing copy", () => {
  for (const file of FILES) {
    const blob = JSON.stringify(load(file));
    for (const re of FORBIDDEN) {
      it(`${file} has no ${re}`, () => {
        const m = blob.match(re);
        expect(m, `forbidden claim in ${file}: ${m?.[0]}`).toBeNull();
      });
    }
  }
});

describe("honest 'matching not offered' framing is preserved (sanity)", () => {
  it("LT + EN still state matching is not offered yet", () => {
    const lt = JSON.stringify(load("lt.json")).toLowerCase();
    const en = JSON.stringify(load("en.json")).toLowerCase();
    expect(lt).toMatch(/matching dar nesiūlom|atitikim\w*.*nesiūlom/);
    expect(en).toMatch(/matching is not offered/);
  });
});
