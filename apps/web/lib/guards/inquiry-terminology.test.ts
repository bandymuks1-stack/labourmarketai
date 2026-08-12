import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * INQUIRY terminology (owner product-language decision, PUBLIC BETA TRAIN V6 §4).
 *
 * A request an employer submits into the marketplace is user-facing called an
 * INQUIRY, not a "need". The employer transaction chain — the public
 * /company-need form, the readback of submitted requests, the concierge offer
 * and the company operations entry — must read naturally as an inquiry in
 * every ACTIVE locale.
 *
 * WHAT THIS GUARD DOES NOT DO
 * ---------------------------
 * It is deliberately NOT a global "need" ban. Three categories are legitimate
 * and are left alone by design (V6 §4 B/C/D):
 *
 *  B. Ordinary language — "Describe the people you need", "Some details need
 *     fixing", German "bei Bedarf" (= if required). These are verbs and
 *     idioms, not the noun for a submitted request. The EN patterns below
 *     match noun PHRASES only, and the DE pattern carves out "bei Bedarf".
 *
 *  C. Technical identifiers — the i18n KEYS (`companyNeed.*`, `needsCta`,
 *     `needStructuring.*`), DB columns, analytics event names and the
 *     /company-need route itself are persisted or cross-system contracts.
 *     Renaming them is a migration, not a copy change; backward compatibility
 *     beats cosmetic internal consistency. This guard reads VALUES only.
 *
 *  D. Requirements/demand semantics — "Sector & work type needed",
 *     "Headcount needed" describe what the work requires, not the submitted
 *     request, and keep their own wording.
 *
 * FROZEN SURFACES ARE OUT OF SCOPE. `hero`, `landing`, `marketPulse` and the
 * rest of FROZEN_LANDING_NAMESPACES are owner-gated by lib/guards/landing-freeze.ts;
 * lt.hero.businessLink is byte-identical to lt.conciergeOffer.banner.cta, so a
 * naive value-level replace across the catalog WOULD have silently broken the
 * landing freeze. Landing/marketing terminology is a separate owner decision.
 */

const APP_ROOT = join(__dirname, "..", "..");

/** Active locales only — the 6 non-active catalogs are partial by design. */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

/** The employer inquiry transaction chain converted in this slice. */
const INQUIRY_NAMESPACES = [
  "companyNeed",
  "demandReadback",
  "conciergeOffer",
  "companyOps",
] as const;

/**
 * Per-locale legacy request-noun patterns. LT/RU/NL tolerate ZERO occurrences
 * inside these namespaces — their legacy nouns (poreikis / потребность,
 * заявка / behoefte) share no stem with the ordinary verb, so any hit is a
 * real regression. DE carves out the idiom; EN matches noun phrases only.
 */
const LEGACY: Record<
  (typeof ACTIVE_LOCALES)[number],
  { re: RegExp; allow?: RegExp; term: string }
> = {
  lt: { re: /poreik/i, term: "poreikis → užklausa" },
  ru: { re: /потребност|заявк/i, term: "потребность/заявка → запрос" },
  nl: { re: /behoeft/i, term: "behoefte → aanvraag" },
  de: { re: /bedarf/i, allow: /bei Bedarf/, term: "Bedarf → Anfrage" },
  en: {
    // `[-\s]` so the hyphenated compound ("company-need queue") is caught too.
    re: /\b(?:company|work|worker|workforce|staffing)[-\s]+needs?\b|\b(?:new|submitted|open|closed|structured|public|anonymous)\s+needs?\b|\b(?:submit|create|post|start|describe|open|your|this|the|a)\s+(?:a\s+|your\s+|the\s+)?needs?\b|\bneeds?\s+(?:from|received|is prepared|submitted|stay private)\b/i,
    term: "need (noun) → inquiry",
  },
};

type Json = Record<string, unknown>;

const load = (locale: string): Json =>
  JSON.parse(
    readFileSync(join(APP_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as Json;

function collectStrings(
  node: unknown,
  path: string,
  out: { path: string; value: string }[],
): void {
  if (typeof node === "string") {
    out.push({ path, value: node });
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

describe("employer inquiry surfaces use INQUIRY terminology", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: no legacy request-noun in the inquiry transaction chain`, () => {
      const messages = load(locale);
      const { re, allow, term } = LEGACY[locale];
      const offenders: string[] = [];

      for (const namespace of INQUIRY_NAMESPACES) {
        const subtree = messages[namespace];
        expect(subtree, `${locale}: missing namespace ${namespace}`).toBeTruthy();

        const strings: { path: string; value: string }[] = [];
        collectStrings(subtree, namespace, strings);

        for (const { path, value } of strings) {
          // Strip the documented ordinary-language idiom before testing.
          const probe = allow ? value.replace(new RegExp(allow, "gi"), "") : value;
          if (re.test(probe)) offenders.push(`${path}: "${value}" → ${term}`);
        }
      }

      expect(
        offenders,
        `legacy request-noun found in ${locale}:\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});

describe("the inquiry noun is actually present (not just absent)", () => {
  /** A guard that only bans a word passes on an empty catalog. Assert the
   *  positive term really renders, so deleting the copy cannot go green. */
  const EXPECTED: Record<(typeof ACTIVE_LOCALES)[number], RegExp> = {
    lt: /užklaus/i,
    en: /inquir/i,
    ru: /запрос/i,
    nl: /aanvraag|aanvragen/i,
    de: /anfrage/i,
  };

  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: /company-need form and readback name the inquiry`, () => {
      const messages = load(locale);
      const re = EXPECTED[locale];

      for (const namespace of ["companyNeed", "demandReadback"] as const) {
        const strings: { path: string; value: string }[] = [];
        collectStrings(messages[namespace], namespace, strings);
        const hits = strings.filter(({ value }) => re.test(value));
        expect(
          hits.length,
          `${locale}.${namespace}: expected the inquiry noun (${re}) to appear`,
        ).toBeGreaterThan(0);
      }
    });
  }
});

describe("technical identifiers are NOT renamed (V6 §4C)", () => {
  it("the i18n keys keep their legacy names in every active locale", () => {
    for (const locale of ACTIVE_LOCALES) {
      const messages = load(locale);
      // Keys are a cross-file contract with the components that read them.
      expect(messages.companyNeed, `${locale}: companyNeed key`).toBeTruthy();
      const ops = messages.companyOps as Json;
      expect(ops.needsTitle, `${locale}: companyOps.needsTitle key`).toBeTruthy();
      expect(ops.needsCta, `${locale}: companyOps.needsCta key`).toBeTruthy();
    }
  });
});
