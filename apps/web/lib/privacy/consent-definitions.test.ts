import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readdirSync } from "node:fs";

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

const MIGRATIONS_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

/**
 * THE PURPOSE REGISTRY, STATED HERE ON PURPOSE.
 *
 * A purpose is a recipient category plus a use, and adding one is a legal act,
 * not a refactor. Listing them here means a new purpose cannot arrive by being
 * appended to `CONSENT_DEFINITIONS` — someone has to come to this file and say
 * which version they intend, exactly as the api-auth-boundary table forces a
 * decision about a new route.
 *
 * `partner_supply_representation` was added 2026-09-04 for the first-party
 * supply bridge. It is deliberately NOT a reuse of `profile_discoverability`:
 * that purpose names its recipients as companies and agencies ON
 * LabourMarket.ai, and representing someone to employers outside the product is
 * a different recipient category.
 */
const EXPECTED_PURPOSE_VERSIONS: Readonly<Record<string, string>> = {
  profile_discoverability: "2026-07-11.v2",
  employer_data_disclosure: "2026-07-11.v2",
  partner_supply_representation: "2026-09-04.v1",
};

/** Every migration file, so a pin may live in whichever migration introduced
 *  or last bumped its purpose rather than in one hard-coded file. */
function migrationSources(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ name: f, sql: readFileSync(join(MIGRATIONS_DIR, f), "utf8") }));
}

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

  it("a migration pins EXACTLY the registry's current (version, hash) for every purpose", () => {
    // The DB is the enforcement point: the grant RPCs compare the caller's
    // (version, hash) against `privacy_consent_purposes` and refuse a stale
    // pair. A registry entry no migration pins is therefore a purpose nobody
    // can ever consent to, which fails silently at runtime — hence a test.
    //
    // The pair may be pinned by an UPDATE (a version bump) or by the INSERT
    // that introduced the purpose. Both forms are searched, and both halves
    // must appear in the SAME file so a version from one migration cannot be
    // paired with a hash from another.
    const sources = migrationSources();
    for (const def of CONSENT_DEFINITIONS) {
      const hash = consentTextHash(def);
      const pinning = sources.filter(
        ({ sql }) =>
          sql.includes(def.purpose)
          && (sql.includes(`current_version = '${def.version}'`)
            || sql.includes(`'${def.version}'`))
          && (sql.includes(`current_text_hash = '${hash}'`)
            || sql.includes(`'${hash}'`)),
      );
      expect(
        pinning.map((p) => p.name),
        `${def.purpose} @ ${def.version} / ${hash.slice(0, 12)} is pinned by no migration`,
      ).not.toHaveLength(0);
    }
  });

  it("every purpose names the data controller in every locale (GDPR Art. 13(1)(a))", () => {
    for (const def of CONSENT_DEFINITIONS) {
      // The version is asserted against the declared registry above rather than
      // against one literal, so a bump is a deliberate two-place edit and a new
      // purpose still cannot ship at an undeclared version.
      expect(EXPECTED_PURPOSE_VERSIONS[def.purpose], def.purpose).toBe(def.version);
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
  it("exactly the declared purposes exist; marketing is NOT created (no marketing sends exist)", () => {
    expect(CONSENT_DEFINITIONS.map((d) => d.purpose).sort()).toEqual(
      Object.keys(EXPECTED_PURPOSE_VERSIONS).sort(),
    );
  });

  it("no purpose is a marketing purpose", () => {
    // The original invariant, kept as its own assertion rather than riding on a
    // count: the product sends no optional marketing messages, so a marketing
    // consent surface would be asking for a permission nothing uses.
    for (const def of CONSENT_DEFINITIONS) {
      expect(def.purpose).not.toMatch(/marketing|newsletter|promo/i);
      expect(def.recipientCategory).not.toMatch(/marketing/i);
    }
  });

  it("each purpose names a DIFFERENT recipient category", () => {
    // The reason there is more than one purpose at all. Two purposes sharing a
    // recipient category means one of them is doing the other's work, which is
    // how a consent quietly widens.
    const categories = CONSENT_DEFINITIONS.map((d) => d.recipientCategory);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it("discoverability text never claims contact/CV transfer rights", () => {
    for (const locale of CONSENT_LOCALES) {
      const t = PROFILE_DISCOVERABILITY_V1.texts[locale];
      // The invisible-data block must state contacts/CV are NOT shared.
      expect(t.invisibleData.length).toBeGreaterThan(40);
    }
  });
});
