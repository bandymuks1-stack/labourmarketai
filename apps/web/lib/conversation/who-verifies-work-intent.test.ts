import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";

/**
 * "KAM PATEIKTI ATLIKTĄ DARBĄ?" — the worker's side of the confirmation loop.
 *
 * THE DEFECT: the owner typed this exact sentence on production and was shown
 * "Skydelyje yra 5 viešų darbo skelbimų". It matched `find-work` on the bare
 * noun `darbą` at weight 1, because no intent existed for a person asking WHO
 * RECEIVES work they have ALREADY DONE.
 *
 * Window 8 deliberately refused to route it somewhere plausible — guessing a
 * direction was the whole defect class of that window. The product decision
 * was made instead, and this is it: the question is answered from real
 * authorized context, and "nobody yet" is a legitimate answer.
 */
describe("the sentence that was answered with job adverts", () => {
  it("routes the owner's exact sentence to the worker's question, not to jobs", () => {
    const r = classifyIntent("Kam pateikti atliktą darbą?");
    expect(r.intent).toBe("who-verifies-work");
    // The bug was a weight-1 match on a bare noun; anything close to that is
    // one unrelated pattern away from regressing.
    expect(r.score).toBeGreaterThanOrEqual(10);
  });

  it("survives the way people actually type — no diacritics, no question mark", () => {
    expect(classifyIntent("kam pateikti atlikta darba").intent).toBe("who-verifies-work");
  });

  it.each([
    ["lt", "Kas gali patvirtinti mano darbą?"],
    ["lt", "Kam siųsti atliktą darbą?"],
    ["en", "Who can confirm my work?"],
    ["nl", "Wie kan mijn werk bevestigen?"],
    ["de", "Wer kann meine Arbeit bestätigen?"],
    ["ru", "Кто может подтвердить мою работу?"],
    ["pl", "Kto może potwierdzić moją pracę?"],
  ])("%s: %s", (_locale, sentence) => {
    expect(classifyIntent(sentence).intent).toBe("who-verifies-work");
  });
});

describe("the neighbours it sits between must not move", () => {
  /**
   * This intent is wedged between three that share its vocabulary. The whole
   * risk of adding it is stealing one of their sentences, so each is pinned.
   */
  it.each([
    // The EMPLOYER's imperative — names another person, commands, never asks KAM.
    ["patvirtink Jono darbą", "confirm-work"],
    ["ką reikia patvirtinti?", "confirm-work"],
    ["confirm John's work", "confirm-work"],
    // Work NOT yet done.
    ["ieškau darbo Nyderlanduose", "find-work"],
    ["surask man darbą", "find-work"],
    ["noriu dirbti Vokietijoje", "find-work"],
    // Recording work done — the journal, not a question about it.
    ["Šiandien 8 valandas montavau klojinius objekte Kaune.", "log-work"],
    // The supply direction closed in #1587/#1591.
    ["turime 20 suvirintojų ir ieškome jiems darbo", "offer-capacity"],
  ])("%s stays %s", (sentence, intent) => {
    expect(classifyIntent(sentence).intent).toBe(intent);
  });
});

describe("the registry classifies it honestly", () => {
  it("is a READ in the journal domain — it answers, it never confirms", () => {
    const d = INTENT_REGISTRY["who-verifies-work"];
    expect(d.domain).toBe("journal");
    // `write` would imply the chat can confirm work. It cannot, and must not:
    // confirmation is the authorized verifier's act, through their own RPC.
    expect(d.access).toBe("read");
    expect(d.handler).toBe("whoVerifiesWork");
  });

  it("is not the employer's confirm-work wearing a different name", () => {
    expect(INTENT_REGISTRY["who-verifies-work"].handler).not.toBe(
      INTENT_REGISTRY["confirm-work"].handler,
    );
  });
});

describe("every shipped locale can actually say the answer", () => {
  /**
   * next-intl resolves a MISSING key to the key itself and does not throw, so
   * an unlocalised catalogue ships the literal string `verifierNone` onto a
   * real worker's screen. That exact defect shipped once (#1589) and was found
   * on production, not by a test. Only a check over every catalogue catches
   * it — a green build never will.
   */
  const DIR = path.join(__dirname, "..", "..", "messages");
  const KEYS = [
    "verifierOne",
    "verifierOneNotEnabled",
    "verifierChoice",
    "verifierSelf",
    "verifierNone",
    "verifierUnavailable",
    "verifierUnnamedOrganization",
    "whyVerifier",
    "whyVerifierChoice",
    "whyVerifierSelf",
    "whyVerifierNone",
    "whyVerifierUnavailable",
  ] as const;

  const locales = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("finds the shipped catalogues", () => {
    expect(locales.length).toBeGreaterThanOrEqual(11);
  });

  for (const locale of locales) {
    it(`${locale} defines every verifier string`, () => {
      const data = JSON.parse(
        fs.readFileSync(path.join(DIR, `${locale}.json`), "utf8"),
      ) as { workspace?: { ai?: Record<string, unknown> } };
      const ai = data.workspace?.ai;
      expect(ai, `${locale}: workspace.ai missing`).toBeTruthy();
      for (const key of KEYS) {
        const value = ai![key];
        expect(typeof value, `${locale}.workspace.ai.${key} missing`).toBe("string");
        expect((value as string).trim().length).toBeGreaterThan(0);
        // A catalogue that "translated" a key by copying it is the same defect
        // wearing a translation's clothes.
        expect(value, `${locale}.${key} is the key itself`).not.toBe(key);
      }
    });

    it(`${locale} keeps the {organization} placeholder the answer depends on`, () => {
      const data = JSON.parse(
        fs.readFileSync(path.join(DIR, `${locale}.json`), "utf8"),
      ) as { workspace: { ai: Record<string, string> } };
      const ai = data.workspace.ai;
      // A dropped placeholder silently renders an answer that names nobody —
      // which is precisely the "who can verify this?" question going unanswered.
      for (const k of ["verifierOne", "verifierOneNotEnabled", "verifierSelf"]) {
        expect(ai[k], `${locale}.${k} lost {organization}`).toContain("{organization}");
      }
      expect(ai.verifierChoice, `${locale}.verifierChoice lost {organizations}`).toContain(
        "{organizations}",
      );
    });
  }
});
