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
 * The RECORDED SET of keys whose value is byte-identical to English, per
 * locale — not a count. Regenerate with
 * `pnpm -F web exec tsx scripts/generate-i18n-untranslated-baseline.ts`, and
 * only ever to record debt you have PAID DOWN.
 *
 * WHY A SET AND NOT A COUNT. A count-only ratchet has a hole that is very
 * likely to be hit exactly while debt is being paid down: translate one
 * existing English value and simultaneously add a NEW one copied from English,
 * and the total is unchanged, so a count comparison passes while an
 * untranslated string ships. Keying on the set closes that — a key that
 * BECOMES identical fails even when the total falls.
 *
 * Recorded 2026-08-18 at `origin/main` `ef25e0f6`, after the Russian
 * `landing.hero.*` block was translated under OWNER DECISION U-15 (RU 107→66)
 * and the Dutch/German hero was translated in this change (NL 329→289,
 * DE 276→236).
 *
 * Every key in this file is a debt to pay down, not a target.
 */
const BASELINE_SETS: Readonly<Record<string, readonly string[]>> = JSON.parse(
  readFileSync(resolve(__dirname, "i18n-untranslated-baseline.json"), "utf8"),
);

/**
 * The landing's first screen is pinned tighter than the catalogue as a
 * whole: it is where the defect was found. Since the frozen design contract
 * (2026-09-05, P1) the first screen is `landing.hero` (headline + sub only)
 * plus `landing.entry` (the public entry: label, examples, the
 * understanding lines, the one question and its two chips, the public
 * numbers). The scripted-scenario keys — and with them the persona name and
 * the bare numbers that were the accounted-for identicals — are gone, so
 * the first screen now carries ZERO English values in any routed locale.
 */
const FIRST_SCREEN_BASELINE: Readonly<Record<string, number>> = {
  lt: 0,
  ru: 0,
  nl: 0,
  de: 0,
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
        BASELINE_SETS[locale],
        `${locale} is an active locale with no recorded baseline — regenerate it`,
      ).toBeDefined();
    }
  });

  for (const locale of nonEnglish) {
    it(`${locale}: no key has BECOME English since the baseline`, () => {
      const recorded = new Set(BASELINE_SETS[locale] ?? []);
      const regressions = identicalKeys(load(locale)).filter((k) => !recorded.has(k));
      expect(
        regressions,
        `${locale}: these keys are now byte-identical to English and were not before. ` +
          `Translate them — do NOT regenerate the baseline to make this pass.`,
      ).toEqual([]);
    });

    it(`${locale}: the baseline records no debt that is already paid`, () => {
      // Keeps the record honest in the other direction: a key that HAS been
      // translated must not linger in the baseline pretending to be debt.
      const current = new Set(identicalKeys(load(locale)));
      const stale = (BASELINE_SETS[locale] ?? []).filter((k) => !current.has(k));
      expect(
        stale,
        `${locale}: these keys are translated but still recorded as untranslated. ` +
          `Regenerate: pnpm -F web exec tsx scripts/generate-i18n-untranslated-baseline.ts`,
      ).toEqual([]);
    });
  }
});

describe("landing first screen (hero + public entry) — pinned tighter", () => {
  const isFirstScreen = (k: string) =>
    k.startsWith("landing.hero.") || k.startsWith("landing.entry.");

  for (const locale of nonEnglish) {
    it(`${locale}: the first screen carries only its accounted-for identical values`, () => {
      const found = identicalKeys(load(locale), isFirstScreen);
      expect(
        found.length,
        `${locale} landing.hero/entry has ${found.length} English values, baseline ${FIRST_SCREEN_BASELINE[locale]}: ${found.join(", ")}`,
      ).toBeLessThanOrEqual(FIRST_SCREEN_BASELINE[locale]!);
    });
  }

  it("the ICU placeholders of the public-numbers line survive translation in every locale", () => {
    for (const locale of activeLocales) {
      const value = load(locale)["landing.entry.numbers"];
      expect(value, `${locale} is missing landing.entry.numbers`).toBeTypeOf("string");
      for (const placeholder of ["{vacancies}", "{employers}"]) {
        expect(
          value,
          `${locale} dropped the ${placeholder} placeholder — the string would render a literal`,
        ).toContain(placeholder);
      }
      expect(load(locale)["landing.entry.refreshed"]).toContain("{date}");
    }
  });

  it("the '·' separator survives in the public-numbers line", () => {
    for (const locale of activeLocales) {
      expect(load(locale)["landing.entry.numbers"]).toContain("·");
    }
  });
});
