/**
 * Universal work-abroad positioning guard.
 *
 * The /work-abroad page is ONE opportunity path (working across Europe), not the
 * platform's definition. Its copy must never redefine the whole platform as a
 * labour-force / staffing agency or a job board, and must not frame worker
 * onboarding around "trade/craft" instead of "profession". Part of the
 * Universal Labour-Market Realignment (owner directive 2026-07-17).
 *
 * Complements universal-canonical-definition (the constitution/BRAND_SEO layer)
 * and public-trust-positioning (hero/footer). This one pins the work-abroad
 * namespace copy across the active locales.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

const webRoot = resolve(__dirname, "..", "..");

function workAbroad(locale: string): Record<string, unknown> {
  const json = JSON.parse(
    readFileSync(resolve(webRoot, "messages", `${locale}.json`), "utf-8"),
  ) as { workAbroad?: Record<string, unknown> };
  return json.workAbroad ?? {};
}

/** Platform-as-agency / job-board self-definition, any active locale. */
const AGENCY_IDENTITY: RegExp[] = [
  /labour[- ]force agency/i,
  /staffing agency/i,
  /\bjob board\b/i,
  /darbo jėgos agentūra/i,
  /įdarbinimo agentūra/i,
  /агентство рабочей силы/i,
  /кадровое агентство/i,
  /arbeidsbureau/i,
  /uitzendbureau/i,
  /Arbeitskräfte-Agentur/i,
  /Personalagentur/i,
];

describe("work-abroad copy does not redefine the platform as an agency", () => {
  it.each(activeLocales as readonly string[])(
    "%s work-abroad namespace carries no agency/job-board self-definition",
    (locale) => {
      const wa = workAbroad(locale);
      if (Object.keys(wa).length === 0) return; // namespace absent for locale
      const text = JSON.stringify(wa);
      for (const re of AGENCY_IDENTITY) {
        expect(re.test(text), `${locale} work-abroad matched ${re}`).toBe(false);
      }
    },
  );

  it.each(activeLocales as readonly string[])(
    "%s onboarding step asks for a profession, not a trade/craft",
    (locale) => {
      const wa = workAbroad(locale);
      const steps = wa.steps as Array<{ title?: string }> | undefined;
      if (!steps || steps.length === 0) return;
      const first = (steps[0]?.title ?? "").toLowerCase();
      // The narrowed forms this replaced: EN "your trade", LT "amatą",
      // NL "je vak", DE "Ihr Gewerk". A profession word must be present.
      const professionWord =
        /profession|profesij|beroep|beruf|профес/i.test(first);
      expect(
        professionWord,
        `${locale} work-abroad step 1 must ask for a profession, got: "${first}"`,
      ).toBe(true);
    },
  );
});
