import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W7-S5 — worker self-declaration voice.
 *
 * ONE rule, for the strings a worker reads about THEMSELVES while editing
 * their own profile:
 *
 *   the worker speaks in the FIRST PERSON, and no string assumes their gender.
 *
 * Before this slice the same form mixed three voices. `workerPrefs` v1 said
 * "Galiu persikelti" / "I am willing…" (the worker speaking) while v2 said
 * "Gali dirbti…" / "Has own vehicle" (someone describing a candidate), and the
 * CV-import review chips the same worker sees a few sections away used the
 * record voice throughout. A person filling in their own profile was reading a
 * dossier about themselves.
 *
 * SCOPE — two namespaces, both self-declaration:
 *   - `workerPrefs` (+ `workerPrefs.v2`) — the preference form on
 *     `/dashboard/profile`;
 *   - `cvImport.availabilityKeys` — the chips in `cv-import-section-review`,
 *     where the worker confirms what was parsed from their OWN CV.
 *
 * DELIBERATELY OUT OF SCOPE: `conversation.forms.fields`, which asks the
 * worker QUESTIONS ("Have your own transport?"). Second person is correct for
 * a question and is internally consistent, so it is a different register, not
 * the same defect. Pinned below so a later slice does not "fix" it by mistake.
 *
 * Meaning is never changed by this rule: "willing to" stays willingness and
 * "can" stays capability. Only the grammatical person moves.
 */

const messagesDir = join(__dirname, "..", "..", "messages");
const LOCALES = ["lt", "en", "de", "nl", "ru"] as const;

