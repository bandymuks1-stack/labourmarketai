import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal server-action error i18n — source guards.
 *
 * Defect (PR-D): `lib/journal/actions.ts` returned raw hardcoded Lithuanian
 * error strings from its server actions ("Sesija nutrūko…", "Aprašykite ką
 * dirbote…", …), so EVERY locale saw Lithuanian copy. The repair routes all
 * user-facing error messages through next-intl (`journal.errors.*`), the same
 * server pattern sibling actions use (skill-pipeline-actions,
 * conversation/find-work).
 *
 * These guards pin the repair:
 *   1. no Lithuanian-alphabet characters remain inside STRING LITERALS of the
 *      journal action modules (comments excluded — doc comments may quote LT
 *      copy freely);
 *   2. actions.ts actually resolves its messages via getTranslations over the
 *      `journal.errors` namespace;
 *   3. the `journal.errors` key set exists — identically — in all 11 message
 *      catalogs (doctrine §2.4: new i18n keys land in all 11 in the same PR).
 */

const APP = process.cwd();
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

/** Journal server-action modules that must stay free of hardcoded LT copy. */
const ACTION_MODULES = [
  "lib/journal/actions.ts",
  "lib/journal/confirm-actions.ts",
  "lib/journal/journal-ai-suggestions-actions.ts",
  "lib/journal/journal-entry-skills-actions.ts",
  "lib/journal/quick-confirm-actions.ts",
  "lib/journal/review-actions.ts",
  "lib/journal/skill-pipeline-actions.ts",
];

const LT_ALPHABET = /[ąčęėįšųūž]/i;

/**
 * Collect string literals ('…', "…", `…`) from TS source, skipping line and
 * block comments. A tiny scanner (not a full parser): good enough for these
 * modules, which keep regex literals free of quote characters.
 */
function lithuanianStringLiterals(src: string): string[] {
  const found: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      let literal = "";
      while (j < n && src[j] !== quote) {
        if (src[j] === "\\") {
          literal += src[j] + (src[j + 1] ?? "");
          j += 2;
          continue;
        }
        literal += src[j];
        j++;
      }
      if (LT_ALPHABET.test(literal)) found.push(literal);
      i = j + 1;
    } else {
      i++;
    }
  }
  return found;
}

describe("1 · journal action modules carry no hardcoded Lithuanian strings", () => {
  for (const rel of ACTION_MODULES) {
    it(`${rel} has no Lithuanian-alphabet string literals outside comments`, () => {
      const offenders = lithuanianStringLiterals(read(rel));
      expect(
        offenders,
        `hardcoded Lithuanian copy found in ${rel}:\n  ${offenders.join("\n  ")}\n` +
          "Route the message through next-intl (journal.errors.*) instead.",
      ).toEqual([]);
    });
  }
});

describe("2 · actions.ts localizes errors via next-intl", () => {
  const actions = read("lib/journal/actions.ts");
  it("imports getTranslations from next-intl/server", () => {
    expect(actions).toMatch(
      /import \{[^}]*getTranslations[^}]*\} from "next-intl\/server"/,
    );
  });
  it("resolves the journal.errors namespace", () => {
    expect(actions).toMatch(/getTranslations\("journal\.errors"\)/);
  });
});

describe("3 · journal.errors keys exist in all 11 locale catalogs", () => {
  // Doctrine §2.4 canonical 11-locale set (lib/i18n/config.ts).
  const LOCALES = [
    "en",
    "lt",
    "lv",
    "et",
    "nl",
    "de",
    "da",
    "no",
    "sv",
    "pl",
    "ru",
  ] as const;

  const ltErrors = JSON.parse(read("messages/lt/journal.json")).errors as Record<
    string,
    string
  >;

  it("lt defines a non-empty journal.errors namespace", () => {
    expect(ltErrors).toBeTruthy();
    expect(Object.keys(ltErrors).length).toBeGreaterThan(0);
  });

  for (const locale of LOCALES) {
    it(`${locale}/journal.json errors has the full lt key set, non-empty`, () => {
      const errors = JSON.parse(read(`messages/${locale}/journal.json`))
        .errors as Record<string, string> | undefined;
      expect(errors, `${locale}: journal.errors namespace missing`).toBeTruthy();
      for (const key of Object.keys(ltErrors)) {
        const value = errors?.[key];
        expect(
          typeof value === "string" && value.trim().length > 0,
          `${locale}: journal.errors.${key} missing or empty`,
        ).toBe(true);
      }
    });
  }

  it("every key used by actions.ts exists in the lt catalog", () => {
    const actions = read("lib/journal/actions.ts");
    // The journal.errors translator is always bound to a `t(` call site.
    const used = [...actions.matchAll(/\bt\("([A-Za-z0-9]+)"/g)].map(
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) {
      expect(ltErrors[key], `journal.errors.${key} missing in lt`).toBeTruthy();
    }
  });
});
