import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

/**
 * UNTRANSLATED-STRING RATCHET — the gap every existing guard missed.
 *
 * REQ-PLAT-010 (doctrine §2.4: active locales receive real translations in the
 * same PR) was BROKEN for six weeks with **44 RU, 44 NL and 45 DE**
 * `landing.hero.*` values sitting in raw English. Every gate passed the whole
 * time, because they all measure the wrong thing:
 *
 *   * `check:i18n-debt` counts MISSING keys. It reported `ru=0, nl=0, de=0`
 *     while all 44 English strings were present-and-untranslated.
 *   * the parity guards assert the key SETS match, which they did.
 *
 * A key can be present, non-empty, type-correct and still be English. This
 * guard measures that directly: a value byte-identical to the English one.
 *
 * IT IS A RATCHET, NOT A ZERO-ASSERTION. Plenty of identical values are
 * CORRECT — proper nouns (`Jonas P.`), bare numbers (`14`), and real words a
 * language shares with English (German `Demonstration`, Dutch technical
 * loanwords). Classifying all ~674 of them is not this guard's job. Locking in
 * today's number and failing on a regression is.
 *
 * WHEN THIS FAILS: you added an English string to a non-English catalogue.
 * Translate it. Only lower a baseline — never raise one to make the gate pass.
 */

const MESSAGES = resolve(__dirname, "../../messages");

/**
 * Measured on 2026-08-18 at `origin/main` `a9594af2`, after the Russian
 * `landing.hero.*` block was translated under OWNER DECISION U-15 (RU 44→3).
 *
 * NL and DE are recorded at their CURRENT, UNIMPROVED values on purpose. Their
 * translation is written but sits in a separate PR, because U-15 approved the
 * Russian localization specifically and merging both together would implicitly
 * approve marketing wording the owner has not read. When that PR lands it
 * lowers nl to 289 and de to 236.
 *
 * Every one of these numbers is a debt to pay down, not a target.
 */
const BASELINE: Readonly<Record<string, number>> = {
  lt: 83,
  ru: 66,
  nl: 329,
  de: 276,
};

/**
 * The landing hero is pinned tighter than the catalogue as a whole: it is the
 * product's first screen, it is where the defect was found, and its remaining
 * identicals are individually accounted for below.
 */
const HERO_BASELINE: Readonly<Record<string, number>> = {
  lt: 4, // previewName "Jonas P." + the three bare numbers 14 / 3 / 7
  ru: 3, // the three bare numbers — the persona name IS transliterated ("Йонас П.")
  nl: 44, // untranslated; the NL translation is in a separate, owner-review PR
  de: 45, // untranslated; same
};

type Catalogue = Record<string, string>;

function flatten(node: unknown, prefix = "", out: Catalogue = {}): Catalogue {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (typeof node === "string") {
    out[prefix] = node;
  }
  return out;
}

function load(locale: string): Catalogue {
  return flatten(
    JSON.parse(readFileSync(resolve(MESSAGES, `${locale}.json`), "utf8")),
  );
}

const english = load("en");
const nonEnglish = activeLocales.filter((l) => l !== "en");

/** Keys whose value is byte-identical to the English one. */
function identicalKeys(catalogue: Catalogue, filter?: (k: string) => boolean): string[] {
  return Object.keys(english)
    .filter((k) => !filter || filter(k))
    .filter((k) => english[k]!.trim().length > 0 && catalogue[k] === english[k]);
}

describe("untranslated-string ratchet (active locales)", () => {
  it("covers every active non-English locale, so a new locale cannot slip in unmeasured", () => {
    for (const locale of nonEnglish) {
      expect(
        BASELINE[locale],
        `${locale} is an active locale with no ratchet baseline — add one`,
      ).toBeTypeOf("number");
    }
  });

  for (const locale of nonEnglish) {
    it(`${locale}: no MORE English strings than the recorded baseline`, () => {
      const found = identicalKeys(load(locale));
      expect(
        found.length,
        `${locale} has ${found.length} values identical to English, baseline ${BASELINE[locale]}. ` +
          `Translate the new ones — do not raise the baseline. Sample: ${found.slice(0, 8).join(", ")}`,
      ).toBeLessThanOrEqual(BASELINE[locale]!);
    });
  }
});

describe("landing hero — the first screen, pinned tighter", () => {
  const isHero = (k: string) => k.startsWith("landing.hero.");

  for (const locale of nonEnglish) {
    it(`${locale}: hero carries only its accounted-for identical values`, () => {
      const found = identicalKeys(load(locale), isHero);
      expect(
        found.length,
        `${locale} landing.hero has ${found.length} English values, baseline ${HERO_BASELINE[locale]}: ${found.join(", ")}`,
      ).toBeLessThanOrEqual(HERO_BASELINE[locale]!);
    });
  }

  it("the ICU {count} placeholder survives translation in every locale", () => {
    for (const locale of activeLocales) {
      const value = load(locale)["landing.hero.reacting"];
      expect(value, `${locale} is missing landing.hero.reacting`).toBeTypeOf("string");
      expect(
        value,
        `${locale} dropped the {count} placeholder — the string would render a literal`,
      ).toContain("{count}");
    }
  });

  it("the '·' separator survives in the preview role line", () => {
    for (const locale of activeLocales) {
      expect(load(locale)["landing.hero.previewRole"]).toContain("·");
    }
  });
});
