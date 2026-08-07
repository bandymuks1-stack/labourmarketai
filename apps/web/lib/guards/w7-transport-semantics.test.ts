import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W7 — `has_transport` and `own_vehicle` are DISTINCT claims, and the copy
 * must keep them distinct.
 *
 * Canonical semantics (migration `20260711270000_worker_preference_columns_v2.sql`,
 * its own words): `own_vehicle` is "distinct from has_transport, which
 * conflates 'can get to work' with ownership". The schema was deliberate;
 * the COPY was the defect — v1 shipped "I have my own transport" (lt
 * "Turiu nuosavą transportą", de literally "Ich habe ein eigenes Fahrzeug"),
 * indistinguishable from the v2 ownership question one fieldset below.
 *
 * Reconciliation (no migration): has_transport copy states MOBILITY — "can
 * get to work on one's own" — on all three user-visible surfaces (profile
 * prefs form, chat intake field, CV export private details). own_vehicle
 * stays OWNERSHIP. This guard pins both directions so neither drifts back
 * into the other.
 */
const root = join(__dirname, "..", "..");

type Messages = {
  workerPrefs?: { hasTransport?: string; v2?: { ownVehicle?: string } };
  conversation?: { forms?: { fields?: { hasTransport?: string } } };
  cvExport?: { privateDetails?: { transport?: string } };
};

function load(locale: string): Messages {
  return JSON.parse(
    readFileSync(join(root, "messages", `${locale}.json`), "utf8"),
  ) as Messages;
}

/** Per-locale mobility pattern ("get to work") and ownership pattern. */
const MOBILITY: Record<string, RegExp> = {
  en: /get to work/i,
  lt: /atvykti į darbą|atvyksta savarankiškai/i,
  ru: /добира(ться|ется) до работы/i,
  nl: /naar het werk komen/i,
  de: /zur Arbeit kommen/i,
};
const OWNERSHIP: Record<string, RegExp> = {
  en: /own (transport|vehicle|car)/i,
  lt: /nuosav/i,
  ru: /собственн|свой транспорт/i,
  nl: /eigen (vervoer|voertuig|auto)/i,
  de: /eigenes (Fahrzeug|Auto)|eigenen (Wagen|Transport)/i,
};
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

describe("W7 — has_transport copy states mobility, never ownership", () => {
  for (const locale of ACTIVE) {
    const m = load(locale);
    it(`${locale}: profile prefs label`, () => {
      const s = m.workerPrefs?.hasTransport ?? "";
      expect(s, `${locale} workerPrefs.hasTransport`).toMatch(MOBILITY[locale]);
      expect(s).not.toMatch(OWNERSHIP[locale]);
    });
    it(`${locale}: chat intake field label`, () => {
      const s = m.conversation?.forms?.fields?.hasTransport ?? "";
      expect(s, `${locale} chat field`).toMatch(MOBILITY[locale]);
      expect(s).not.toMatch(OWNERSHIP[locale]);
    });
    it(`${locale}: CV export private-details label`, () => {
      const s = m.cvExport?.privateDetails?.transport ?? "";
      expect(s, `${locale} cv export`).toMatch(MOBILITY[locale]);
      expect(s).not.toMatch(OWNERSHIP[locale]);
    });
  }
});

describe("W7 — own_vehicle copy stays ownership, and the two never collide", () => {
  for (const locale of ACTIVE) {
    const m = load(locale);
    it(`${locale}: v2.ownVehicle is an ownership claim`, () => {
      const s = m.workerPrefs?.v2?.ownVehicle ?? "";
      expect(s, `${locale} v2.ownVehicle`).toMatch(OWNERSHIP[locale]);
      expect(s).not.toMatch(MOBILITY[locale]);
    });
    it(`${locale}: the two labels are different sentences`, () => {
      expect(m.workerPrefs?.hasTransport).not.toBe(m.workerPrefs?.v2?.ownVehicle);
    });
  }
});

describe("W7 — the schema doctrine the copy now matches is still on record", () => {
  it("the v2 migration still declares the distinction", () => {
    const sql = readFileSync(
      join(
        root,
        "..",
        "..",
        "supabase",
        "migrations",
        "20260711270000_worker_preference_columns_v2.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/distinct from has_transport/);
  });
});
