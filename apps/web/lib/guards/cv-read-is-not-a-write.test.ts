import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";

/**
 * A READ REQUEST MAY NOT BECOME A WRITE (owner window 11 §5 / §30).
 *
 * THE PRODUCTION JOURNEY THIS GUARD EXISTS FOR. The owner typed
 * "noriu pamatyti savo CV" into the conversation on production and the
 * product opened **"Įkelk savo CV."** — the import. The capability the person
 * asked for existed the whole time (`/cv`, and "Mano CV" in the account
 * menu); the router simply could not tell SEEING from UPLOADING, because the
 * import rule owned the bare noun `\bcv\b` at weight 3 and nothing else
 * claimed it.
 *
 * Measured on the router before the split, 2026-09-07: of 22 ordinary CV
 * sentences across LT / EN / RU, **eleven** — every "pamatyti / atidaryti /
 * kur / see / open / where / посмотреть / открой / где" form — classified as
 * `cv`, the IMPORT. Three reached `cv-export`. None reached a view.
 *
 * WHY THIS GUARD IS NOT A LIST OF SENTENCES. The sentences below are the
 * inputs; the ASSERTION is derived from `INTENT_REGISTRY`'s own `access` and
 * `handler` fields. So the rule survives renames and re-pointing: if someone
 * later routes an ambiguous CV sentence at any intent the registry itself
 * declares a write, or back at the import handler, this fails — without
 * anyone having to remember to add the sentence here.
 *
 * SEP-8 (data exists ≠ reachable ≠ correctly interpreted) is the separation
 * this defends: `/cv` existed, was reachable, and was still not what the
 * person's sentence reached.
 */

const APP_ROOT = join(__dirname, "..", "..");

/** The five ACTIVE locales the router is required to cover (G3 parity). */
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;
type Active = (typeof ACTIVE)[number];

/** ORDINARY ways a person asks to SEE the CV the product already holds.
 *  Every LT/EN/RU line here is one the owner typed or named in §30. */
const VIEW_SENTENCES: Record<Active, readonly string[]> = {
  lt: [
    "noriu pamatyti savo CV",
    "parodyk mano CV",
    "atidaryk mano CV",
    "kur mano CV",
    "noriu peržiūrėti CV",
    "ką dabar rodo mano CV",
    "peržiūrėti savo gyvenimo aprašymą",
  ],
  en: [
    "I want to see my CV",
    "show my CV",
    "open my CV",
    "where is my CV",
    "view my resume",
  ],
  ru: [
    "хочу посмотреть своё резюме",
    "открой моё резюме",
    "где моё резюме",
    "покажи моё резюме",
  ],
  nl: ["ik wil mijn cv bekijken", "open mijn cv", "waar is mijn cv"],
  de: [
    "ich möchte meinen Lebenslauf ansehen",
    "zeig mir meinen Lebenslauf",
    "wo ist mein Lebenslauf",
  ],
};

/** Sentences that DO carry an explicit write verb — these must still reach
 *  the import, or the fix would have broken the thing it protected. */
const IMPORT_SENTENCES: Record<Active, readonly string[]> = {
  lt: ["įkelk savo CV", "įkelsiu CV", "importuok mano gyvenimo aprašymą"],
  en: ["upload my CV", "import my resume"],
  ru: ["загрузить резюме", "прикрепи резюме"],
  nl: ["upload mijn cv"],
  de: ["meinen Lebenslauf hochladen"],
};

/** The object named and NOTHING that separates the five CV actions. §5:
 *  "If uncertain, ask. Never turn an ambiguous read request into a write." */
const AMBIGUOUS_SENTENCES: Record<Active, readonly string[]> = {
  lt: ["mano CV", "CV", "noriu pakeisti savo CV"],
  en: ["my CV", "my resume"],
  ru: ["моё резюме"],
  nl: ["mijn cv"],
  de: ["mein Lebenslauf"],
};

const descriptorFor = (sentence: string) => {
  const { intent } = classifyIntent(sentence);
  expect(intent, `"${sentence}" reached no intent at all`).not.toBe("unknown");
  return { intent: intent as RoutedIntent, d: INTENT_REGISTRY[intent as RoutedIntent] };
};

