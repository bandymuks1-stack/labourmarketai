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
    for (const kind of ["confirmation", "worklog", "translation", "profile-summary"]) {
      expect(variant(kind), `${kind}: keeps its card`).toMatch(/rounded-card/);
    }
  });

  it("the assistant identity survives unboxing", () => {
    for (const kind of ["text", "question"]) {
      expect(variant(kind), `${kind}: still shows who is speaking`).toMatch(/<Avatar \/>/);
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
