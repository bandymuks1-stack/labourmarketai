import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { INTENT_HINTS } from "@/lib/conversation/intent-catalogue";
import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";

/**
 * "WHAT CAN I DO HERE?" IS DERIVED, NOT WRITTEN DOWN.
 *
 * THE PRODUCTION JOURNEY THIS GUARD EXISTS FOR. The owner asked a signed-in
 * STAFFING AGENCY workspace what it could do and was answered, in effect,
 * "Įmonės erdvė". Three separate failures produced that one sentence:
 *
 *   1. the sentence scored 0 in the deterministic router — and the Gemini
 *      proposer could not rescue it either, because `llm-proposal.ts`
 *      re-validates the model's answer against `INTENT_REGISTRY`. A question
 *      with no id in the vocabulary is unanswerable by BOTH routers;
 *   2. the generic fallback DOES compose a capability sentence
 *      (`capabilityPhraseKeys`), but it opens with
 *      `if (signals.identity !== "company") return []` — a PERSON is
 *      answered with nothing at all;
 *   3. that sentence is frozen at page load and ignores current state, so it
 *      cannot say what is worth doing NOW and goes stale the moment the
 *      person switches context inside the conversation.
 *
 * WHAT THIS GUARD DEFENDS is not the wording — it is the SHAPE of the answer:
 * read the active context at ask time, derive outcomes from real state, and
 * never let a failed read turn into a claim about the person's account.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const RESOLVER = read("lib/conversation/capability-answer.ts");
const SERVER = read("lib/conversation/capability-answer-server.ts");

/** The body of the `startCapabilities` handler. */
function handlerBody(): string {
  const start = CHAT.indexOf("const startCapabilities = useCallback");
  expect(start, "startCapabilities must exist").toBeGreaterThan(-1);
  const end = CHAT.indexOf("const startCvState", start);
  expect(end, "startCapabilities must be followed by startCvState").toBeGreaterThan(start);
  return CHAT.slice(start, end);
}

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

describe("the question is reachable at all", () => {
  it("it has an id, so BOTH routers can reach it", () => {
    // Without a registry row the deterministic router cannot classify it and
    // the LLM proposer is forbidden from returning it — permanently
    // unanswerable, which is what the owner walked into.
    expect(INTENT_REGISTRY.capabilities).toBeDefined();
    expect(INTENT_REGISTRY.capabilities.access, "answering must stay a READ").toBe("read");
    expect(INTENT_HINTS.capabilities, "the proposer needs a hint to choose it").toBeTruthy();
  });

  it("it is a different question from `context` and from `next-action`", () => {
    // "what do you know about me" is STATE; "what must I still do" is
    // OBLIGATION; this is CAN. Collapsing them would lose a real distinction.
    expect(classifyIntent("Ką tu apie mane žinai?").intent).toBe("context");
    expect(classifyIntent("Ką dar turiu padaryti?").intent).toBe("next-action");
    expect(classifyIntent("Ką galiu padaryti šioje paskyroje?").intent).toBe("capabilities");
  });

  it("a CAN question does not steal an OFFER question", () => {
    // "Ką galiu pasiūlyti klientui" is the person stating supply, not asking
    // about the account. Both start "ką galiu".
    expect(classifyIntent("Ką galiu pasiūlyti klientui").intent).not.toBe("capabilities");
  });
});

