import { describe, expect, it } from "vitest";
import {
  entryReturnPath,
  familyForSentence,
  familyOfIntent,
  readPublicEntry,
} from "@/lib/marketing/public-entry";
import { readLandingHandoff } from "@/lib/onboarding/landing-handoff";
import {
  identitiesForIntents,
  nextPathForIntents,
} from "@/lib/onboarding/first-run-intent";

/**
 * A PERSON IMPORTING THEIR OWN HISTORY IS NOT A COMPANY.
 *
 * Owner readiness window, 2026-09-09. Traced end to end before the fix:
 *
 *   "I want to upload my old work history"   → hours-import
 *   "Noriu įkelti savo seną darbo istoriją"  → family `hire`
 *                                            → pre-tick ["hire"]
 *                                            → identity ["company"]
 *                                            → /dashboard/start/company
 *
 * A person saying **MY** work history was signed up as an organisation and
 * asked to create a company — and the chip they were then offered points at
 * `/dashboard/hours?import=1`, whose page header calls it "the operator's
 * daily surface" and which answers `states.noCompany` to anyone without one.
 * SEP-5 (IDENTITY ≠ ROLE) on the first thing the product does with them, and
 * on the journey §7 calls foundational.
 *
 * #1670 built this door two days earlier and was thinking of a person
 * throughout — three of the five sentences in its own docblock carry a
 * first-person possessive. The door was right; the actor behind it was
 * mislabelled.
 *
 * THE WHOLE POINT IS THAT BOTH DIRECTIONS HOLD. Flipping the constant to
 * `work` would only move the error onto the employer typing "import our old
 * timesheets", so every assertion below has its mirror.
 */

const PERSON: ReadonlyArray<readonly [string, string]> = [
  ["en", "I want to upload my old work history"],
  ["lt", "Noriu įkelti savo seną darbo istoriją"],
  ["de", "ich möchte meine alten Arbeitsdaten hochladen"],
  ["nl", "ik wil mijn oude werkgegevens uploaden"],
  ["ru", "хочу загрузить мои старые данные о работе"],
];

const ORGANISATION: ReadonlyArray<readonly [string, string]> = [
  ["en", "import the old timesheets"],
  ["lt", "importuok tabelį"],
  ["de", "Stundenzettel importieren"],
  ["nl", "importeer de urenstaat"],
  ["ru", "загрузи табель"],
  ["en", "we want to upload our old work data"],
  // The reflexive trap: Lithuanian `savo` means "one's OWN" and belongs to
  // whoever the subject is, so it appears in a company's sentence too. An
  // explicit organisational possessive has to win over it.
  ["lt", "mūsų komanda nori įkelti savo senus darbo duomenis"],
  ["de", "wir wollen unsere alten Arbeitsdaten hochladen"],
  ["ru", "мы хотим загрузить наши старые данные о работе"],
];

/** The whole chain the anonymous landing actually runs. */
function identityFor(sentence: string): readonly string[] {
  const handoff = readLandingHandoff(entryReturnPath(sentence) ?? "");
  return identitiesForIntents(handoff.intents);
}

describe("1. the person keeps their own identity", () => {
  it.each(PERSON)("%s: %s", (_loc, sentence) => {
    const reading = readPublicEntry(sentence);
    expect(reading.kind).toBe("recognised");
    if (reading.kind !== "recognised") return;

    // The DOOR is unchanged — #1670's routing was right.
    expect(reading.intent).toBe("hours-import");
    // The actor is not.
    expect(reading.family).toBe("work");
  });

  it.each(PERSON)("%s is never handed a company: %s", (_loc, sentence) => {
    expect(identityFor(sentence)).toEqual(["worker"]);
    const handoff = readLandingHandoff(entryReturnPath(sentence) ?? "");
    expect(nextPathForIntents(handoff.intents)).toBeNull();
  });
});

describe("2. NEGATIVE CONTROL — the employer's sentence is untouched", () => {
  it.each(ORGANISATION)("%s stays an employer: %s", (_loc, sentence) => {
    const reading = readPublicEntry(sentence);
    expect(reading.kind).toBe("recognised");
    if (reading.kind !== "recognised") return;
    expect(reading.family).toBe("hire");
    expect(identityFor(sentence)).toEqual(["company"]);
  });

  it("silence is not a claim — no possessive keeps the registry's answer", () => {
    // Nothing is inferred from the absence of a possessive; the intent's own
    // family stands, exactly as before this refinement existed.
    expect(familyForSentence("hours-import", "import the old timesheets")).toBe(
      familyOfIntent("hours-import"),
    );
  });
});

describe("3. the refinement is NARROW — nothing else in the map moved", () => {
  it("only an actor-ambiguous handler can be refined at all", () => {
    // A first-person possessive must NOT turn an employer intent into a
    // worker one. "my workers", "my company", "my project" are an employer's
    // words, and every one of these stays `hire`.
    for (const intent of ["need-workers", "find-workers", "create-project"] as const) {
      expect(familyForSentence(intent, "I need to see my workers")).toBe("hire");
      expect(familyForSentence(intent, "mano darbuotojai")).toBe("hire");
      expect(familyForSentence(intent, intent)).toBe(familyOfIntent(intent));
    }
  });

  it("families that were never `hire` are returned untouched", () => {
    for (const intent of ["find-work", "cv", "log-work"] as const) {
      expect(familyForSentence(intent, "my old work history")).toBe("work");
    }
    expect(familyForSentence("invite-client", "my client")).toBe("agency");
    expect(familyForSentence("programmes", "my programme")).toBe("education");
    expect(familyForSentence("learning-compass", "my compass")).toBe("student");
  });

  it("every family it can return is still a real first-run intent", () => {
    for (const [, s] of [...PERSON, ...ORGANISATION]) {
      const r = readPublicEntry(s);
      if (r.kind !== "recognised") continue;
      expect(["work", "hire", "agency", "student", "education"]).toContain(r.family);
    }
  });
});
