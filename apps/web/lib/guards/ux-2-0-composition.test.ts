import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * UX 2.0 — conversation composition.
 *
 * Three audit findings land here:
 *
 *  • BOTH speakers were boxed at an identical 16px rhythm, so the thread read as
 *    alternating table rows rather than an exchange. ChatGPT, Claude and
 *    Perplexity all render assistant prose unboxed; removing that container is
 *    the single change that most makes a chat feel like reading.
 *  • The empty state pinned a generic greeting to the top-left of a large blank
 *    field. Unclaimed space reads as an unfinished page.
 *  • The greeting proved the system knew nothing about the user, while the name
 *    sat unused in the auth context the header already reads.
 *
 * The rule this guard protects: SPEECH is unboxed, OBJECTS are carded. A future
 * "let's make messages look consistent" pass would undo the whole point.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const messages = read("components/app/conversation/chat/messages.tsx");
const thread = read("components/app/conversation/chat/conversation-thread.tsx");
const chat = read("components/app/conversation/chat/conversation-chat.tsx");

/** The block of source that renders one message variant.
 *  Role-qualified on purpose: `m.kind === "text"` matches the USER branch first,
 *  which is exactly the sort of near-miss that makes a guard assert nothing. */
function variant(kind: string, role: "assistant" | "user" = "assistant"): string {
  const marker = `m.role === "${role}" && m.kind === "${kind}"`;
  const start = messages.indexOf(marker);
  expect(start, `variant ${role}/${kind} must exist`).toBeGreaterThan(-1);
  // Up to the next variant branch, or the end of the renderer.
  const next = messages.indexOf("  if (m.role ===", start + marker.length);
  return messages.slice(start, next === -1 ? undefined : next);
}

/**
 * The source of one top-level function declaration, sliced to the next one.
 *
 * A regex ending at the first line-initial `}` stops at the brace that closes
 * the props type annotation, so it captures only the signature — and every
 * assertion against the body then silently passes on an empty string.
 */
function declarationOf(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return "";
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(?:export )?function /);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

describe("speech is unboxed, objects are carded", () => {
  it("assistant speech carries no bubble background", () => {
    for (const kind of ["text", "question"]) {
      const src = variant(kind);
      expect(src, `${kind}: no filled bubble`).not.toMatch(/bg-surface-1\/70/);
      expect(src, `${kind}: no bubble radius`).not.toMatch(/rounded-bubble/);
      expect(src, `${kind}: still reads at body size`).toMatch(/text-body/);
    }
  });

  it("the user's own turn KEEPS a bubble — that asymmetry is the readability win", () => {
    const src = variant("text", "user");
    expect(src, "user speech stays in a bubble").toMatch(/rounded-bubble/);
    expect(src, "and reads at body size too").toMatch(/text-body/);
  });

  it("structured results stay inside a card — they are objects, not speech", () => {
    // Stage 8 moved the shared shell into `CardBody`, so the card is now
    // guaranteed in ONE place instead of repeated per variant. Assert the
    // outcome: the shell really draws a card, and each structured variant uses
    // it (profile-summary composes its own because its chips sit outside).
    const cardBody = declarationOf(messages, "CardBody");
    expect(cardBody, "the shared shell draws the card").toMatch(/rounded-card/);
    for (const kind of ["confirmation", "worklog", "translation"]) {
      expect(variant(kind), `${kind}: uses the shared card shell`).toMatch(/<CardBody/);
    }
    expect(variant("profile-summary"), "summary keeps a card of its own").toMatch(
      /rounded-card/,
    );
  });

  it("the assistant identity survives unboxing", () => {
    // The avatar moved into `AssistantTurn`, so identity is now structural
    // rather than copy-pasted — every turn that uses the wrapper gets it.
    const turn = declarationOf(messages, "AssistantTurn");
    expect(turn, "the wrapper shows who is speaking").toMatch(/<Avatar \/>/);
    for (const kind of ["text", "question"]) {
      expect(variant(kind), `${kind}: uses the wrapper`).toMatch(/<AssistantTurn/);
    }
  });
});

