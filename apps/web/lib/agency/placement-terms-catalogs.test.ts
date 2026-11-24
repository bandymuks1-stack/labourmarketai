import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { activeLocales, locales } from "@/lib/i18n/config";

/**
 * The agency placement term's copy is in every catalog (doctrine §2.4: new UI
 * keys land in all 11 full-UI catalogs in the same PR). An inactive catalog
 * may hold an `[EN]` placeholder; an active one says it in its own language.
 */
const web = path.resolve(__dirname, "../..");
const catalog = (locale: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(web, "messages", `${locale}.json`), "utf8"));

function at(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function leaves(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, leaves(v, key));
  }
  return out;
}

const NAMESPACES = ["agencySuggestion", "agencyPlacementTerm", "scoutingAgencyOffers.placementTerm"] as const;
const english = Object.fromEntries(NAMESPACES.map((ns) => [ns, leaves(at(catalog("en"), ns))]));

describe("the placement term's copy is in every catalog", () => {
  for (const ns of NAMESPACES) {
    it(`${ns} exists in English`, () => {
      expect(Object.keys(english[ns]!).length).toBeGreaterThan(0);
    });
  }

  for (const locale of locales) {
    it(`${locale} carries every key`, () => {
      for (const ns of NAMESPACES) {
        const lines = leaves(at(catalog(locale), ns));
        expect(Object.keys(lines).sort(), `${locale}: ${ns}`).toEqual(Object.keys(english[ns]!).sort());
      }
    });
  }

  for (const locale of activeLocales.filter((l) => l !== "en")) {
    it(`${locale} (active) says it in its own language`, () => {
      for (const ns of NAMESPACES) {
        for (const [k, v] of Object.entries(leaves(at(catalog(locale), ns)))) {
          expect(v.startsWith("[EN]"), `${locale}: ${ns}.${k}`).toBe(false);
          expect(v, `${locale}: ${ns}.${k}`).not.toBe(english[ns]![k]);
        }
      }
    });
  }
});
