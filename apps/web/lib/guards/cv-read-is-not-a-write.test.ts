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

/** The body of the `startCvState` handler — the CV read's whole answer. */
function cvStateBody(chat: string): string {
  const start = chat.indexOf("const startCvState = useCallback");
  expect(start, "startCvState must exist").toBeGreaterThan(-1);
  const end = chat.indexOf("const startPlayerCard", start);
  expect(end, "startCvState must be followed by startPlayerCard").toBeGreaterThan(start);
  return chat.slice(start, end);
}

/** One `case "<name>":` arm of the presence switch inside `startCvState`. */
function cvStateBranch(chat: string, name: string): string {
  const body = cvStateBody(chat);
  const start = body.indexOf(`case "${name}":`);
  expect(start, `startCvState must answer the ${name} state`).toBeGreaterThan(-1);
  const rest = body.slice(start + 1);
  const nextCase = rest.search(/\n\s+(case "|default:)/);
  return nextCase === -1 ? rest : rest.slice(0, nextCase);
}

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
    //
    // RE-ANCHORED (takeover 2026-09-10): `cvView` no longer answers inline. It
    // delegates to `startCvState`, which READS the person's record before
    // saying anything about it — the old handler asserted "here is your CV"
    // as a constant, which was false for anyone who had none. The door it must
    // hand over is unchanged, so this check MOVED to where the door now lives
    // instead of being dropped.
    const view = CHAT.slice(CHAT.indexOf("cvView: () =>"), CHAT.indexOf("cvChoose: () =>"));
    expect(view, "the CV read must delegate to the state-reading handler").toMatch(
      /startCvState\(\)/,
    );
    expect(cvStateBody(CHAT), "the read must still hand over the CV sheet").toMatch(
      /link:\/cv/,
    );
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

/**
 * THE CV READ ANSWERS FROM THE RECORD, NEVER FROM A CONSTANT.
 *
 * Added by the 2026-09-10 takeover. The handler this pins replaced one that
 * asserted "Here is your CV — what the system knows about you today" without
 * reading anything: false for a person with no CV, and — because the old gate
 * was `identity === "person"` — unreachable for the same human sitting in
 * their company workspace, who was dropped into a fallback offering to UPLOAD
 * the CV they already had.
 *
 * Three invariants, each of which the old code violated.
 */
describe("a CV read answers from the person's real record", () => {
  const CHAT = readFileSync(
    join(APP_ROOT, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
    "utf8",
  );

  it("it READS before it answers, through the one canonical CV reader", () => {
    expect(cvStateBody(CHAT), "the answer must come from a read").toMatch(
      /readMyCvState\(\)/,
    );
    // And that reader must be the one that wraps `buildVerifiedCv` — the same
    // builder the printed CV renders from. A second CV reader would let the
    // chat and the document disagree about the same person.
    const server = readFileSync(
      join(APP_ROOT, "lib", "conversation", "cv-state-server.ts"),
      "utf8",
    );
    expect(server).toMatch(/buildVerifiedCv/);
  });

  it("ONLY the empty branch offers to build a CV", () => {
    // The whole defect in one line: offering to create what we never checked
    // whether the person already has.
    expect(cvStateBranch(CHAT, "empty"), "an empty record may offer the import").toMatch(
      /importCv/,
    );
    for (const present of ["substantive", "started"]) {
      expect(
        cvStateBranch(CHAT, present),
        `a person who HAS a CV must never be offered the import (${present})`,
      ).not.toMatch(/importCv/);
    }
  });

  it("a failed read is never rendered as an empty CV (SEP-7)", () => {
    const body = cvStateBody(CHAT);
    // The four zero-row situations must reach four different sentences.
    for (const key of [
      "cvStateEmpty",
      "cvStateNotWorker",
      "cvStateUnreadable",
      "cvStateSubstantive",
    ]) {
      expect(body, `${key} must be a distinct answer`).toMatch(new RegExp(key));
    }
    // The `default:` arm is the unreadable/unauthenticated answer. Asserting
    // only that `cvStateUnreadable` appears SOMEWHERE in the handler is an
    // assertion that cannot fail — the `.catch()` also uses it, so collapsing
    // this arm into the empty answer would still pass. Negative-controlled
    // 2026-09-10: this is checked on the arm itself.
    const tail = body.slice(body.indexOf("default:"), body.indexOf(".catch("));
    expect(tail, "an unreadable read must say so").toMatch(/cvStateUnreadable/);
    expect(
      tail,
      "a failed read must never be answered as an empty CV (SEP-7)",
    ).not.toMatch(/cvStateEmpty/);
    // …and it must NOT offer the import: we have not established that there
    // is nothing to import.
    expect(tail, "an unreadable read must not offer to build a CV").not.toMatch(
      /importCv/,
    );
  });

  it("the CV belongs to the human, not to the active workspace (SEP-5)", () => {
    const view = CHAT.slice(CHAT.indexOf("cvView: () =>"), CHAT.indexOf("cvChoose: () =>"));
    // `identity` is the ACTIVE WORKSPACE. Gating a person's own CV on it is
    // what refused the CV to a person sitting in their company space.
    expect(view, "the CV read must not be gated on the active workspace").not.toMatch(
      /identity === "person"/,
    );
  });
});
