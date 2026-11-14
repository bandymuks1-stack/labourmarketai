import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The conversation asks for a missing detail with a key built at run time:
 * `t(`valueIntent.ask.${field}`)` in conversation-chat.tsx. No static check
 * sees such a key, so a catalog edit can delete the group unnoticed — it
 * happened on 2026-11-12, when a careless removal of another `ask` group took
 * this one instead and every check stayed green (found by review).
 *
 * This pins the group in every catalog that carries the conversation.
 */
const APP_ROOT = resolve(__dirname, "..", "..");
const FIELDS = ["location", "window", "quantity", "headcount", "team_size"] as const;

describe("the conversation's clarification questions exist", () => {
  it("the chat still builds the key at run time (so this guard is needed)", () => {
    const chat = readFileSync(
      join(APP_ROOT, "components/app/conversation/chat/conversation-chat.tsx"),
      "utf8",
    );
    expect(chat).toMatch(/valueIntent\.ask\.\$\{/);
  });

  const catalogs = readdirSync(join(APP_ROOT, "messages")).filter((f) => f.endsWith(".json"));
  it.each(catalogs)("%s: every catalog with the conversation has all five questions", (file) => {
    const messages = JSON.parse(readFileSync(join(APP_ROOT, "messages", file), "utf8")) as {
      conversation?: { chat?: { valueIntent?: { ask?: Record<string, unknown> } } };
    };
    const valueIntent = messages.conversation?.chat?.valueIntent;
    // A catalog that does not carry the value-intent replies at all is not
    // this guard's business; one that does must carry every question.
    if (!valueIntent) return;
    for (const field of FIELDS) {
      const value = valueIntent.ask?.[field];
      expect(typeof value, `${file}: conversation.chat.valueIntent.ask.${field}`).toBe("string");
      expect((value as string).trim()).not.toBe("");
    }
  });
});
