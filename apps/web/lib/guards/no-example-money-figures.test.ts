import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO EXAMPLE MONEY THAT READS AS A REAL RATE (decision 0032; owner-approved
 * number clean-up, 2026-11-22). A placeholder such as "1500", "E.g., 2200",
 * "e.g. 32 €/h" or "€450/month" in a salary, rate or price field reads, on a
 * labour market, like the going rate. The field labels say what goes there;
 * the figures are gone (#3612: salary; this guard: rates and prices too).
 *
 * The rule: no catalogue value under a placeholder-style key names a sum of
 * money or sits in a salary / rate / price / pay field with a figure in it;
 * no hard-coded numeric `placeholder` of three or more digits in the app.
 * Format hints that are not money ("0.00" decimals, "+370 …", "e.g. 7.5"
 * hours) are not money and stay allowed.
 */
const ROOT = resolve(__dirname, "../..");
const MESSAGES = join(ROOT, "messages");
const ACTIVE = ["lt", "en", "ru", "pl", "de", "nl", "sv"];

function values(node: unknown, prefix = "", out: [string, string][] = []): [string, string][] {
  if (typeof node === "string") out.push([prefix, node]);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) values(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const MONEY = /(\d[\d\s.,]*\s*(€|eur\b|eur\/|zł|pln|kr\b|sek|nok)|€\s*\d)/iu;
const MONEY_FIELD = /(salary|rate|price|pay|wage|alga|kaina)/iu;

describe("Guard: no example money figures in placeholders", () => {
  for (const loc of ACTIVE) {
    it(`${loc}: no placeholder names a sum of money`, () => {
      const cat = JSON.parse(readFileSync(join(MESSAGES, `${loc}.json`), "utf8"));
      const hits = values(cat)
        .filter(([k]) => /placeholder/i.test(k))
        .filter(([k, v]) => MONEY.test(v) || (MONEY_FIELD.test(k) && /\d/.test(v)))
        .map(([k, v]) => `${k} = ${v}`);
      expect(hits).toEqual([]);
    });
  }

  it("no hard-coded numeric placeholder of three or more digits in the app", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules") walk(p);
        } else if (e.name.endsWith(".tsx")) {
          const src = readFileSync(p, "utf8");
          for (const m of src.matchAll(/placeholder="(\d{3,}[^"]*)"/g)) hits.push(`${p.slice(ROOT.length + 1)}: ${m[1]}`);
        }
      }
    };
    walk(join(ROOT, "components"));
    walk(join(ROOT, "app"));
    expect(hits).toEqual([]);
  });
});
