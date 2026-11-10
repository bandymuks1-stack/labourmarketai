import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeLocales } from "@/lib/i18n/config";

/**
 * PUBLIC COPY: ONE LANGUAGE, NO WORK-IN-PROGRESS LABELS (owner P0 2026-11-10,
 * SEO/AEO/GEO + acquisition).
 *
 * A production scan of the public pages in the six active languages found
 * English left inside translated pages: the German pricing page named a plan
 * "Free Worker", and the DE/NL/PL plan cards said "Agency". A visitor from a
 * search result reads that as an unfinished site, and a search engine reads
 * it as a mixed-language page.
 *
 * Two rules over the namespaces that public (signed-out) pages render:
 *   1. a non-English catalog value may not be the English value verbatim,
 *      unless it is a word the language genuinely shares (listed below);
 *   2. no value may carry a work-in-progress label ("AI draft", "pending
 *      review", "TODO", "lorem", "[EN]" …). Saying honestly that the
 *      assistant prepares a draft the person reviews is fine; a bare label
 *      is not.
 */
const MESSAGES = join(__dirname, "..", "..", "messages");

const PUBLIC_NAMESPACES = [
  "landing",
  "pages",
  "pricing",
  "planBoundary",
  "companyNeed",
  "workerIntake",
  "footer",
] as const;

/** Words the language really uses as they are in English. */
const SHARED_WORDS: Record<string, readonly string[]> = {
  de: ["Transport", "Enterprise", "Admin"],
  nl: ["Enterprise", "Admin", "Product", "Contact", "Finland"],
  pl: ["Enterprise", "Estonia"],
  lt: [],
  ru: [],
};

const WIP_LABEL =
  /\bAI draft\b|\bpending review\b|\bawaiting review\b|\bTODO\b|\bTBD\b|\blorem\b|\[EN\]|\bplaceholder\b/i;

function load(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8"));
}

function strings(node: unknown, path: string, out: Map<string, string>): Map<string, string> {
  if (typeof node === "string") out.set(path, node);
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) strings(v, `${path}.${k}`, out);
  return out;
}

const en = load("en");

describe("public pages speak one language", () => {
  for (const locale of activeLocales.filter((l) => l !== "en")) {
    it(`${locale}: no English left in public namespaces`, () => {
      const messages = load(locale);
      const shared = new Set(SHARED_WORDS[locale] ?? []);
      const offenders: string[] = [];
      for (const ns of PUBLIC_NAMESPACES) {
        const ours = strings(messages[ns], ns, new Map());
        for (const [key, english] of strings(en[ns], ns, new Map())) {
          const value = ours.get(key);
          if (value === undefined || value !== english) continue;
          // Brand, codes, units, placeholders-only and URLs are not language.
          if (!/[a-z]{3}/.test(value) || /LabourMarket|https?:|^\{[^}]+\}$/.test(value)) continue;
          if (shared.has(value)) continue;
          offenders.push(`${key} = ${JSON.stringify(value)}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it("the rule catches the English found on production", () => {
    expect("Free Worker").toMatch(/[a-z]{3}/);
    expect(SHARED_WORDS.de).not.toContain("Free Worker");
    expect(SHARED_WORDS.de).not.toContain("Agency");
  });
});

describe("public pages carry no work-in-progress labels", () => {
  it("the pattern catches labels and lets honest wording through", () => {
    for (const bad of ["AI draft", "Pending review", "TODO: copy", "[EN] Live demand,"])
      expect(bad, bad).toMatch(WIP_LABEL);
    for (const fine of [
      "We turn it into a clean vacancy draft you review.",
      "2. AI prepares a draft",
      "For example: welders in Luxembourg",
    ])
      expect(fine, fine).not.toMatch(WIP_LABEL);
  });

  for (const locale of activeLocales) {
    it(`${locale}: no label in public namespaces`, () => {
      const messages = load(locale);
      const offenders: string[] = [];
      for (const ns of PUBLIC_NAMESPACES)
        for (const [key, value] of strings(messages[ns], ns, new Map()))
          if (WIP_LABEL.test(value)) offenders.push(`${key} = ${JSON.stringify(value)}`);
      expect(offenders).toEqual([]);
    });
  }
});
