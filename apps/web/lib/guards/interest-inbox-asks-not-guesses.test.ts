import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { activeLocales } from "@/lib/i18n/config";

/**
 * "KAS SUSIDOMĖJO?" MUST NOT ANSWER WITH A JOB SEARCH.
 *
 * The interest loop is the one the production numbers indict: five real
 * `demand_interest_signals`, every one still `interested`, none reviewed or
 * contacted. This is one of the ways a person could ask about it and be
 * answered with something else entirely.
 *
 * `interest-inbox` was routed on the ACTIVE workspace: company → the employer
 * reading, everybody else → `runFindWork`. Production has five profiles
 * holding the `company` role while sitting in `worker`, so for them the
 * question "who is interested in my need?" ran a JOB SEARCH — which is neither
 * of the two things the sentence can mean.
 *
 * The fix does not swap one guess for another. For a dual-role person the
 * sentence is genuinely ambiguous — the patterns lean employer ("interested in
 * MY need") but "susidomėjimai" is the worker's own word — so the chat ASKS,
 * offering both real surfaces. Single-role people are unaffected.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");
const CHAT = read(
  "components", "app", "conversation", "chat", "conversation-chat.tsx",
);

describe("the sentence still classifies as the interest inbox", () => {
  it.each([
    "Kas susidomėjo mano poreikiu?",
    "Who is interested in my need?",
    "Ar kas nors atsiliepė?",
  ])("%s", (phrase) => {
    expect(classifyIntent(phrase).intent).toBe("interest-inbox");
  });
});

describe("the dual-role reading is asked, never guessed", () => {
  it("the workflow map no longer answers the ambiguous case", () => {
    // The employer workspace keeps the employer reading; a person with no
    // company role keeps the worker reading. The map is entered only for
    // those two, so the ambiguous person cannot silently reach `runFindWork`.
    expect(CHAT).toMatch(
      /identity === "company" \|\| !canActAsEmployer[\s\S]{0,200}"interest-inbox": \(\) =>/,
    );
  });

  it("the ambiguous case offers BOTH real surfaces", () => {
    const branch = CHAT.slice(
      CHAT.indexOf('case "interest-inbox":'),
      CHAT.indexOf('case "need-service":'),
    );
    expect(branch.length).toBeGreaterThan(0);
    expect(branch).toMatch(/interestInboxAmbiguous/);
    // The employer reading and the worker reading, both real routes.
    expect(branch).toMatch(/link:\/dashboard\/company\/scouting/);
    expect(branch).toMatch(/link:\/dashboard\/opportunities/);
    // And it must not quietly run a search instead of answering.
    expect(branch).not.toMatch(/runFindWork\(/);
  });

  it("both offered routes are real pages", () => {
    expect(() =>
      read("app", "[locale]", "dashboard", "company", "scouting", "page.tsx"),
    ).not.toThrow();
    expect(() =>
      read("app", "[locale]", "dashboard", "opportunities", "page.tsx"),
    ).not.toThrow();
  });
});

describe("the copy resolves in every routable locale", () => {
  it.each([...activeLocales])("%s", (loc) => {
    const messages = JSON.parse(read("messages", `${loc}.json`));
    const t = createTranslator({ locale: loc, messages });
    const keys = [
      "conversation.chat.interestInboxAmbiguous",
      "conversation.chat.chipInterestOnMyNeeds",
      "conversation.chat.chipMyOwnInterest",
    ];
    for (const key of keys) {
      const out = t(key as never);
      expect(typeof out, `${loc} ${key}`).toBe("string");
      expect(out.trim().length, `${loc} ${key} empty`).toBeGreaterThan(0);
      expect(out, `${loc} ${key} did not resolve`).not.toContain(key);
    }
    // The two chips must not read identically — a person choosing between
    // them has to be able to tell them apart.
    const chat = JSON.parse(read("messages", `${loc}.json`)).conversation.chat;
    expect(chat.chipInterestOnMyNeeds, loc).not.toBe(chat.chipMyOwnInterest);
  });
});
