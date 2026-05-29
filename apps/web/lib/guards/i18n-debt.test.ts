import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  I18N_DEBT_BASELINE,
  PRIMARY_LOCALES,
  TRACKED_LOCALES,
  debtRegressions,
  scanI18nDebt,
} from "./i18n-debt";

/**
 * DA/DE i18n untranslated-key debt RATCHET guard.
 *
 * Existing `[EN]` debt is allowed (recorded as the baseline). The guard fails
 * `pnpm -F web test` only if:
 *   - DA or DE grows ABOVE its baseline (new untranslated strings shipped), or
 *   - a primary locale (en / lt) regresses to show any `[EN]` marker.
 *
 * Lowering the debt via real human translation always passes. The same scan
 * powers the owner report via `pnpm -F web check:i18n-debt`.
 */

// lib/guards -> apps/web
const webRoot = resolve(__dirname, "..", "..");
const report = scanI18nDebt(webRoot);

describe("i18n debt ratchet — tracked locales (DA/DE)", () => {
  for (const locale of TRACKED_LOCALES) {
    const debt = report.tracked.find((d) => d.locale === locale)!;
    const baseline = I18N_DEBT_BASELINE[locale]!;

    it(`${locale}: untranslated [EN] count does not exceed baseline ${baseline}`, () => {
      expect(
        debt.total,
        `${locale} has ${debt.total} untranslated keys, baseline is ${baseline}. ` +
          `If you added strings, translate them or do not ship [EN]. ` +
          `If you translated some, lower the baseline in i18n-debt.ts.`,
      ).toBeLessThanOrEqual(baseline);
    });
  }
});

describe("i18n debt ratchet — primary locales stay fully translated", () => {
  for (const { locale, total } of report.primary) {
    it(`${locale}: has zero [EN] markers`, () => {
      expect(total, `${locale} regressed: ${total} [EN] marker(s) appeared`).toBe(0);
    });
  }
});

describe("i18n debt ratchet — overall", () => {
  it("has no build-blocking regressions", () => {
    const regressions = debtRegressions(report);
    const detail = regressions
      .map((r) => `  ${r.locale}: ${r.kind} (current ${r.current} vs baseline ${r.baseline})`)
      .join("\n");
    expect(regressions, `\nRegressions:\n${detail}`).toEqual([]);
  });

  it("baseline covers every tracked locale", () => {
    for (const locale of TRACKED_LOCALES) {
      expect(I18N_DEBT_BASELINE[locale], `missing baseline for ${locale}`).toBeTypeOf("number");
    }
  });

  it("primary locales are the fully-translated set", () => {
    expect([...PRIMARY_LOCALES]).toEqual(["en", "lt"]);
  });
});
