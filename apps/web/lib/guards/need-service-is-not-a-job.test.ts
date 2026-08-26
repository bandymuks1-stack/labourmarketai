import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { activeLocales } from "@/lib/i18n/config";

/**
 * SOMEBODY TO DO A JOB IS NOT SOMEBODY TO FILL A JOB (§33).
 *
 * Measured before the rule was written:
 *
 *   "Reikia, kad kas nors sutaisytų stogą"   → unknown
 *   "Reikia meistro rytoj suremontuoti dušą" → unknown
 *   "Need someone to repair the roof"        → unknown
 *   "Ieškau, kas galėtų nuvalyti langus"     → find-work   ← backwards
 *
 * The last one is the worst: somebody who wants to HIRE a window cleaner was
 * handed a job search. The product already owns the right destination — the
 * service-offering request loop — so the sentence had a home all along.
 *
 * These tests assert CLASSIFICATION, not pattern text. That distinction is not
 * academic here: the first version of this rule was written with single
 * backslashes in the TypeScript literals, so `\\b` became a backspace
 * character and `\\s` became a plain `s`. Every pattern was inert, the rule
 * scored 0 on every sentence, and any guard that merely asserted the patterns
 * EXISTED would have passed while the feature did nothing.
 */

describe("a request for work to be done routes to services", () => {
  it.each([
    "Reikia, kad kas nors sutaisytų stogą",
    "Reikia meistro rytoj suremontuoti dušą",
    "Need someone to repair the roof",
    "Ieškau, kas galėtų nuvalyti langus",
    "Reikia, kad kažkas nudažytų sieną",
  ])("%s", (phrase) => {
    expect(classifyIntent(phrase).intent).toBe("need-service");
  });

  it("also matches without diacritics, as most people type", () => {
    expect(classifyIntent("Reikia kad kas nors sutaisytu stoga").intent).toBe(
      "need-service",
    );
  });
});

describe("it does not steal the readings that already worked", () => {
  it.each([
    ["Reikia dviejų santechnikų kitai savaitei Vilniuje", "need-workers"],
    ["Reikia darbuotojų", "need-workers"],
    ["Reikia žmonių", "need-workers"],
    // Naming a trade stays EMPLOYMENT intake — the one path that works today.
    ["Reikia keturių suvirintojų", "need-workers"],
    // Offering to do the work is the opposite direction.
    ["Galiu suremontuoti stogą", "offer-value"],
    ["Ieškau darbo Nyderlanduose", "find-work"],
    ["Kokių įgūdžių man trūksta?", "skill-gap"],
    ["Parodyk mano žurnalą", "journal-recent"],
  ])("%s stays %s", (phrase, intent) => {
    expect(classifyIntent(phrase).intent).toBe(intent);
  });

  it("a past-tense work sentence is never a service request", () => {
    // Every pattern binds an indefinite AGENT to a work verb in one regex
    // precisely so a bare verb stem cannot fire on a journal entry.
    const m = classifyIntent("Šiandien taisiau stogą nuo 8 iki 17");
    expect(m.intent).not.toBe("need-service");
  });
});

describe("the chat routes it to a surface that exists", () => {
  const WEB = join(__dirname, "..", "..");
  const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

  it("sends the person to the service-offering request loop", () => {
    const chat = read(
      "components", "app", "conversation", "chat", "conversation-chat.tsx",
    );
    const branch = chat.slice(
      chat.indexOf('case "need-service":'),
      chat.indexOf('case "offer-value":'),
    );
    expect(branch.length).toBeGreaterThan(0);
    expect(branch).toMatch(/link:\/dashboard\/service-requests/);
    expect(branch).toMatch(/serviceNeedHint/);
    // Needing a service is not a workspace role, so this must NOT be gated on
    // the company identity the way demand intake is.
    expect(branch).not.toMatch(/identity === "company"/);
    expect(branch).not.toMatch(/canActAsEmployer/);
  });

  it("that route is a real page", () => {
    expect(() =>
      read("app", "[locale]", "dashboard", "service-requests", "page.tsx"),
    ).not.toThrow();
  });
});

describe("the copy resolves in every routable locale", () => {
  it.each([...activeLocales])("%s", (loc) => {
    const messages = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "messages", `${loc}.json`), "utf8"),
    );
    const t = createTranslator({ locale: loc, messages });
    for (const key of [
      "conversation.chat.serviceNeedHint",
      "conversation.chat.chipServiceRequests",
    ]) {
      const out = t(key as never);
      expect(typeof out, `${loc} ${key}`).toBe("string");
      expect(out.trim().length, `${loc} ${key} empty`).toBeGreaterThan(0);
      expect(out, `${loc} ${key} did not resolve`).not.toContain(key);
    }
  });
});
