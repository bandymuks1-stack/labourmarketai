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
  it("the workflow arm answers ONLY the two decided cases", () => {
    // G2: routing is registry-dispatched — the whole decision now lives in
    // the component's ONE `interestInbox` handler. The employer workspace
    // keeps the employer reading; a person with no company role keeps the
    // worker reading; the workflow arm is gated to exactly those two.
    expect(CHAT).toMatch(
      /interestInbox: \(\) => \{[\s\S]{0,700}identity === "company" \|\| !canActAsEmployer/,
    );
  });

  it("the ambiguous case offers BOTH real surfaces", () => {
    const branch = CHAT.slice(
      CHAT.indexOf("interestInbox: () =>"),
      CHAT.indexOf("switchContext: () =>"),
    );
    expect(branch.length).toBeGreaterThan(0);
    // The two decided readings return EARLY inside the gate; everything from
    // `withTyping` on is the ambiguous dual-role person's arm.
    const gateAt = branch.indexOf('identity === "company" || !canActAsEmployer');
    const ambiguousAt = branch.indexOf("withTyping");
    expect(gateAt).toBeGreaterThan(-1);
    expect(ambiguousAt).toBeGreaterThan(gateAt);
    const ambiguousArm = branch.slice(ambiguousAt);
    expect(ambiguousArm).toMatch(/interestInboxAmbiguous/);
    // Both readings answer INSIDE the workspace. `w8-employer-chat-workspace`
    // refuses `link:/dashboard/company/scouting` by name — the employer's
    // second step must not navigate out of the chat — so these are the
    // existing in-chat results, not routes.
    expect(ambiguousArm).toMatch(/\{ id: "candidates", label: labels\.chipInterestOnMyNeeds \}/);
    expect(ambiguousArm).toMatch(/\{ id: "jobs", label: labels\.chipMyOwnInterest \}/);
    // Comments stripped: the note above explains WHY `link:` is refused here,
    // so asserting on raw text would fail on its own explanation.
    const code = ambiguousArm
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/link:/);
    // And the ambiguous person must not quietly get a search instead of the
    // question — `runFindWork` may appear only inside the gated arm above.
    expect(ambiguousArm).not.toMatch(/runFindWork\(/);
  });

  it("both chips are ids the handler actually understands", () => {
    // A chip whose id no branch handles is a dead end that looks like an
    // action. These two are the same ids the starter chips use.
    expect(CHAT).toMatch(/case "candidates":/);
    expect(CHAT).toMatch(/case "jobs":/);
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