describe("the CV: VIEW ≠ UPLOAD ≠ IMPORT ≠ EDIT ≠ REPLACE ≠ EXPORT (owner §5/§30)", () => {
  for (const locale of ACTIVE) {
    for (const sentence of VIEW_SENTENCES[locale]) {
      it(`[${locale}] "${sentence}" opens the CV — not the import, not a question`, () => {
        const { intent, d } = descriptorFor(sentence);
        // Derived from the registry, not asserted by name: whatever intent
        // this sentence reaches, that intent may not be a write and may not
        // be the import handler.
        expect(d.access, `${intent} is registered as a write`).not.toBe("write");
        expect(d.handler, `${intent} still routes to the CV import`).not.toBe("cvChip");
        // …it must stay inside the CV domain, so "show my CV" can never be
        // quietly answered by the job board…
        expect(d.domain).toBe("cv");
        // …and it must OPEN the CV. Falling back to the disambiguating
        // question would be a second, quieter failure of the same journey:
        // the person said what they wanted and was asked again.
        expect(
          ["cvView", "cvExport"],
          `${intent} does not open the CV — the person is asked instead of answered`,
        ).toContain(d.handler);
      });
    }
  }

  for (const locale of ACTIVE) {
    for (const sentence of AMBIGUOUS_SENTENCES[locale]) {
      it(`[${locale}] "${sentence}" asks instead of writing`, () => {
        const { intent, d } = descriptorFor(sentence);
        expect(d.access, `${intent} is registered as a write`).not.toBe("write");
        expect(d.handler, `${intent} still routes to the CV import`).not.toBe("cvChip");
      });
    }
  }

  for (const locale of ACTIVE) {
    for (const sentence of IMPORT_SENTENCES[locale]) {
      it(`[${locale}] "${sentence}" still reaches the import — the fix did not break it`, () => {
        const { d } = descriptorFor(sentence);
        expect(d.handler).toBe("cvChip");
      });
    }
  }
});

describe("the CV domain has exactly one write door", () => {
  it("only the explicit import can persist; every other CV intent is read or route", () => {
    const cvIntents = (Object.keys(INTENT_REGISTRY) as RoutedIntent[]).filter(
      (i) => INTENT_REGISTRY[i].domain === "cv",
    );
    expect(cvIntents.length).toBeGreaterThanOrEqual(4);
    // `cv` (the import) is classified `read` in the registry because the
    // intent itself opens a flow whose own save is the write — the same
    // convention every other flow intent uses. What may NOT happen is a
    // SECOND CV intent pointing at that flow's handler.
    const importers = cvIntents.filter((i) => INTENT_REGISTRY[i].handler === "cvChip");
    expect(importers).toEqual(["cv"]);
  });
});

describe("the three doors the ambiguous answer offers are real", () => {
  const CHAT = readFileSync(
    join(APP_ROOT, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
    "utf8",
  );

  it("the CV page the view and export chips point at exists", () => {
    expect(existsSync(join(APP_ROOT, "app", "[locale]", "cv", "page.tsx"))).toBe(true);
  });

  it("cvView hands over the CV sheet, and cvChoose hands over all three doors", () => {
    // Anchored on the handler bodies rather than on copy, so rewording the
    // question never silently drops a door.
    const view = CHAT.slice(CHAT.indexOf("cvView: () =>"), CHAT.indexOf("cvChoose: () =>"));
    expect(view).toMatch(/link:\/cv/);
    const choose = CHAT.slice(CHAT.indexOf("cvChoose: () =>"));
    const body = choose.slice(0, choose.indexOf("reminderBlocked"));
    expect(body, "the ask must offer the CV itself").toMatch(/link:\/cv/);
    expect(body, "the ask must offer the import").toMatch(/id: "cv"/);
    expect(body, "the ask must offer the profile the CV is built from").toMatch(
      /id: "profile"/,
    );
  });

  it("the ask never performs one of the three actions on the person's behalf", () => {
    const choose = CHAT.slice(CHAT.indexOf("cvChoose: () =>"));
    const body = choose.slice(0, choose.indexOf("reminderBlocked"));
    // No flow started, no embed pushed — only an assistant message with chips.
    expect(body).not.toMatch(/pushEmbed|WorkerCvFlow|handleChip\(/);
  });
});
