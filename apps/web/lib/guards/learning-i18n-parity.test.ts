import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 learning — i18n parity guard (active locales lt/en/ru).
 *
 * `learning` is an active-locale app namespace. Every leaf key must exist and be
 * non-empty in all three active locales, so the learning surface never renders a
 * raw key or an English string in LT/RU.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE = ["en", "lt", "ru"] as const;

function leafPaths(obj: unknown, path = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof obj === "string") {
    out.set(path, obj);
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      for (const [p, val] of leafPaths(v, path ? `${path}.${k}` : k)) out.set(p, val);
    }
  }
  return out;
}

const blocks = Object.fromEntries(
  ACTIVE.map((loc) => [
    loc,
    leafPaths((JSON.parse(read(`messages/${loc}.json`)) as { learning?: unknown }).learning ?? {}),
  ]),
) as Record<(typeof ACTIVE)[number], Map<string, string>>;

describe("learning has full key parity across active locales", () => {
  const enKeys = [...blocks.en.keys()].sort();

  it("en defines a non-trivial set of keys", () => {
    expect(enKeys.length).toBeGreaterThan(15);
  });

  for (const loc of ACTIVE) {
    it(`${loc}: same key set as en, every value non-empty`, () => {
      expect([...blocks[loc].keys()].sort()).toEqual(enKeys);
      for (const [p, v] of blocks[loc]) {
        expect(v.trim().length, `${loc}.${p}`).toBeGreaterThan(0);
      }
    });
  }
});
