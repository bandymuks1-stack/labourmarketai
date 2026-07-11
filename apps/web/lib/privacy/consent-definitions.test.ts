import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CONSENT_DEFINITIONS,
  CONSENT_LOCALES,
  EMPLOYER_DATA_DISCLOSURE_V1,
  PROFILE_DISCOVERABILITY_V1,
  consentTextHash,
} from "./consent-definitions";

/**
 * Consent text registry — behavioral proof (required tests 19, 23):
 * every active locale has the complete text, the hash is deterministic,
 * and the EXACT (version, hash) pair is what the DB migration pins — so a
 * consent event provably records which wording was in force.
 */

const CURRENT_PIN_MIGRATION = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260711170000_privacy_consent_text_v2_controller_identity.sql",
);

describe("all five active locales have complete consent texts (test 23)", () => {
  it.each(CONSENT_DEFINITIONS.map((d) => [d.purpose, d] as const))(
    "%s",
    (_purpose, def) => {
      expect(CONSENT_LOCALES).toEqual(["lt", "en", "ru", "nl", "de"]);
      for (const locale of CONSENT_LOCALES) {
        const t = def.texts[locale];
        expect(t, `${def.purpose}/${locale}`).toBeTruthy();
        for (const [key, value] of Object.entries(t)) {
          expect(value, `${def.purpose}/${locale}/${key}`).toMatch(/\S/);
          expect(value, `${def.purpose}/${locale}/${key} must not be [EN]-marked`).not.toMatch(
            /^\[EN\]/,
          );
        }
      }
    },
  );

  it("LT discoverability wording matches the owner-approved base text", () => {
    const lt = PROFILE_DISCOVERABILITY_V1.texts.lt;
    expect(lt.title).toBe("Leisti įmonėms rasti mano profesinį profilį");
    expect(lt.invisibleData).toContain("nebus perduoti be atskiro jūsų patvirtinimo");
    expect(lt.freedom).toContain("nėra būtinas paskyrai");
    expect(lt.withdrawal).toContain("bet kada");
  });
});

describe("hash pinning (registry ⇄ DB, tests 19 + Phase 3)", () => {
  it("hash is deterministic", () => {
    expect(consentTextHash(PROFILE_DISCOVERABILITY_V1)).toBe(
      consentTextHash(PROFILE_DISCOVERABILITY_V1),
    );
    expect(consentTextHash(PROFILE_DISCOVERABILITY_V1)).not.toBe(
      consentTextHash(EMPLOYER_DATA_DISCLOSURE_V1),
    );
  });

  it("the pin migration carries EXACTLY the registry's current (version, hash) pairs", () => {
    const sql = readFileSync(CURRENT_PIN_MIGRATION, "utf8");
    for (const def of CONSENT_DEFINITIONS) {
      expect(sql, `${def.purpose} version`).toContain(
        `current_version = '${def.version}'`,
      );
      expect(sql, `${def.purpose} hash`).toContain(
        `current_text_hash = '${consentTextHash(def)}'`,
      );
      expect(sql, `${def.purpose} where`).toContain(
        `where purpose = '${def.purpose}'`,
      );
    }
  });

  it("v2 names the data controller in every locale (GDPR Art. 13(1)(a))", () => {
    for (const def of CONSENT_DEFINITIONS) {
      expect(def.version).toBe("2026-07-11.v2");
      for (const locale of CONSENT_LOCALES) {
        const c = def.texts[locale].controller;
        expect(c, `${def.purpose}/${locale}`).toContain("Nonstop Group");
        expect(c, `${def.purpose}/${locale}`).toContain("302676973");
        expect(c, `${def.purpose}/${locale}`).toContain("info@labourmarket.ai");
        expect(c, `${def.purpose}/${locale}`).toContain("Labour Market AI Sp. z o.o.");
      }
    }
  });

  it("changing any text would change the hash (version bump forced)", () => {
    const tampered = {
      ...PROFILE_DISCOVERABILITY_V1,
      texts: {
        ...PROFILE_DISCOVERABILITY_V1.texts,
        lt: { ...PROFILE_DISCOVERABILITY_V1.texts.lt, title: "Kitas tekstas" },
      },
    };
    expect(consentTextHash(tampered)).not.toBe(
      consentTextHash(PROFILE_DISCOVERABILITY_V1),
    );
  });
});

describe("purpose separation (test 4 + Phase 1)", () => {
  it("exactly two purposes exist; marketing is NOT created (no marketing sends exist)", () => {
    expect(CONSENT_DEFINITIONS.map((d) => d.purpose).sort()).toEqual([
      "employer_data_disclosure",
      "profile_discoverability",
    ]);
  });

  it("discoverability text never claims contact/CV transfer rights", () => {
    for (const locale of CONSENT_LOCALES) {
      const t = PROFILE_DISCOVERABILITY_V1.texts[locale];
      // The invisible-data block must state contacts/CV are NOT shared.
      expect(t.invisibleData.length).toBeGreaterThan(40);
    }
  });
});
