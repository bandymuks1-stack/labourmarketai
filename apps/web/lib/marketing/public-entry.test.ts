import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

// The deterministic router compiles its whole multilingual pattern table on
// first use; under a loaded parallel run that first classification can pass
// vitest's 5 s default. The budget below is generous only for that reason.
vi.setConfig({ testTimeout: 30_000 });

import { getSafeReturnPath } from "@/lib/auth/redirect";
import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";
import { FIRST_RUN_INTENTS, nextPathForIntents } from "@/lib/onboarding/first-run-intent";

import { FINAL_CTA_LINKS, INSTITUTION_DOOR_NEXT } from "./public-doors";

import {
  PUBLIC_ENTRY_MAX_CHARS,
  PUBLIC_ENTRY_SAY_PARAM,
  entryDoorHref,
  entryReturnPath,
  familyOfIntent,
  normaliseEntrySentence,
  readPublicEntry,
} from "./public-entry";

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const MESSAGES = join(__dirname, "..", "..", "messages");

function entryExamples(locale: string): Record<string, string> {
  const json = JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8")) as {
    landing: { entry: { examples: Record<string, string> } };
  };
  return json.landing.entry.examples;
}

describe("public entry — one sentence, the one router (P1 acceptance)", () => {
  it("three different sentences give three different recognitions", () => {
    const a = readPublicEntry("Reikia 12 pastolininkų Roterdame");
    const b = readPublicEntry("ieškau darbo Norvegijoje");
    const c = readPublicEntry("kur galiu atlikti praktiką?");
    expect(a).toMatchObject({ kind: "recognised", intent: "need-workers", family: "hire" });
    expect(b).toMatchObject({ kind: "recognised", intent: "find-work", family: "work" });
    expect(c).toMatchObject({ kind: "recognised", intent: "opportunities", family: "work" });
    const intents = new Set([a, b, c].map((r) => (r.kind === "recognised" ? r.intent : r.kind)));
    expect(intents.size).toBe(3);
  });

  /**
   * Window 6 (2026-09-06, gap G-D1): the first screen used to show three
   * manual-labour sentences. It now shows six — the original three plus a
   * PROFESSIONAL worker, a SERVICE need and a SERVICE offer — and every one
   * of them is still routed LIVE through the one router when tapped, so each
   * must be recognised in every routed locale, and together they must reach
   * the five intents the door copy relies on. Nothing here is pre-answered.
   */
  const EXAMPLE_KEYS = [
    "hire",
    "work",
    "internship",
    "professional",
    "needService",
    "offerService",
  ] as const;
  const EXAMPLE_INTENT: Readonly<Record<(typeof EXAMPLE_KEYS)[number], RoutedIntent>> = {
    hire: "need-workers",
    work: "find-work",
    internship: "opportunities",
    professional: "find-work",
    needService: "need-service",
    offerService: "offer-value",
  };

  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: every example sentence on the page routes to its intent`, () => {
      const examples = entryExamples(locale);
      expect(Object.keys(examples).sort()).toEqual([...EXAMPLE_KEYS].sort());
      for (const key of EXAMPLE_KEYS) {
        const reading = readPublicEntry(examples[key]);
        expect(reading, `${locale}.${key}: "${examples[key]}"`).toMatchObject({
          kind: "recognised",
          intent: EXAMPLE_INTENT[key],
        });
      }
      const ids = new Set(Object.values(EXAMPLE_INTENT));
      expect(ids.size).toBe(5);
    });
  }

  it("the professional example is a non-manual profession in every routed locale", () => {
    // accountant — the profession the window-5 walk found missing from the page.
    const WORD: Record<(typeof ACTIVE_LOCALES)[number], RegExp> = {
      lt: /buhalter/i,
      en: /accountant/i,
      ru: /бухгалтер/i,
      nl: /accountant/i,
      de: /buchhalter/i,
    };
    for (const locale of ACTIVE_LOCALES) {
      expect(entryExamples(locale).professional).toMatch(WORD[locale]);
    }
  });

  it("a sentence the router cannot read is UNRECOGNISED — never a guessed intent", () => {
    expect(readPublicEntry("zzzz qqqq vvvv")).toEqual({
      kind: "unrecognised",
      sentence: "zzzz qqqq vvvv",
    });
    expect(readPublicEntry("labas")).toMatchObject({ kind: "unrecognised" });
  });

  it("nothing typed is EMPTY, not unrecognised", () => {
    expect(readPublicEntry("")).toEqual({ kind: "empty" });
    expect(readPublicEntry("   \n ")).toEqual({ kind: "empty" });
    expect(readPublicEntry(null)).toEqual({ kind: "empty" });
  });

  it("normalises whitespace and caps the sentence", () => {
    expect(normaliseEntrySentence("  reikia   \n suvirintojų ")).toBe("reikia suvirintojų");
    expect(normaliseEntrySentence("x".repeat(PUBLIC_ENTRY_MAX_CHARS + 50))).toHaveLength(
      PUBLIC_ENTRY_MAX_CHARS,
    );
  });
});

describe("family — a projection of the intent registry, not a second list", () => {
  it("every routed intent maps onto exactly one first-run family", () => {
    for (const intent of Object.keys(INTENT_REGISTRY) as RoutedIntent[]) {
      expect(FIRST_RUN_INTENTS).toContain(familyOfIntent(intent));
    }
  });

  it("pins the families the public examples rely on", () => {
    expect(familyOfIntent("need-workers")).toBe("hire");
    expect(familyOfIntent("create-project")).toBe("hire");
    expect(familyOfIntent("find-workers")).toBe("hire");
    expect(familyOfIntent("find-work")).toBe("work");
    expect(familyOfIntent("cv")).toBe("work");
    expect(familyOfIntent("log-work")).toBe("work");
    expect(familyOfIntent("invite-client")).toBe("agency");
    expect(familyOfIntent("propose-candidate")).toBe("agency");
    expect(familyOfIntent("invite-student")).toBe("education");
    expect(familyOfIntent("programmes")).toBe("education");
    expect(familyOfIntent("learning-compass")).toBe("student");
  });
});

describe("the sentence is carried through the EXISTING return-path mechanism", () => {
  it("builds /dashboard?say=<sentence> and nothing else", () => {
    const next = entryReturnPath("Reikia 12 pastolininkų Roterdame");
    expect(next).not.toBeNull();
    const [path, query] = (next as string).split("?");
    expect(path).toBe("/dashboard");
    const params = new URLSearchParams(query);
    expect([...params.keys()]).toEqual([PUBLIC_ENTRY_SAY_PARAM]);
    expect(params.get(PUBLIC_ENTRY_SAY_PARAM)).toBe("Reikia 12 pastolininkų Roterdame");
  });

  it("survives the auth sanitiser round trip with the sentence intact", () => {
    const sentence = "ieškau darbo Norvegijoje";
    const href = entryDoorHref("lt", "signup", sentence);
    expect(href.startsWith("/lt/auth/signup?next=")).toBe(true);
    const nextParam = decodeURIComponent(href.split("?next=")[1]);
    const landed = getSafeReturnPath(nextParam, "lt");
    expect(landed.startsWith("/lt/dashboard?")).toBe(true);
    const params = new URLSearchParams(landed.split("?")[1]);
    expect(params.get(PUBLIC_ENTRY_SAY_PARAM)).toBe(sentence);
  });

  it("an empty sentence opens the plain door", () => {
    expect(entryDoorHref("en", "login", "")).toBe("/en/auth/login");
    expect(entryReturnPath("  ")).toBeNull();
  });

  it("never lets a sentence smuggle a second redirect or a credential key", () => {
    // The sentence is a VALUE under `say`; whatever it contains stays a value.
    const next = entryReturnPath("next=//evil.com&token=abc");
    const params = new URLSearchParams((next as string).split("?")[1]);
    expect([...params.keys()]).toEqual([PUBLIC_ENTRY_SAY_PARAM]);
    expect(params.get(PUBLIC_ENTRY_SAY_PARAM)).toBe("next=//evil.com&token=abc");
  });
});

describe("the doors — window 6 G-C1: an institution has its own door", () => {
  const ALL_LOCALES = ["en", "lt", "ru", "nl", "de", "da", "no", "sv", "pl", "lv", "et"] as const;
  const doorCopy = (locale: string): Record<string, string> => {
    const json = JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8")) as {
      landing: { cta: Record<string, string> };
    };
    return json.landing.cta;
  };

  it("the institution door carries the education intent's own setup path in ?next=", () => {
    // ONE source of truth: the door goes exactly where onboarding sends an
    // `education` intent — the existing organisation setup, capability preset.
    expect(INSTITUTION_DOOR_NEXT).toBe(nextPathForIntents(["education"]));
    expect(INSTITUTION_DOOR_NEXT).toBe("/dashboard/start/company?capability=training_provider");
    const door = FINAL_CTA_LINKS.find((l) => l.key === "institution");
    expect(door).toBeDefined();
    expect(door!.href.startsWith("/auth/signup?next=")).toBe(true);
    // …and it survives the auth sanitiser with the capability preset intact.
    const landed = getSafeReturnPath(decodeURIComponent(door!.href.split("?next=")[1]), "lt");
    expect(landed).toBe("/lt/dashboard/start/company?capability=training_provider");
    // Five doors, institution beside agency, partner last — no other door moved.
    expect(FINAL_CTA_LINKS.map((l) => l.key)).toEqual([
      "worker",
      "employer",
      "agency",
      "institution",
      "partner",
    ]);
  });

  it("every catalogue names the institution door and no catalogue still counts four", () => {
    for (const locale of ALL_LOCALES) {
      const cta = doorCopy(locale);
      expect(cta.institution, `${locale}.landing.cta.institution`).toMatch(/\S/);
      expect(cta.institution).not.toMatch(/^\[EN\]/);
      expect(cta.subcopy, `${locale}.landing.cta.subcopy`).not.toMatch(
        /\b(four|ketverios|четыре|vier|fire|fyra|czworo|četras|neli)\b/i,
      );
    }
  });
});

describe("/professions names professionals and services — window 6 G-D1", () => {
  it("lists finance, legal, engineering, IT, sales, education and design rows", async () => {
    const { SEO_PROFESSIONS } = await import("@/lib/seo/profession-problem-content");
    const keys = new Set(SEO_PROFESSIONS.map((p) => p.key));
    for (const key of [
      "accountants",
      "lawyers",
      "engineers",
      "software-developers",
      "sales-managers",
      "teachers-trainers",
      "designers-consultants",
    ]) {
      expect(keys.has(key), key).toBe(true);
    }
    const sectors = new Set<string>(SEO_PROFESSIONS.map((p) => p.sector));
    for (const sector of ["it_software", "office_admin", "education", "hr_recruitment"]) {
      expect(sectors.has(sector), sector).toBe(true);
    }
  });
});