function load(locale: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(messagesDir, `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
}

/** The self-declaration strings, flattened per locale. */
function selfDeclarations(locale: string): Record<string, string> {
  const m = load(locale);
  const prefs = (m.workerPrefs ?? {}) as Record<string, unknown>;
  const v2 = (prefs.v2 ?? {}) as Record<string, unknown>;
  const cv = ((m.cvImport ?? {}) as Record<string, unknown>)
    .availabilityKeys as Record<string, unknown> | undefined;

  const out: Record<string, string> = {};
  // Only the STATEMENT keys — titles, hints, buttons and status messages are
  // instructions and system feedback, not the worker's own claims.
  const statementKeys = [
    "willingToRelocate",
    "needsAccommodation",
    "hasTransport",
    "teamAvailable",
    "soloAvailable",
  ];
  const v2StatementKeys = [
    "nightShifts",
    "weekendShifts",
    "overtime",
    "ownVehicle",
    "ownTools",
  ];
  for (const k of statementKeys) {
    if (typeof prefs[k] === "string") out[`workerPrefs.${k}`] = prefs[k] as string;
  }
  for (const k of v2StatementKeys) {
    if (typeof v2[k] === "string") out[`workerPrefs.v2.${k}`] = v2[k] as string;
  }
  for (const k of Object.keys(cv ?? {})) {
    if (typeof cv?.[k] === "string")
      out[`cvImport.availabilityKeys.${k}`] = cv[k] as string;
  }
  return out;
}

/**
 * Third-person / record-voice openings, per locale. These are the exact shapes
 * the slice removed — a string starting this way is describing the worker
 * rather than being written by them.
 */
const RECORD_VOICE: Record<string, RegExp[]> = {
  // "Gali dirbti…", "Turi nuosavą…" — 3rd person singular.
  lt: [/^Gali\s/, /^Turi\s/, /^Reikalingas\s/],
  // "Has own…", "Needs…", and the bare "Can …" / "Willing …" record label.
  en: [/^Has\s/, /^Needs\s/, /^Can\s/, /^Willing\s/],
  // "Hat eigenes…", "Benötigt…", bare "Kann …" / "Bereit,…".
  de: [/^Hat\s/, /^Benötigt\s/, /^Kann\s/, /^Bereit[,\s]/, /vorhanden$/],
  // "Heeft…", bare "Kan …" / "Bereid …".
  nl: [/^Heeft\s/, /^Kan\s/, /^Bereid\s/],
  // "Может работать…", "Есть …", masculine-only "Готов " without "(а)".
  ru: [/^Может\s/, /^Есть\s/, /^Нужно\s/, /^Готов\s/],
};

/**
 * First-person openings that satisfy the rule, per locale.
 *
 * `\b` is ASCII-only in JavaScript regex, so it does NOT match after a
 * Cyrillic letter — the Russian rule ends with an explicit space-or-end
 * instead. Same reason the Lithuanian alternatives are all ASCII-initial.
 */
const FIRST_PERSON: Record<string, RegExp> = {
  lt: /^(Galiu|Turiu|Man)(\s|$)/,
  en: /^I(\s|$)/,
  de: /^Ich(\s|$)/,
  nl: /^Ik(\s|$)/,
  ru: /^(Могу|Готов\(а\)|У меня|Мне)(\s|$)/,
};

describe("W7-S5 — the worker's own claims are written in the first person", () => {
  for (const locale of LOCALES) {
    it(`${locale}: no self-declaration is in the record voice`, () => {
      const offenders: string[] = [];
      for (const [path, value] of Object.entries(selfDeclarations(locale))) {
        if (RECORD_VOICE[locale].some((rx) => rx.test(value))) {
          offenders.push(`${path} = ${JSON.stringify(value)}`);
        }
      }
      expect(offenders, `${locale} record-voice strings`).toEqual([]);
    });

    it(`${locale}: every self-declaration opens in the first person`, () => {
      const offenders: string[] = [];
      for (const [path, value] of Object.entries(selfDeclarations(locale))) {
        if (!FIRST_PERSON[locale].test(value)) {
          offenders.push(`${path} = ${JSON.stringify(value)}`);
        }
      }
      expect(offenders, `${locale} non-first-person strings`).toEqual([]);
    });

    it(`${locale}: the full statement set is present (no silent key loss)`, () => {
      // 5 v1 + 5 v2 + 4 CV-review chips. If a key disappears, the two rules
      // above would pass vacuously for it.
      expect(Object.keys(selfDeclarations(locale)).length).toBe(14);
    });
  }
});

describe("W7-S5 — gendered self-descriptions are gone", () => {
  it("lt: no masculine-only adjective in the worker's own claims", () => {
    const all = Object.values(selfDeclarations("lt")).join(" | ");
    // "Galiu dirbti vienas" reads as male-only to every woman using the
    // product; the replacement states the same fact without a gender.
    expect(all).not.toMatch(/\bvienas\b/);
  });

  it("ru: willingness is gender-inclusive everywhere it appears", () => {
    for (const [path, value] of Object.entries(selfDeclarations("ru"))) {
      if (/Готов/.test(value)) {
        expect(value, `${path} must use the inclusive form`).toMatch(
          /Готов\(а\)/,
        );
      }
    }
  });
});

describe("W7-S5 — scope boundary is deliberate", () => {
  it("chat form fields stay in the SECOND person (questions, not claims)", () => {
    // A question addressed to the worker is correctly second person. This is
    // pinned so a later voice sweep does not mistake it for the same defect.
    const en = load("en") as {
      conversation?: { forms?: { fields?: Record<string, string> } };
    };
    const fields = en.conversation?.forms?.fields ?? {};
    // W7 transport reconciliation: the wording moved from ownership ("your
    // own transport") to mobility ("get to work on your own") — still a
    // second-person question, which is what this boundary pins.
    expect(fields.hasTransport).toMatch(/^Can you .*\?$/);
    expect(fields.willingToRelocate).toMatch(/\?$/);
  });

  it("the preference form's instructions still ADDRESS the worker", () => {
    // The hint tells the worker what to do — second person is right there.
    // Only the checkbox claims are first person, and the two must not be
    // conflated by a future sweep.
    const en = load("en") as { workerPrefs?: { hint?: string } };
    expect(en.workerPrefs?.hint).toMatch(/applies to you/);
  });
});