describe("the answer is derived, not written down", () => {
  it("the handler READS the active context at ask time", () => {
    expect(handlerBody(), "the answer must come from a read").toMatch(
      /readCapabilityAnswer\(\)/,
    );
  });

  it("the handler renders whatever the resolver returned — it holds no list of its own", () => {
    const body = handlerBody();
    // The outcomes are iterated, never enumerated here.
    expect(body, "outcomes must be rendered by iteration").toMatch(
      /for\s*\(const outcome of answer\.outcomes\)/,
    );
    expect(body).toMatch(/outcomeMessageKey\(outcome\)/);
    // No outcome phrase key may be named in the component: naming even one
    // would mean part of the answer is decided by the renderer.
    const phraseKeys = [...RESOLVER.matchAll(/"(capOut[A-Za-z]+)"/g)].map((m) => m[1]);
    expect(phraseKeys.length, "the resolver must own the phrase keys").toBeGreaterThan(10);
    for (const key of phraseKeys) {
      expect(body, `${key} is hard-coded in the chat component`).not.toContain(key);
    }
  });

  it("the server reuses the existing signal loaders — no second projection", () => {
    // The suggestion chips and this answer must describe ONE workspace.
    expect(SERVER).toMatch(/loadCompanyStarterContext/);
    expect(SERVER).toMatch(/loadPersonStarterFacts/);
    expect(SERVER).toMatch(/personStarterContext/);
    // …and it must not have grown a query of its own.
    expect(SERVER, "the answer must not run its own query").not.toMatch(
      /\.from\(|\.rpc\(/,
    );
  });

  it("it is a READ — it never writes, dispatches or confirms", () => {
    for (const forbidden of ["prepareAction", "dispatchAction", "confirmToken", ".insert(", ".update(", ".delete("]) {
      expect(handlerBody(), `${forbidden} in a read answer`).not.toContain(forbidden);
      expect(SERVER, `${forbidden} in a read answer`).not.toContain(forbidden);
    }
  });
});

describe("a failed read never becomes a claim about the person", () => {
  it("the failure branch says it is OUR failure and offers no outcomes", () => {
    const body = handlerBody();
    expect(body).toMatch(/capUnreadable/);
    // The unreadable path must be taken for anything that is not a real
    // answer — including an answer that came back with nothing in it.
    expect(body, "an empty outcome list must fall to the honest failure line").toMatch(
      /answer\.kind !== "outcomes" \|\| answer\.outcomes\.length === 0/,
    );
  });

  it("a degraded read is reported, not hidden", () => {
    expect(handlerBody()).toMatch(/answer\.degraded/);
    expect(handlerBody()).toMatch(/capPartial/);
  });

  it("a failed PROFILE read is not answered as a person", () => {
    // #1314: before the honest three-state, a company owner whose profile row
    // timed out was greeted as a worker. Answering "what can I do here" from
    // that same guess would describe the wrong workspace with confidence.
    expect(SERVER).toMatch(/profileRead === "failed"/);
    expect(SERVER).toMatch(/CAPABILITY_ANSWER_UNREADABLE/);
  });
});

describe("nothing internal reaches the person, in any language", () => {
  const catalogues = Object.fromEntries(
    ACTIVE_LOCALES.map((l) => [
      l,
      JSON.parse(read(join("messages", `${l}.json`))) as {
        conversation: { chat: Record<string, string> };
      },
    ]),
  );

  const phraseKeys = [
    ...new Set([...RESOLVER.matchAll(/"(cap(?:Out|Intro)[A-Za-z]+)"/g)].map((m) => m[1])),
  ];
  const frameKeys = ["capWorkspaceNamed", "capPartial", "capUnreadable", "capContinue"];

  it("every phrase exists in ALL five routed locales", () => {
    expect(phraseKeys.length).toBeGreaterThan(10);
    for (const key of [...phraseKeys, ...frameKeys]) {
      for (const locale of ACTIVE_LOCALES) {
        const value = catalogues[locale].conversation.chat[key];
        expect(value, `${key} missing in ${locale}`).toBeTruthy();
        // A next-intl miss resolves a key to ITSELF, which reads as a raw
        // identifier in the product. Only a real sentence passes.
        expect(value, `${key} in ${locale} is the key itself`).not.toBe(key);
      }
    }
  });

  it("no capability id, route, table or role name is spoken to the person", () => {
    const FORBIDDEN = [
      "organization_roles",
      "customer_requests",
      "company_workers",
      "engagement_contexts",
      "training_provider",
      "staffing_agency",
      "/dashboard",
      "RLS",
      "capability",
      "capabilities",
      "intent",
    ];
    for (const key of [...phraseKeys, ...frameKeys]) {
      for (const locale of ACTIVE_LOCALES) {
        const value = catalogues[locale].conversation.chat[key].toLowerCase();
        for (const bad of FORBIDDEN) {
          expect(value, `${key}/${locale} leaks "${bad}"`).not.toContain(bad.toLowerCase());
        }
      }
    }
  });

  it("no phrase carries a placeholder the renderer does not fill", () => {
    // An argument the renderer never supplies renders as a literal brace at
    // the person. `{count}` and `{count, plural, …}` both start `{count`.
    for (const key of phraseKeys) {
      for (const locale of ACTIVE_LOCALES) {
        const value = catalogues[locale].conversation.chat[key];
        const args = [...value.matchAll(/\{([a-z][a-zA-Z]*)\s*[,}]/g)].map((m) => m[1]);
        for (const a of args) {
          expect(a, `${key}/${locale} uses an unsupported argument {${a}}`).toBe("count");
        }
        // …and a count may only appear in a key the selector can actually
        // reach with a count.
        if (args.length > 0) {
          expect(key, `${key} carries {count} but is not a counted variant`).toMatch(/N$/);
        }
      }
    }
  });

  /**
   * NUMBERS AGREE WITH THE NOUN THEY COUNT.
   *
   * The first draft of these phrases interpolated a bare `{count}`, which
   * produced "60 besimokantieji" and "valdyti 1 vykdomus projektus" in
   * Lithuanian and the same class of error in Russian — visibly not language.
   * The repo already uses ICU plurals for exactly this (68 in lt.json); these
   * follow that convention.
   *
   * Lithuanian and Russian select between FOUR categories, so a phrase that
   * only distinguishes one/other is still wrong in those two locales even
   * though it type-checks and renders.
   */
  it("every counted phrase uses a plural, with all the categories its locale needs", () => {
    const counted = phraseKeys.filter((k) => k.endsWith("N"));
    expect(counted.length, "there must be counted variants to check").toBeGreaterThan(0);
    for (const key of counted) {
      for (const locale of ACTIVE_LOCALES) {
        const value = catalogues[locale].conversation.chat[key];
        expect(value, `${key}/${locale} interpolates a bare number`).toMatch(
          /\{count,\s*plural,/,
        );
        if (locale === "lt" || locale === "ru") {
          expect(value, `${key}/${locale} is missing the "few" form`).toMatch(/\bfew\s*\{/);
          expect(value, `${key}/${locale} is missing the "many" form`).toMatch(/\bmany\s*\{/);
        }
        expect(value, `${key}/${locale} is missing the "other" form`).toMatch(/\bother\s*\{/);
      }
    }
  });
});