describe("turn-pair rhythm", () => {
  it("spacing is role-aware, not a uniform gap", () => {
    expect(thread).toMatch(/function spacingFor/);
    expect(thread).toMatch(/role === "user"/);
    // A single `gap-*` on the list would flatten the rhythm again.
    expect(thread).not.toMatch(/flex-col gap-4/);
  });

  it("a new pair is spaced wider than a reply", () => {
    const pair = /startsNewPair \? "(mt-\d+)" : "(mt-[\d.]+)"/.exec(thread);
    expect(pair, "both spacings must be declared together").not.toBeNull();
    const num = (c: string): number => Number(c.replace("mt-", ""));
    expect(num(pair![1])).toBeGreaterThan(num(pair![2]));
  });
});

describe("the opening state is composed, not empty", () => {
  it("the thread centres itself while only the greeting is present", () => {
    expect(thread).toMatch(/isOpening/);
    expect(thread).toMatch(/justify-center/);
    expect(thread).toMatch(/kind === "greeting"/);
  });

  it("it exposes the state so a test can assert it", () => {
    expect(thread).toMatch(/data-opening/);
  });

  it("the switch needs no animation, so reduced-motion has nothing to suppress", () => {
    // An animated height/justify change would be the fragile way to do this.
    expect(thread).not.toMatch(/transition-\[/);
    expect(thread).not.toMatch(/animate-/);
  });
});

describe("the greeting knows who it is talking to — honestly", () => {
  it("uses the name already in the auth context, adding no query or API", () => {
    expect(chat).toMatch(/useAuthOptional/);
    expect(chat).toMatch(/full_name/);
    // No new server call was introduced just to decorate the greeting.
    expect(chat).not.toMatch(/fetch\(/);
    expect(chat).not.toMatch(/getWorkerActivity/);
    expect(chat).not.toMatch(/createClient/);
  });

  it("falls back to the neutral greeting rather than inventing a name", () => {
    expect(chat).toMatch(/firstName\s*\n?\s*\?\s*t\("greetingNamed"/);
    expect(chat).toMatch(/:\s*labels\.greeting/);
  });

  it("guards against junk in the name field", () => {
    expect(chat).toMatch(/length <= \d+/);
  });

  it("the named greeting exists in every locale with a {name} placeholder", () => {
    for (const f of readdirSync(join(APP_ROOT, "messages")).filter((n) => n.endsWith(".json"))) {
      const doc = JSON.parse(read(`messages/${f}`)) as {
        conversation: { chat: { greetingNamed?: string } };
      };
      const v = doc.conversation.chat.greetingNamed;
      expect(v, `${f}: greetingNamed`).toBeTruthy();
      expect(v, `${f}: must interpolate the name`).toContain("{name}");
    }
  });
});

describe("assistive tech can follow the conversation", () => {
  it("every turn announces WHO is speaking", () => {
    // The avatar mark is decoration (`aria-hidden`), so without a text label a
    // screen reader cannot tell an assistant turn from the user's own.
    const turn = declarationOf(messages, "AssistantTurn");
    expect(turn, "the wrapper carries a visually-hidden speaker name").toMatch(
      /sr-only[\s\S]{0,40}\{speaker\}/,
    );
    // …and the user's own turns do the same.
    expect(variant("text", "user")).toMatch(/sr-only[\s\S]{0,60}speakers\.user/);
  });

  it("the speaker names are localized, never hard-coded", () => {
    expect(messages).toMatch(/h\.speakers\.assistant/);
    expect(messages).toMatch(/h\.speakers\.user/);
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/speakers: \{ assistant: labels\.assistantName, user: labels\.speakerYou \}/);
    for (const locale of ["lt", "en", "ru"]) {
      const doc = JSON.parse(read(`messages/${locale}.json`)) as {
        conversation: { chat: { speakerYou?: string } };
      };
      expect(doc.conversation.chat.speakerYou, `${locale}.speakerYou`).toBeTruthy();
    }
  });

  it("the thread is a log, so arriving turns are announced", () => {
    expect(thread).toMatch(/role="log"/);
    expect(thread).toMatch(/aria-live="polite"/);
    // Only ADDITIONS — re-announcing the whole thread on every turn would be
    // unusable.
    expect(thread).toMatch(/aria-relevant="additions"/);
  });

  it("the typing indicator is a live status, not a silent animation", () => {
    expect(messages).toMatch(/role="status"[\s\S]{0,60}chat-typing/);
  });
});
